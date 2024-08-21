import fs from "fs/promises";
import path from "path";

import {
  NameRecord,
  NameService,
  offchainState,
} from "../../contracts/build/src/NameService.js";
import { Mina, NetworkId, PrivateKey } from "o1js";


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
let configJson: Config = JSON.parse(await fs.readFile("config.json", "utf8"));
let config = configJson.deployAliases["devnet"];
let feepayerKeysBase58: { privateKey: string; publicKey: string } = JSON.parse(
  await fs.readFile(config.feepayerKeyPath, "utf8")
);

let zkAppKeysBase58: { privateKey: string; publicKey: string } = JSON.parse(
  await fs.readFile(config.keyPath, "utf8")
);

let feepayerKey = PrivateKey.fromBase58(feepayerKeysBase58.privateKey);
let zkAppKey = PrivateKey.fromBase58(zkAppKeysBase58.privateKey);
let feepayerAddress = feepayerKey.toPublicKey();
let zkAppAddress = zkAppKey.toPublicKey();

const Network = Mina.Network({
  mina: "https://api.minascan.io/node/devnet/v1/graphql",
  archive: "https://api.minascan.io/archive/devnet/v1/graphql",
});
Mina.setActiveInstance(Network);

const fee = Number(config.fee) * 1e9;

const nameservice = new NameService(zkAppAddress);
offchainState.setContractInstance(nameservice);

console.time("compile program");
await offchainState.compile();
console.timeEnd("compile program");
console.time("compile contract");
await NameService.compile();
console.timeEnd("compile contract");

let counter = 0;

settlementCycle();

async function settlementCycle() {
  try {
    // let latest_offchain_commitment = await nameservice.offchainState.fetch();
    /* actionStateRange = {fromActionState: latest_offchain_commitment?.actionState };
    let result = await Mina.fetchActions(
        zkAppAddress,
        actionStateRange
      );
    if ('error' in result) throw Error(JSON.stringify(result));
    let actions = result.reduce((accumulator, currentItem) => {
        return accumulator + currentItem.actions.reduce((innerAccumulator) => {
          return innerAccumulator + 1;
        }, 0);
      }, 0);
*/
    let actions = 1;
    if (actions > 6 || counter > 10) {
      console.time("settlement proof");
      let proof = await offchainState.createSettlementProof();
      console.timeEnd("settlement proof");
      let tx = await Mina.transaction({ sender: feepayerAddress, fee }, async () => {
        nameservice.settle(proof);
      });
      await tx.prove();
      const sentTx = await tx.sign([feepayerKey]).send();
      sentTx.wait();
    } else {
      counter++;
      setTimeout(settlementCycle, 60000); 
    }
  } catch (error) {
    setTimeout(settlementCycle, 60000);
  }
}




