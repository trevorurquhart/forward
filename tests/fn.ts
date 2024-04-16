import * as web3 from "@solana/web3.js";

export const deposit = async (provider, to, depositAmount) => {

    let blockhash = await provider.connection.getLatestBlockhash().then(res => res.blockhash);
    const instructions = [web3.SystemProgram.transfer({
        fromPubkey: provider.publicKey,
        toPubkey: to,
        lamports: depositAmount
    })];

    const messageV0 = new web3.TransactionMessage({
        payerKey: provider.publicKey,
        recentBlockhash: blockhash,
        instructions
    }).compileToV0Message();
    const transaction = new web3.VersionedTransaction(messageV0);
    transaction.sign([provider.wallet.payer]);
    const txDeposit = await provider.connection.sendTransaction(transaction);

    // console.log(`https://explorer.solana.com/tx/${txDeposit}?cluster=devnet`);
    await provider.connection.confirmTransaction(txDeposit, "finalized");
}