import {
  NameService,
  StateProof,
  offchainState,
  Mina,
} from "../../contracts/build/src/NameService.js";
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
      console.time("settlement tx");
      let tx = Mina.transaction(
        { sender: feePayer, fee: 5 * 1e8 },
        async () => {
          await nameservice.settle(proof);
        }
      );
      await tx.sign([feepayerKey, zkAppKey])
      .prove()
      .send()
      .wait();
      console.timeEnd("settlement tx");
    } catch (error) {
      console.log(error);
    }
  }
}
