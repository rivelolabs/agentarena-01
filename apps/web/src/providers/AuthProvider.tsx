"use client";
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import bs58 from "bs58";
import { toast } from "sonner";
import { api, setApiToken } from "@/lib/api";
import { mutate } from "swr";
import { googleSignedOut } from "@/components/wallet/GoogleButton";

export interface Me {
  id: string;
  /** Linked Solana wallet. Null for someone who signed in with Google and has not linked one yet. */
  wallet: string | null;
  email?: string | null;
  /** A Google account is linked */
  google?: boolean;
  handle: string | null;
  /** SOL balance held by AgentsWar, in lamports */
  credits: number;
  /** Free play credits (whole units) */
  playCredits: number;
  acceptedTerms: boolean;
}

interface AuthCtx {
  user: Me | null;
  ready: boolean;
  signingIn: boolean;
  /** How this session was started. Google sessions do not depend on which wallet is connected. */
  via: "wallet" | "google" | null;
  signIn: (acceptTerms?: boolean) => Promise<boolean>;
  signInWithGoogle: (credential: string, acceptTerms?: boolean) => Promise<boolean>;
  /** Attach the connected wallet to the signed-in account (asks for a free signature). */
  linkWallet: () => Promise<boolean>;
  linkGoogle: (credential: string) => Promise<boolean>;
  signOut: () => void;
  refresh: () => Promise<void>;
}

const Ctx = createContext<AuthCtx>(null!);
const KEY = "clashagent:session";

interface Session {
  token: string;
  wallet: string | null;
  via?: "wallet" | "google";
}

function load(): Session | null {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "null");
  } catch {
    return null;
  }
}

function save(s: Session) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {}
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { publicKey, signMessage, disconnect, connected } = useWallet();
  const [user, setUser] = useState<Me | null>(null);
  const [ready, setReady] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [via, setVia] = useState<"wallet" | "google" | null>(null);

  const refresh = useCallback(async () => {
    try {
      const r = await api<{ user: Me }>("/me");
      setUser(r.user);
    } catch {
      setUser(null);
      setVia(null);
      setApiToken(null);
      try {
        localStorage.removeItem(KEY);
      } catch {}
    }
  }, []);

  // Restore the saved session. A wallet session belongs to one wallet; a Google session
  // stays signed in whichever wallet is (or is not) connected.
  useEffect(() => {
    const s = load();
    const wallet = publicKey?.toBase58();
    if (s && (s.via === "google" || !wallet || s.wallet === wallet)) {
      setApiToken(s.token);
      setVia(s.via ?? "wallet");
      refresh().finally(() => setReady(true));
    } else {
      if (s && wallet && s.wallet !== wallet) {
        // Switched wallets: drop the old session.
        setApiToken(null);
        setUser(null);
        setVia(null);
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
        save({ token: r.token, wallet, via: "wallet" });
        setVia("wallet");
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

  const signInWithGoogle = useCallback(async (credential: string, acceptTerms = true) => {
    setSigningIn(true);
    try {
      const r = await api<{ token: string; user: Me }>("/auth/google", { body: { credential, acceptTerms } });
      setApiToken(r.token);
      save({ token: r.token, wallet: r.user.wallet, via: "google" });
      setVia("google");
      setUser(r.user);
      mutate(() => true, undefined, { revalidate: true });
      toast.success("Signed in. Welcome to the arena.");
      return true;
    } catch (e) {
      toast.error((e as Error).message);
      return false;
    } finally {
      setSigningIn(false);
    }
  }, []);

  const linkWallet = useCallback(async () => {
    if (!publicKey || !signMessage) {
      toast.error("Connect a wallet that supports message signing");
      return false;
    }
    setSigningIn(true);
    try {
      const wallet = publicKey.toBase58();
      const { nonce, message } = await api<{ nonce: string; message: string }>("/auth/nonce", { body: { wallet } });
      const sig = await signMessage(new TextEncoder().encode(message));
      const r = await api<{ token: string; user: Me }>("/auth/link/wallet", { body: { wallet, nonce, signature: bs58.encode(sig) } });
      setApiToken(r.token);
      save({ token: r.token, wallet: r.user.wallet, via: load()?.via ?? "google" });
      setUser(r.user);
      toast.success("Wallet linked to your account.");
      return true;
    } catch (e) {
      const msg = (e as Error).message;
      if (!/reject|cancel|denied/i.test(msg)) toast.error(msg);
      return false;
    } finally {
      setSigningIn(false);
    }
  }, [publicKey, signMessage]);

  const linkGoogle = useCallback(async (credential: string) => {
    try {
      const r = await api<{ user: Me }>("/auth/link/google", { body: { credential } });
      setUser(r.user);
      toast.success("Google account linked. You can sign in with either one now.");
      return true;
    } catch (e) {
      toast.error((e as Error).message);
      return false;
    }
  }, []);

  const signOut = useCallback(() => {
    setApiToken(null);
    setUser(null);
    setVia(null);
    try {
      localStorage.removeItem(KEY);
    } catch {}
    googleSignedOut();
    disconnect().catch(() => {});
  }, [disconnect]);

  useEffect(() => {
    if (!connected && user && ready) {
      // Wallet disconnected from the extension; keep the session but it will be re-checked on reconnect.
    }
  }, [connected, user, ready]);

  return <Ctx.Provider value={{ user, ready, signingIn, via, signIn, signInWithGoogle, linkWallet, linkGoogle, signOut, refresh }}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
