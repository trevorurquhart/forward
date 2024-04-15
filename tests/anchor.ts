import * as anchor from "@coral-xyz/anchor";
import * as web3 from "@solana/web3.js";
// import {
//   createMint,
//   createAssociatedTokenAccount,
//   mintTo,
//   TOKEN_PROGRAM_ID,
// } from "@solana/spl-token";
import type { Forward } from "../target/types/forward";

describe("Test forward", () => {
  // Configure the client to use the local cluster
  anchor.setProvider(anchor.AnchorProvider.env());

  const program = anchor.workspace.Forward as anchor.Program<Forward>;
  
  it("test forwarding SOL", async () => {

    const forwardId = 104;
    const destinationKp = new web3.Keypair();
    const quarantineKp = new web3.Keypair();

    const [forward] = web3.PublicKey.findProgramAddressSync(
      [Buffer.from("forward"), destinationKp.publicKey.toBuffer(), new anchor.BN(forwardId).toArrayLike(Buffer, "le", 8)],
      program.programId
    );

    // console.log("Calcuated pda as: ", forward.toString());

    const txInitialiase = await program.methods
      .initialize(new anchor.BN(forwardId), quarantineKp.publicKey)
      .accounts({
        forward: forward,
        destination: destinationKp.publicKey,
      })
      .signers([program.provider.wallet.payer])
      .rpc();

    // console.log(`https://explorer.solana.com/tx/${txInitialiase}?cluster=devnet`);
    await program.provider.connection.confirmTransaction(txInitialiase, "finalized");


    let blockhash = await program.provider.connection.getLatestBlockhash().then(res => res.blockhash);
    const instructions = [web3.SystemProgram.transfer({
        fromPubkey: program.provider.publicKey,
        toPubkey: forward,
        lamports: web3.LAMPORTS_PER_SOL / 100
      })];

    const messageV0 = new web3.TransactionMessage({
      payerKey: program.provider.publicKey,
      recentBlockhash: blockhash,
      instructions
    }).compileToV0Message();
    const transaction = new web3.VersionedTransaction(messageV0);
    transaction.sign([program.provider.wallet.payer]);
    const txDeposit = await program.provider.connection.sendTransaction(transaction);

    // console.log(`https://explorer.solana.com/tx/${txDeposit}?cluster=devnet`);
    await program.provider.connection.confirmTransaction(txDeposit, "finalized");

    const txExecute = await program.methods
        .forwardSol()
        .accounts({
          forward: forward,
          destination: destinationKp.publicKey
        })
        .signers([program.provider.wallet.payer])
        .rpc();

    // console.log(`https://explorer.solana.com/tx/${txExecute}?cluster=devnet`);
    await program.provider.connection.confirmTransaction(txExecute, "finalized");

  });

});