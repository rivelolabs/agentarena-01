"use client";
import { useEffect, useRef, useState } from "react";
import clsx from "clsx";

/**
 * "Continue with Google" button (Google Identity Services).
 * Google's script is only fetched when this button is first shown, so it adds nothing to
 * normal page loads. The button hands back an ID token, which the server verifies.
 */
const GSI_SRC = "https://accounts.google.com/gsi/client";

interface GsiId {
  initialize(o: { client_id: string; callback: (r: { credential?: string }) => void; auto_select?: boolean; ux_mode?: "popup" }): void;
  renderButton(el: HTMLElement, o: Record<string, string | number>): void;
  disableAutoSelect(): void;
}
const gsi = (): GsiId | undefined => (window as unknown as { google?: { accounts?: { id?: GsiId } } }).google?.accounts?.id;

let loading: Promise<void> | null = null;
function loadGsi(): Promise<void> {
  if (gsi()) return Promise.resolve();
  if (!loading) {
    loading = new Promise<void>((resolve, reject) => {
      const s = document.createElement("script");
      s.src = GSI_SRC;
      s.async = true;
      s.onload = () => (gsi() ? resolve() : reject(new Error("Google sign-in failed to start")));
      s.onerror = () => {
        loading = null; // let a later attempt retry
        s.remove();
        reject(new Error("Could not reach Google"));
      };
      document.head.appendChild(s);
    });
  }
  return loading;
}

/** Forget the Google session hint on sign-out, so the next visitor on this device is asked again. */
export function googleSignedOut() {
  try {
    gsi()?.disableAutoSelect();
  } catch {
    /* script never loaded: nothing to forget */
  }
}

export function GoogleButton({
  clientId,
  onCredential,
  disabled,
  label = "continue_with",
}: {
  clientId: string;
  onCredential: (credential: string) => void;
  disabled?: boolean;
  label?: "continue_with" | "signin_with";
}) {
  const host = useRef<HTMLDivElement>(null);
  const cb = useRef(onCredential);
  cb.current = onCredential;
  const [state, setState] = useState<"loading" | "ready" | "failed">("loading");

  useEffect(() => {
    let gone = false;
    loadGsi()
      .then(() => {
        const id = gsi();
        if (gone || !host.current || !id) return;
        id.initialize({ client_id: clientId, auto_select: false, ux_mode: "popup", callback: (r) => r.credential && cb.current(r.credential) });
        id.renderButton(host.current, {
          type: "standard",
          theme: "filled_black",
          size: "large",
          shape: "rectangular",
          text: label,
          logo_alignment: "left",
          width: Math.max(220, Math.min(400, Math.ceil(host.current.offsetWidth))),
        });
        setState("ready");
      })
      .catch(() => !gone && setState("failed"));
    return () => {
      gone = true;
    };
  }, [clientId, label]);

  // Our own button is what people see. Google's real button sits on top of it, invisible,
  // so the click still goes to Google and the sign-in stays genuine.
  const idle = disabled || state !== "ready";
  return (
    <div>
      <div
        className={clsx(
          "relative mx-auto h-11 w-full max-w-[400px] overflow-hidden rounded-[10px] transition",
          idle ? "opacity-50" : "hover:brightness-95 active:scale-[0.99]"
        )}
        aria-disabled={disabled || undefined}
      >
        <div className="pointer-events-none flex h-full w-full items-center justify-center gap-3 bg-[#f2f2f2] text-[15px] font-medium text-[#111]">
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
          </svg>
          {state === "loading" ? "Loading Google…" : label === "signin_with" ? "Sign in with Google" : "Continue with Google"}
        </div>
        <div ref={host} className={clsx("absolute inset-0 opacity-[0.01]", disabled && "pointer-events-none")} />
      </div>
      {state === "failed" && (
        <p className="mt-2 text-center text-xs text-muted">Google sign-in could not load. Check your connection or an ad blocker, then reopen this window.</p>
      )}
    </div>
  );
}
