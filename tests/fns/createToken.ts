import {ConfirmOptions, Connection, PublicKey, sendAndConfirmTransaction, Signer, Transaction} from "@solana/web3.js";
import {
    ASSOCIATED_TOKEN_PROGRAM_ID,
    createAssociatedTokenAccountIdempotentInstruction,
    getAssociatedTokenAddressSync, TOKEN_PROGRAM_ID
} from "@solana/spl-token";


export async function createAssociatedTokenAccountIdempotent(
    connection: Connection,
    payer: Signer,
    mint: PublicKey,
    owner: PublicKey,
    allowOwnerOffCurve: boolean = false,
    confirmOptions?: ConfirmOptions,
    programId = TOKEN_PROGRAM_ID,
    associatedTokenProgramId = ASSOCIATED_TOKEN_PROGRAM_ID,
): Promise<PublicKey> {
    const associatedToken = getAssociatedTokenAddressSync(mint, owner, allowOwnerOffCurve, programId, associatedTokenProgramId);
    const transaction = new Transaction().add(
        createAssociatedTokenAccountIdempotentInstruction(
            payer.publicKey,
            associatedToken,
            owner,
            mint,
            programId,
            associatedTokenProgramId
        )
    );
    await sendAndConfirmTransaction(connection, transaction, [payer], confirmOptions);
    return associatedToken;
};

