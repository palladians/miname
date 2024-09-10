import {
  NameService,
  StateProof,
  offchainState,
  Mina,
  PrivateKey
} from "../../contracts/build/src/NameService.js";
import type { SettlementInputs } from "./types.js";
import { fetchActions, settle } from "./utils.js";

export { compile, settlementCycle, RETRY_WAIT_MS, MIN_ACTIONS_TO_REDUCE, MAX_RETRIES_BEFORE_REDUCE }

const RETRY_WAIT_MS = Number(process.env.RETRY_WAIT_MS) || 60_000;
const MIN_ACTIONS_TO_REDUCE = 6;
const MAX_RETRIES_BEFORE_REDUCE = 100;

type Config = {
  deployAliases: Record<
    string,
    {
      networkId?: string;
      url: string;
      keyPath: string;
      fee: string;
      feepayerKeyPath: string;
      feepayerAlias: string;
    }
  >;
};

async function settlementCycle({
    feePayer,
    nameservice,
    feepayerKey,
    zkAppKey,
    counter=0
}: SettlementInputs) {
    try {
        const actions = await fetchActions(nameservice);
        let shouldSettle = actions > 0 && (actions > MIN_ACTIONS_TO_REDUCE || counter > MAX_RETRIES_BEFORE_REDUCE);
        if(actions === 0) { // If there is nothing to reduce, don't call settle, and don't increment the counter
            setTimeout(settlementCycle, RETRY_WAIT_MS, {feePayer, nameservice, feepayerKey, zkAppKey, counter});
        } else if (shouldSettle) { // If we should settle the state, then call settle, and reset the cycle to counter = 0
            await settle({feePayer, nameservice, feepayerKey, zkAppKey});
            counter = 0;
            setTimeout(settlementCycle, RETRY_WAIT_MS, {feePayer, nameservice, feepayerKey, zkAppKey, counter});
        } else { // Otherwise, increment the counter and wait for more actions
            counter++;
            setTimeout(settlementCycle, RETRY_WAIT_MS, {feePayer, nameservice, feepayerKey, zkAppKey, counter});
        }
    } catch (error) {
        console.log(error)
        // TODO: If there is an error with the logic, this will just keep looping and catching the error, is there a better approach?
        setTimeout(settlementCycle, RETRY_WAIT_MS, {feePayer, nameservice, feepayerKey, zkAppKey, counter});
    }
}

async function compile(zkAppKeysBase58: { privateKey: string; publicKey: string }) {
    let zkAppKey = PrivateKey.fromBase58(zkAppKeysBase58.privateKey);
    let zkAppAddress = zkAppKey.toPublicKey();

    const Network = Mina.Network({
    mina: "https://api.minascan.io/node/devnet/v1/graphql",
    archive: "https://api.minascan.io/archive/devnet/v1/graphql",
    });
    Mina.setActiveInstance(Network);

    const nameservice = new NameService(zkAppAddress);
    offchainState.setContractInstance(nameservice);
    console.time("compile program");
    await offchainState.compile();
    console.timeEnd("compile program");
    console.time("compile contract");
    await NameService.compile();
    console.timeEnd("compile contract");
}
