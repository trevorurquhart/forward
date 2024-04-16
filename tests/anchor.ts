import * as anchor from "@coral-xyz/anchor";
import {AnchorError} from "@coral-xyz/anchor";
import * as web3 from "@solana/web3.js";
import {expect} from "chai";
// import {
//   createMint,
//   createAssociatedTokenAccount,
//   mintTo,
//   TOKEN_PROGRAM_ID,
// } from "@solana/spl-token";
import type {Forward} from "../target/types/forward";
import {deposit} from "./fn";

describe("Test forward", () => {

    const forwardId = 104;
    let destinationKp;
    let quarantineKp;
    let forward;

    // Configure the client to use the local cluster
    anchor.setProvider(anchor.AnchorProvider.env());
    const program = anchor.workspace.Forward as anchor.Program<Forward>;

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
            .signers([program.provider.wallet.payer])
            .rpc();

        console.log(`Waiting for ${txInitialise} to finalise, forward :${forward}, destination: ${destinationKp.publicKey}`);
        await program.provider.connection.confirmTransaction(txInitialise, "finalized");

    });

    it("test forwarding SOL", async () => {

        await deposit(program.provider, forward, web3.LAMPORTS_PER_SOL / 100);

        //Execute forward
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

        const balance = await program.provider.connection.getBalance(destinationKp.publicKey);
        expect(balance).to.equal(web3.LAMPORTS_PER_SOL / 100);
    });

    it("should not be able to forward to another address", async () => {

        try {
            const incorrectDestinationKp = new web3.Keypair();
            console.log(`executing forward ${forward} to ${incorrectDestinationKp.publicKey}`)
            await program.methods
                .forwardSol()
                .accounts({
                    forward: forward,
                    destination: incorrectDestinationKp.publicKey
                })
                .signers([program.provider.wallet.payer])
                .rpc();
        } catch (e) {
            expect(e).to.be.an.instanceof(AnchorError)
            const err: AnchorError = e;
            expect(err.error.errorMessage).to.equal("A seeds constraint was violated");
            expect(err.error.errorCode.number).to.equal(2006);
        }
    });


});