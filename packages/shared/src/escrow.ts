/**
 * Client + server helpers for the open-source `clash_escrow` Anchor program
 * (see /contracts/solana). Instructions are encoded by hand (Anchor
 * discriminator + Borsh args) so no IDL or Anchor runtime is required.
 */
import { PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";
import { Buffer } from "buffer";

// sha256("global:<name>")[0..8] and sha256("account:<Name>")[0..8]
const DISC = {
  initialize: [175, 175, 109, 31, 13, 152, 155, 237],
  update_config: [29, 158, 252, 191, 10, 83, 219, 99],
  create_match: [107, 2, 184, 145, 70, 142, 17, 165],
  join_match: [244, 8, 47, 130, 192, 59, 179, 44],
  settle: [175, 42, 185, 87, 144, 131, 102, 212],
  cancel_match: [142, 136, 247, 45, 92, 112, 180, 83],
  refund_expired: [118, 153, 164, 244, 40, 128, 242, 250],
} as const;
export const MATCH_ACCOUNT_DISCRIMINATOR = [236, 63, 169, 38, 15, 56, 196, 162];
export const CONFIG_ACCOUNT_DISCRIMINATOR = [155, 12, 170, 224, 30, 250, 204, 130];

export const ESCROW_STATUS = { open: 0, active: 1, settled: 2, cancelled: 3 } as const;
export const OUTCOME = { a: 0, b: 1, draw: 2 } as const;

const enc = new TextEncoder();

/** 16 raw bytes from a UUID string (dashes removed). */
export function matchIdBytes(uuid: string): Uint8Array {
  const hex = uuid.replace(/-/g, "");
  if (!/^[0-9a-fA-F]{32}$/.test(hex)) throw new Error("matchId must be a UUID");
  const out = new Uint8Array(16);
  for (let i = 0; i < 16; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export function configPda(programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([enc.encode("config")], programId)[0];
}

export function matchPda(programId: PublicKey, uuid: string): PublicKey {
  return PublicKey.findProgramAddressSync([enc.encode("match"), matchIdBytes(uuid)], programId)[0];
}

function u64le(n: bigint): Uint8Array {
  const b = new Uint8Array(8);
  let v = n;
  for (let i = 0; i < 8; i++) {
    b[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return b;
}

function concat(...parts: (Uint8Array | readonly number[])[]): Buffer {
  return Buffer.concat(parts.map((p) => Buffer.from(p as Uint8Array)));
}

export function initializeIx(programId: PublicKey, admin: PublicKey, oracle: PublicKey, treasury: PublicKey, feeBps: number) {
  const fee = new Uint8Array([feeBps & 0xff, (feeBps >> 8) & 0xff]);
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: configPda(programId), isSigner: false, isWritable: true },
      { pubkey: admin, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: concat(DISC.initialize, oracle.toBytes(), treasury.toBytes(), fee),
  });
}

export function createMatchIx(programId: PublicKey, playerA: PublicKey, uuid: string, stakeLamports: bigint) {
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: configPda(programId), isSigner: false, isWritable: false },
      { pubkey: matchPda(programId, uuid), isSigner: false, isWritable: true },
      { pubkey: playerA, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: concat(DISC.create_match, matchIdBytes(uuid), u64le(stakeLamports)),
  });
}

export function joinMatchIx(programId: PublicKey, playerB: PublicKey, uuid: string) {
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: configPda(programId), isSigner: false, isWritable: false },
      { pubkey: matchPda(programId, uuid), isSigner: false, isWritable: true },
      { pubkey: playerB, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: concat(DISC.join_match),
  });
}

export function settleIx(
  programId: PublicKey,
  oracle: PublicKey,
  uuid: string,
  playerA: PublicKey,
  playerB: PublicKey,
  treasury: PublicKey,
  outcome: number
) {
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: configPda(programId), isSigner: false, isWritable: false },
      { pubkey: matchPda(programId, uuid), isSigner: false, isWritable: true },
      { pubkey: oracle, isSigner: true, isWritable: false },
      { pubkey: playerA, isSigner: false, isWritable: true },
      { pubkey: playerB, isSigner: false, isWritable: true },
      { pubkey: treasury, isSigner: false, isWritable: true },
    ],
    data: concat(DISC.settle, [outcome]),
  });
}

export function cancelMatchIx(programId: PublicKey, playerA: PublicKey, uuid: string) {
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: matchPda(programId, uuid), isSigner: false, isWritable: true },
      { pubkey: playerA, isSigner: true, isWritable: true },
    ],
    data: concat(DISC.cancel_match),
  });
}

export function refundExpiredIx(programId: PublicKey, uuid: string, playerA: PublicKey, playerB: PublicKey) {
  return new TransactionInstruction({
    programId,
    keys: [
      { pubkey: matchPda(programId, uuid), isSigner: false, isWritable: true },
      { pubkey: playerA, isSigner: false, isWritable: true },
      { pubkey: playerB, isSigner: false, isWritable: true },
    ],
    data: concat(DISC.refund_expired),
  });
}

export interface EscrowMatchAccount {
  matchId: Uint8Array;
  playerA: PublicKey;
  playerB: PublicKey;
  stake: bigint;
  status: number;
  createdAt: bigint;
  joinedAt: bigint;
  winner: number;
  bump: number;
}

/** Decode the on-chain `Match` account (layout mirrors contracts/solana/programs/clash_escrow/src/state.rs). */
export function decodeMatchAccount(data: Uint8Array): EscrowMatchAccount {
  const b = Buffer.from(data);
  for (let i = 0; i < 8; i++) if (b[i] !== MATCH_ACCOUNT_DISCRIMINATOR[i]) throw new Error("Not a Match account");
  let o = 8;
  const matchId = new Uint8Array(b.subarray(o, o + 16));
  o += 16;
  const playerA = new PublicKey(b.subarray(o, o + 32));
  o += 32;
  const playerB = new PublicKey(b.subarray(o, o + 32));
  o += 32;
  const stake = b.readBigUInt64LE(o);
  o += 8;
  const status = b.readUInt8(o);
  o += 1;
  const createdAt = b.readBigInt64LE(o);
  o += 8;
  const joinedAt = b.readBigInt64LE(o);
  o += 8;
  const winner = b.readUInt8(o);
  o += 1;
  const bump = b.readUInt8(o);
  return { matchId, playerA, playerB, stake, status, createdAt, joinedAt, winner, bump };
}
