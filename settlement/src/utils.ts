import {
    NameService,
    StateProof,
    offchainState,
    Mina,
    PrivateKey
  } from "../../contracts/build/src/NameService.js";
import type { SettlementInputs } from "./types.js";

export { settle, fetchActions }

async function fetchActions(nameservice: NameService): Promise<number> {
    let latest_offchain_commitment = await nameservice.offchainState.fetch();
    const actionStateRange = {fromActionState: latest_offchain_commitment?.actionState };
    // TODO: should we use the nameService.fetchActions API instead?
    let result = await Mina.fetchActions(
        nameservice.address,
        actionStateRange
    );
    if ('error' in result) throw Error(JSON.stringify(result));
    let actions = result.reduce((accumulator, currentItem) => {
        return accumulator + currentItem.actions.reduce((innerAccumulator) => {
        return innerAccumulator + 1;
        }, 0);
    }, 0);

    return actions;
}

async function settle({
    feePayer,
    nameservice,
    feepayerKey,
    zkAppKey
}: SettlementInputs) {
    let proof: StateProof;
    console.time("settlement proof");
    try {
        proof = await offchainState.createSettlementProof();
    } finally {
        console.timeEnd("settlement proof");
        try {
            console.log('entered tx scope');
            let tx = await Mina.transaction(feePayer, async () => {
                await nameservice.settle(proof);
            })
            await tx.prove();
            console.log('send transaction...');
            const sentTx = await tx.sign([feepayerKey, zkAppKey]).send();
            console.log(sentTx.toPretty());
            if (sentTx.status === 'pending') {
                console.log(`https://minascan.io/devnet/tx/${sentTx.hash}?type=zk-tx`);

            }
        }
        catch(error){
            console.log(error);
        }
    }
}