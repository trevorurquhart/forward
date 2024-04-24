import * as anchor from "@coral-xyz/anchor";
import {AnchorError, BN} from "@coral-xyz/anchor";
import * as web3 from "@solana/web3.js";
import {assert, expect} from "chai";
// import {
//   createMint,
//   createAssociatedTokenAccount,
//   mintTo,
//   TOKEN_PROGRAM_ID,
// } from "@solana/spl-token";
import type {Forward} from "../target/types/forward";
import {deposit} from "./fn";
import {createAssociatedTokenAccount, createMint, mintTo, TOKEN_PROGRAM_ID} from "@solana/spl-token";

describe("Test forward", () => {

    const forwardId = 104;
    let destinationKp;
    let quarantineKp;
    let forward;

    // Configure the client to use the local cluster
    anchor.setProvider(anchor.AnchorProvider.env());
    const program = anchor.workspace.Forward as anchor.Program<Forward>;
    const provider = program.provider;
    const wallet = provider.wallet;
    const connection = provider.connection;

    beforeEach(async () => {

        destinationKp = new web3.Keypair();
        quarantineKp = new web3.Keypair();

        [forward] = web3.PublicKey.findProgramAddressSync(
            [Buffer.from("forward"), destinationKp.publicKey.toBuffer(), new anchor.BN(forwardId).toArrayLike(Buffer, "le", 8)],
            program.programId
        );

        //Create the forward
        const txInitialise = await program.methods
            .initialize(new anchor.BN(forwardId), quarantineKp.publicKey)
            .accounts({
                forward: forward,
                destination: destinationKp.publicKey,
            })
            .signers([wallet.payer])
            .rpc();

        console.log(`Waiting for ${txInitialise} to finalise`);
        await connection.confirmTransaction(txInitialise, "finalized");
        console.log(`Done`);

    });

    // it("test forwarding SOL", async () => {
    //
    //     await deposit(provider, forward, web3.LAMPORTS_PER_SOL / 100);
    //
    //     //Execute forward
    //     const txExecute = await program.methods
    //         .forwardSol()
    //         .accounts({
    //             forward: forward,
    //             destination: destinationKp.publicKey
    //         })
    //         .signers([wallet.payer])
    //         .rpc();
    //
    //     // console.log(`https://explorer.solana.com/tx/${txExecute}?cluster=devnet`);
    //     await connection.confirmTransaction(txExecute, "finalized");
    //
    //     const balance = await connection.getBalance(destinationKp.publicKey);
    //     expect(balance).to.equal(web3.LAMPORTS_PER_SOL / 100);
    // });
    //
    // it("should not be able to forward to another address", async () => {
    //
    //     try {
    //         const incorrectDestinationKp = new web3.Keypair();
    //         console.log(`executing forward ${forward} to ${incorrectDestinationKp.publicKey}`)
    //         await program.methods
    //             .forwardSol()
    //             .accounts({
    //                 forward: forward,
    //                 destination: incorrectDestinationKp.publicKey
    //             })
    //             .signers([wallet.payer])
    //             .rpc();
    //     } catch (e) {
    //         expect(e).to.be.an.instanceof(AnchorError)
    //         const err: AnchorError = e;
    //         expect(err.error.errorMessage).to.equal("A seeds constraint was violated");
    //         expect(err.error.errorCode.number).to.equal(2006);
    //     }
    // });

    it("transferSplTokens", async () => {

        // Create a new mint and initialize it
        const mintAuthority = new web3.Keypair();
        const mint = await createMint(
            connection,
            wallet.keypair,
            mintAuthority.publicKey,
            null,
            0
        );

        // Create associated token accounts for the new accounts
        const forwardAta = await createAssociatedTokenAccount(
            connection,
            wallet.payer,
            mint,
            forward
        );

        const destinationAta = await createAssociatedTokenAccount(
            connection,
            wallet.payer,
            mint,
            destinationKp.publicKey
        );
        // Mint tokens to the forward
        const mintAmount = 1000;
        await mintTo(
            connection,
            wallet.keypair,
            mint,
            forwardAta,
            wallet.keypair.publicKey,
            mintAmount
        );

        // Send transaction
        const transferAmount = new BN(500);
        const txHash = await program.methods
            .forwardToken()
            .accounts({
                forward: forward,
                mint: mint,
                destination: destinationKp.publicKey,
                forwardAta: forwardAta,
                destinationAta: destinationAta,
                tokenProgram: TOKEN_PROGRAM_ID,
            })
            .signers([wallet.keypair])
            .rpc();
        console.log(`https://explorer.solana.com/tx/${txHash}?cluster=devnet`);
        await connection.confirmTransaction(txHash, "finalized");
        const toTokenAccount = await connection.getTokenAccountBalance(forwardAta);
        assert.strictEqual(
            toTokenAccount.value.uiAmount,
            transferAmount.toNumber(),
            "The 'to' token account should have the transferred tokens"
        );
    });

});