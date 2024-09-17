import {
  NameService,
  StateProof,
  offchainState,
  Mina,
} from "../../contracts/build/src/NameService";
import type { SettlementInputs } from "./types.js";

export { settle, fetchActions, checkEnv };

function checkEnv(input: string | undefined, message: string): string {
  if (input === undefined) {
    throw new Error(message);
  }
  return input;
}

async function fetchActions(nameservice: NameService): Promise<number> {
  let latest_offchain_commitment = await nameservice.offchainState.fetch();
  const actionStateRange = {
    fromActionState: latest_offchain_commitment?.actionState,
  };
  // TODO: should we use the nameService.fetchActions API instead?
  let result = await Mina.fetchActions(nameservice.address, actionStateRange);
  if ("error" in result) throw Error(JSON.stringify(result));
  let actions = result.reduce((accumulator, currentItem) => {
    return (
      accumulator +
      currentItem.actions.reduce((innerAccumulator) => {
        return innerAccumulator + 1;
      }, 0)
    );
  }, 0);

  return actions;
}

async function settle({
  nameservice,
  feepayerKey,
  zkAppKey,
}: SettlementInputs) {
  let proof: StateProof;
  const feePayer = feepayerKey.toPublicKey();
  console.time("settlement proof");
  try {
    proof = await offchainState.createSettlementProof();
  } finally {
    console.timeEnd("settlement proof");
    try {
      let tx = await Mina.transaction(feePayer, async () => {
        await nameservice.settle(proof);
      });
      await tx.prove();
      const sentTx = await tx.sign([feepayerKey, zkAppKey]).send();
      console.log(sentTx.toPretty());
      if (sentTx.status === "pending") {
        console.log(`https://minascan.io/devnet/tx/${sentTx.hash}?type=zk-tx`);
      }
    } catch (error) {
      console.log(error);
    }
  }
}
