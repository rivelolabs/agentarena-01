"use client";
import { ReactNode, useMemo } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { SWRConfig } from "swr";
import { Toaster } from "sonner";
import { fetcher } from "@/lib/api";
import { AuthProvider } from "./AuthProvider";
import { useConfig } from "@/lib/hooks";

function SolanaProviders({ children }: { children: ReactNode }) {
  const { config } = useConfig();
  const endpoint = config?.rpcUrl ?? process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
  // Phantom, Backpack, Solflare… all register through the Wallet Standard, so no adapters are needed.
  const wallets = useMemo(() => [], []);
  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider wallets={wallets} autoConnect localStorageKey="clashagent:wallet">
        <AuthProvider>{children}</AuthProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SWRConfig value={{ fetcher, revalidateOnFocus: false, shouldRetryOnError: false }}>
      <SolanaProviders>{children}</SolanaProviders>
      <Toaster
        theme="dark"
        position="bottom-right"
        toastOptions={{ style: { background: "#18181a", border: "1px solid rgba(255,255,255,0.1)", color: "#ededee", fontFamily: "var(--font-sans)" } }}
      />
    </SWRConfig>
  );
}
