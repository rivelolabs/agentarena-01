import type { FastifyReply, FastifyRequest } from "fastify";
import { jwtVerify, SignJWT } from "jose";
import { env } from "../env";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = "error"
  ) {
    super(message);
  }
}

export const badRequest = (m: string, code = "bad_request") => new HttpError(400, m, code);
export const unauthorized = (m = "Sign in with your wallet first") => new HttpError(401, m, "unauthorized");
export const forbidden = (m = "Not allowed") => new HttpError(403, m, "forbidden");
export const notFound = (m = "Not found") => new HttpError(404, m, "not_found");
export const conflict = (m: string, code = "conflict") => new HttpError(409, m, code);

const secret = new TextEncoder().encode(env.JWT_SECRET);

export interface AuthClaims {
  uid: string;
  /** The wallet linked when the token was issued. Null for Google accounts with no wallet yet. */
  wallet: string | null;
}

export async function issueToken(claims: AuthClaims): Promise<string> {
  return new SignJWT(claims.wallet ? { wallet: claims.wallet } : {})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.uid)
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret);
}

export async function readAuth(req: FastifyRequest): Promise<AuthClaims | null> {
  const h = req.headers.authorization;
  if (!h?.startsWith("Bearer ")) return null;
  try {
    const { payload } = await jwtVerify(h.slice(7), secret);
    if (!payload.sub) return null;
    return { uid: payload.sub, wallet: typeof payload.wallet === "string" ? payload.wallet : null };
  } catch {
    return null;
  }
}

export async function requireAuth(req: FastifyRequest): Promise<AuthClaims> {
  const a = await readAuth(req);
  if (!a) throw unauthorized();
  return a;
}

export function sendError(reply: FastifyReply, err: unknown) {
  if (err instanceof HttpError) return reply.status(err.status).send({ error: err.code, message: err.message });
  const zodLike = err as { issues?: { path: (string | number)[]; message: string }[] };
  if (zodLike?.issues) {
    const msg = zodLike.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ");
    return reply.status(400).send({ error: "validation", message: msg });
  }
  return null;
}
