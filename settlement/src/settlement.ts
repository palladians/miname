import {
  NameService,
  offchainState,
  Mina,
  PrivateKey
} from "../../contracts/build/src/NameService";
import type { CycleConfig, SettlementInputs } from "./types.js";
import { fetchActions, settle } from "./utils.js";

export { compile, settlementCycle }

async function settlementCycle({
    nameservice,
    feepayerKey,
    zkAppKey,
    counter=0,
    config
}: CycleConfig ) {
    try {
        const actions = await fetchActions(nameservice);
        let shouldSettle = actions > 0 && (actions > config.MIN_ACTIONS_TO_REDUCE || counter > config.MAX_RETRIES_BEFORE_REDUCE);
        if(actions === 0) { // If there is nothing to reduce, don't call settle, and don't increment the counter
            setTimeout(settlementCycle, config.RETRY_WAIT_MS, {nameservice, feepayerKey, zkAppKey, counter});
        } else if (shouldSettle) { // If we should settle the state, then call settle, and reset the cycle to counter = 0
            await settle({nameservice, feepayerKey, zkAppKey});
            counter = 0;
            setTimeout(settlementCycle, config.RETRY_WAIT_MS, {nameservice, feepayerKey, zkAppKey, counter});
        } else { // Otherwise, increment the counter and wait for more actions
            counter++;
            setTimeout(settlementCycle, config.RETRY_WAIT_MS, {nameservice, feepayerKey, zkAppKey, counter});
        }
    } catch (error) {
        console.log(error)
        // TODO: If there is an error with the logic, this will just keep looping and catching the error, is there a better approach?
        setTimeout(settlementCycle, config.RETRY_WAIT_MS, {nameservice, feepayerKey, zkAppKey, counter});
    }
}

async function compile(zkAppKey: PrivateKey) {
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
