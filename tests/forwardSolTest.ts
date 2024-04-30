import * as anchor from "@coral-xyz/anchor";
import {AnchorError, BN} from "@coral-xyz/anchor";
import * as web3 from "@solana/web3.js";
import {assert, expect} from "chai";
import type {Forward} from "../target/types/forward";
import {ASSOCIATED_TOKEN_PROGRAM_ID, createMint, mintTo, TOKEN_PROGRAM_ID} from "@solana/spl-token";
import {createAssociatedTokenAccountIdempotent} from "./fns/createToken";


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
            wallet.payer,
            mintAuthority.publicKey,
            null,
            0
        );

        // Create associated token accounts for the new accounts
        const forwardAta = await createAssociatedTokenAccountIdempotent(
            connection,
            wallet.payer,
            mint,
            forward,
            true
        );

        const destinationAta = await createAssociatedTokenAccountIdempotent(
            connection,
            wallet.payer,
            mint,
            destinationKp.publicKey
        );

        console.log("---------------------------------------------------------------------------------------")
        console.log("forward ", forward)
        console.log("mint ", mint)
        console.log("destination ", destinationKp.publicKey)
        console.log("forwardAta ", forwardAta)
        console.log("destinationAta ", destinationAta)
        console.log("user ", wallet.publicKey)
        console.log("tokenProgram ", TOKEN_PROGRAM_ID)
        console.log("associatedTokenProgram ", ASSOCIATED_TOKEN_PROGRAM_ID)
        console.log("systemProgram ", anchor.web3.SystemProgram.programId)

        // Mint tokens to the forward
        const mintAmount = 1000;
        await mintTo(
            connection,
            wallet.payer,
            mint,
            forwardAta,
            mintAuthority,
            mintAmount
        );

        // Send transaction
        console.log("executing forward");
        const txHash = await program.methods
            .forwardToken()
            .accounts({
                forward: forward,
                mint: mint,
                destination: destinationKp.publicKey,
                forwardAta: forwardAta,
                destinationAta: destinationAta,
                user: wallet.publicKey,
                tokenProgram: TOKEN_PROGRAM_ID,
                associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
                systemProgram: anchor.web3.SystemProgram.programId,
            })
            .signers([wallet.payer])
            .rpc();
        console.log("forward executed, waiting for transaction to finalise");
        await connection.confirmTransaction(txHash, "finalized");
        const forwardTokenAccount = await connection.getTokenAccountBalance(forwardAta);
        const destinationTokenAccount = await connection.getTokenAccountBalance(destinationAta);
        assert.strictEqual(
            forwardTokenAccount.value.uiAmount, 0, "Should have transferred to 0"
        );
        assert.strictEqual(
            destinationTokenAccount.value.uiAmount, mintAmount, "Should have transferred to full amount"
        );
    });

});