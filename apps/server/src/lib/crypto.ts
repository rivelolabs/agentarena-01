import crypto from "node:crypto";
import { env } from "../env";

/** AES-256-GCM encryption for user-supplied LLM API keys. Keys never leave the server in plaintext. */
function key(): Buffer {
  const raw = env.ENCRYPTION_KEY.trim();
  let buf: Buffer;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) buf = Buffer.from(raw, "hex");
  else {
    buf = Buffer.from(raw, "base64");
    if (buf.length !== 32) buf = crypto.createHash("sha256").update(raw).digest();
  }
  return buf;
}

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv.toString("base64"), tag.toString("base64"), enc.toString("base64")].join(".");
}

export function decryptSecret(payload: string): string {
  const [v, ivB, tagB, encB] = payload.split(".");
  if (v !== "v1") throw new Error("Unknown secret format");
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB, "base64"));
  decipher.setAuthTag(Buffer.from(tagB, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(encB, "base64")), decipher.final()]).toString("utf8");
}

export function randomToken(bytes = 16): string {
  return crypto.randomBytes(bytes).toString("hex");
}
