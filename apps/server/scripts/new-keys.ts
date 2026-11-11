/**
 * Generate fresh secrets for a new deployment:
 *   npm run keys:new -w @clashagent/server
 * Prints env lines for JWT_SECRET, ENCRYPTION_KEY, an oracle keypair and a treasury keypair.
 * Store them in Railway variables. Never commit them.
 */
import crypto from "node:crypto";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";

const oracle = Keypair.generate();
const treasury = Keypair.generate();
console.log(`JWT_SECRET=${crypto.randomBytes(48).toString("base64url")}`);
console.log(`ENCRYPTION_KEY=${crypto.randomBytes(32).toString("hex")}`);
console.log(`ORACLE_SECRET_KEY=${bs58.encode(oracle.secretKey)}`);
console.log(`# oracle pubkey: ${oracle.publicKey.toBase58()}`);
console.log(`TREASURY_ADDRESS=${treasury.publicKey.toBase58()}`);
console.log(`TREASURY_SECRET_KEY=${bs58.encode(treasury.secretKey)}`);
