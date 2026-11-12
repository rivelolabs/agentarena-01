/**
 * Google sign-in. The browser gets an ID token from Google Identity Services and posts it
 * here; we check Google's signature, that the token was issued for our client ID, and that
 * the email is verified. No client secret and no redirect flow are involved.
 */
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import { env, googleClientIds } from "../env";

const GOOGLE_CERTS = "https://www.googleapis.com/oauth2/v3/certs";
const ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

export interface GoogleProfile {
  sub: string;
  email: string;
  name: string | null;
}

let remoteKeys: JWTVerifyGetKey | null = null;
function googleKeys(): JWTVerifyGetKey {
  if (!remoteKeys) {
    const override = env.NODE_ENV !== "production" ? env.GOOGLE_CERTS_URL : undefined;
    remoteKeys = createRemoteJWKSet(new URL(override || GOOGLE_CERTS));
  }
  return remoteKeys;
}

/**
 * Verify a Google ID token. Throws an Error with a message that is safe to show the user.
 * `keys` and `audience` exist so the rules can be unit-tested without the network.
 */
export async function verifyGoogleCredential(
  credential: string,
  opts: { keys?: JWTVerifyGetKey; audience?: string[] } = {}
): Promise<GoogleProfile> {
  const audience = opts.audience ?? googleClientIds;
  if (!audience.length) throw new Error("Google sign-in is not set up on this server");
  let payload;
  try {
    ({ payload } = await jwtVerify(credential, opts.keys ?? googleKeys(), {
      issuer: ISSUERS,
      audience,
      algorithms: ["RS256"],
      clockTolerance: 30,
    }));
  } catch {
    throw new Error("Google sign-in could not be verified. Please try again.");
  }
  const verified = payload.email_verified === true || payload.email_verified === "true";
  if (!payload.sub || typeof payload.email !== "string" || !verified) {
    throw new Error("Your Google account needs a verified email address");
  }
  return {
    sub: payload.sub,
    email: payload.email.toLowerCase(),
    name: typeof payload.name === "string" ? payload.name : null,
  };
}

/** A starting display name for a new Google account: "Sourya Singh" → "Sourya_Singh". */
export function handleFromProfile(p: GoogleProfile): string {
  const raw = (p.name ?? p.email.split("@")[0]).normalize("NFKD");
  const clean = raw
    .replace(/[^a-zA-Z0-9_. -]+/g, "")
    .trim()
    .replace(/\s+/g, "_")
    .slice(0, 24)
    .replace(/[_.-]+$/, "");
  return clean.length >= 2 ? clean : "Fighter";
}
