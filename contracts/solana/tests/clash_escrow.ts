import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { expect } from "chai";
import { ClashEscrow } from "../target/types/clash_escrow";

const { SystemProgram, Keypair, LAMPORTS_PER_SOL, PublicKey } = anchor.web3;

describe("clash_escrow", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  const program = anchor.workspace.ClashEscrow as Program<ClashEscrow>;

  const oracle = Keypair.generate();
  const treasury = Keypair.generate();
  const playerA = Keypair.generate();
  const playerB = Keypair.generate();
  const stake = new anchor.BN(0.5 * LAMPORTS_PER_SOL);
  const [configPda] = PublicKey.findProgramAddressSync([Buffer.from("config")], program.programId);

  const matchPda = (id: Buffer) => PublicKey.findProgramAddressSync([Buffer.from("match"), id], program.programId)[0];
  const newId = () => Buffer.from(Keypair.generate().publicKey.toBytes().subarray(0, 16));

  async function airdrop(pk: anchor.web3.PublicKey, sol = 5) {
    const sig = await provider.connection.requestAirdrop(pk, sol * LAMPORTS_PER_SOL);
    await provider.connection.confirmTransaction(sig, "confirmed");
  }

  before(async () => {
    await Promise.all([airdrop(playerA.publicKey), airdrop(playerB.publicKey), airdrop(oracle.publicKey, 1)]);
    await program.methods
      .initialize(oracle.publicKey, treasury.publicKey, 500)
      .accounts({ admin: provider.wallet.publicKey })
      .rpc();
  });

  it("pays the winner minus the fee", async () => {
    const id = newId();
    const m = matchPda(id);
    await program.methods.createMatch([...id], stake).accounts({ playerA: playerA.publicKey }).signers([playerA]).rpc();
    await program.methods.joinMatch().accounts({ matchAccount: m, playerB: playerB.publicKey }).signers([playerB]).rpc();

    const before = await provider.connection.getBalance(playerB.publicKey);
    await program.methods
      .settle(1)
      .accounts({ matchAccount: m, oracle: oracle.publicKey, playerA: playerA.publicKey, playerB: playerB.publicKey, treasury: treasury.publicKey })
      .signers([oracle])
      .rpc();
    const after = await provider.connection.getBalance(playerB.publicKey);
    const pot = stake.toNumber() * 2;
    expect(after - before).to.equal(pot - pot * 0.05);
    expect(await provider.connection.getBalance(treasury.publicKey)).to.equal(pot * 0.05);
    expect(await provider.connection.getAccountInfo(m)).to.equal(null);
  });

  it("refunds both players on a draw", async () => {
    const id = newId();
    const m = matchPda(id);
    await program.methods.createMatch([...id], stake).accounts({ playerA: playerA.publicKey }).signers([playerA]).rpc();
    await program.methods.joinMatch().accounts({ matchAccount: m, playerB: playerB.publicKey }).signers([playerB]).rpc();
    const b0 = await provider.connection.getBalance(playerB.publicKey);
    await program.methods
      .settle(2)
      .accounts({ matchAccount: m, oracle: oracle.publicKey, playerA: playerA.publicKey, playerB: playerB.publicKey, treasury: treasury.publicKey })
      .signers([oracle])
      .rpc();
    expect((await provider.connection.getBalance(playerB.publicKey)) - b0).to.equal(stake.toNumber());
  });

  it("rejects settlement from anyone but the oracle", async () => {
    const id = newId();
    const m = matchPda(id);
    await program.methods.createMatch([...id], stake).accounts({ playerA: playerA.publicKey }).signers([playerA]).rpc();
    await program.methods.joinMatch().accounts({ matchAccount: m, playerB: playerB.publicKey }).signers([playerB]).rpc();
    let failed = false;
    try {
      await program.methods
        .settle(0)
        .accounts({ matchAccount: m, oracle: playerA.publicKey, playerA: playerA.publicKey, playerB: playerB.publicKey, treasury: treasury.publicKey })
        .signers([playerA])
        .rpc();
    } catch {
      failed = true;
    }
    expect(failed).to.equal(true);
  });

  it("lets player A cancel an unjoined match", async () => {
    const id = newId();
    const m = matchPda(id);
    await program.methods.createMatch([...id], stake).accounts({ playerA: playerA.publicKey }).signers([playerA]).rpc();
    await program.methods.cancelMatch().accounts({ matchAccount: m, playerA: playerA.publicKey }).signers([playerA]).rpc();
    expect(await provider.connection.getAccountInfo(m)).to.equal(null);
  });

  it("prevents self-matches", async () => {
    const id = newId();
    const m = matchPda(id);
    await program.methods.createMatch([...id], stake).accounts({ playerA: playerA.publicKey }).signers([playerA]).rpc();
    let failed = false;
    try {
      await program.methods.joinMatch().accounts({ matchAccount: m, playerB: playerA.publicKey }).signers([playerA]).rpc();
    } catch {
      failed = true;
    }
    expect(failed).to.equal(true);
  });
});
