"use client";
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import bs58 from "bs58";
import { toast } from "sonner";
import { api, setApiToken } from "@/lib/api";
import { mutate } from "swr";

export interface Me {
  id: string;
  wallet: string;
  handle: string | null;
  credits: number;
  acceptedTerms: boolean;
}

interface AuthCtx {
  user: Me | null;
  ready: boolean;
  signingIn: boolean;
  signIn: (acceptTerms?: boolean) => Promise<boolean>;
  signOut: () => void;
  refresh: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>(null!);
const KEY = "clashagent:session";

function load(): { token: string; wallet: string } | null {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "null");
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { publicKey, signMessage, disconnect, connected } = useWallet();
  const [user, setUser] = useState<Me | null>(null);
  const [ready, setReady] = useState(false);
  const [signingIn, setSigningIn] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const r = await api<{ user: Me }>("/me");
      setUser(r.user);
    } catch {
      setUser(null);
      setApiToken(null);
      try {
        localStorage.removeItem(KEY);
      } catch {}
    }
  }, []);

  // Restore session for the connected wallet.
  useEffect(() => {
    const s = load();
    const wallet = publicKey?.toBase58();
    if (s && (!wallet || s.wallet === wallet)) {
      setApiToken(s.token);
      refresh().finally(() => setReady(true));
    } else {
      if (s && wallet && s.wallet !== wallet) {
        // Switched wallets: drop the old session.
        setApiToken(null);
        setUser(null);
        try {
          localStorage.removeItem(KEY);
        } catch {}
      }
      setReady(true);
    }
  }, [publicKey, refresh]);

  const signIn = useCallback(
    async (acceptTerms = true) => {
      if (!publicKey || !signMessage) {
        toast.error("Connect a wallet that supports message signing");
        return false;
      }
      setSigningIn(true);
      try {
        const wallet = publicKey.toBase58();
        const { nonce, message } = await api<{ nonce: string; message: string }>("/auth/nonce", { body: { wallet } });
        const sig = await signMessage(new TextEncoder().encode(message));
        const r = await api<{ token: string; user: Me }>("/auth/verify", {
          body: { wallet, nonce, signature: bs58.encode(sig), acceptTerms },
        });
        setApiToken(r.token);
        try {
          localStorage.setItem(KEY, JSON.stringify({ token: r.token, wallet }));
        } catch {}
        setUser(r.user);
        mutate(() => true, undefined, { revalidate: true });
        toast.success("Signed in. Welcome to the arena.");
        return true;
      } catch (e) {
        const msg = (e as Error).message;
        if (!/reject|cancel|denied/i.test(msg)) toast.error(msg);
        return false;
      } finally {
        setSigningIn(false);
      }
    },
    [publicKey, signMessage]
  );

  const signOut = useCallback(() => {
    setApiToken(null);
    setUser(null);
    try {
      localStorage.removeItem(KEY);
    } catch {}
    disconnect().catch(() => {});
  }, [disconnect]);

  useEffect(() => {
    if (!connected && user && ready) {
      // Wallet disconnected from the extension; keep the session but it will be re-checked on reconnect.
    }
  }, [connected, user, ready]);

  return <Ctx.Provider value={{ user, ready, signingIn, signIn, signOut, refresh }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
