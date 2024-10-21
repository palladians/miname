import fs from 'fs/promises';
import {
  AccountUpdate,
  CircuitString,
  Field,
  Mina,
  NetworkId,
  PrivateKey,
  Struct,
  PublicKey,
  fetchAccount,
} from 'o1js';
import { NameService, offchainState } from '../NameService.js';

let deployAlias = process.argv[2];
if (!deployAlias)
  throw Error(`Missing <deployAlias> argument.`);
Error.stackTraceLimit = 1000;
const DEFAULT_NETWORK_ID = 'testnet';

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
let configJson: Config = JSON.parse(await fs.readFile('config.json', 'utf8'));
let config = configJson.deployAliases[deployAlias];
let feepayerKeysBase58: { privateKey: string; publicKey: string } = JSON.parse(
  await fs.readFile(config.feepayerKeyPath, 'utf8')
);

let zkAppKeysBase58: { privateKey: string; publicKey: string } = JSON.parse(
  await fs.readFile(config.keyPath, 'utf8')
);

let feepayerKey = PrivateKey.fromBase58(feepayerKeysBase58.privateKey);
let zkAppKey = PrivateKey.fromBase58(zkAppKeysBase58.privateKey);

// set up Mina instance and contract we interact with
const Network = Mina.Network({
  // We need to default to the testnet networkId if none is specified for this deploy alias in config.json
  // This is to ensure the backward compatibility.
  archive: 'https://api.minascan.io/archive/devnet/v1/graphql',
  networkId: (config.networkId ?? DEFAULT_NETWORK_ID) as NetworkId,
  mina: config.url,
});
const fee = Number(config.fee) * 1e9; // in nanomina (1 billion = 1.0 mina)
Mina.setActiveInstance(Network);
let tx;
let feepayerAddress = feepayerKey.toPublicKey();
let zkAppAddress = zkAppKey.toPublicKey();
let name_service_contract = new NameService(zkAppAddress);
name_service_contract.offchainState.setContractInstance(name_service_contract);

// compile the program and contract to create prover keys
console.time('compile offchainState');
await offchainState.compile();
console.timeEnd('compile offchainState');
console.time('compile contract');
await NameService.compile();
console.timeEnd('compile contract');

console.time('deploy');
try {
  tx = await Mina.transaction({ sender: feepayerAddress, fee }, async () => {
    AccountUpdate.fundNewAccount(feepayerAddress);
    await name_service_contract.deploy();
  });
  await tx.prove();
  console.log('send transaction...');
  const sentTx = await tx.sign([feepayerKey, zkAppKey]).send();
  if (sentTx.status === 'pending') {
    console.log(
      '\nSuccess! Update transaction sent.\n' +
        '\nYour smart contract state will be updated' +
        '\nas soon as the transaction is included in a block:' +
        `\n${getTxnUrl(config.url, sentTx.hash)}`
    );
  }
} catch (err) {
  console.log(err);
}
console.timeEnd('deploy');

function getTxnUrl(graphQlUrl: string, txnHash: string | undefined) {
  const txnBroadcastServiceName = new URL(graphQlUrl).hostname
    .split('.')
    .filter((item) => item === 'minascan' || item === 'minaexplorer')?.[0];
  const networkName = new URL(graphQlUrl).hostname
    .split('.')
    .filter((item) => item === 'devnet' || item === 'testworld')?.[0];
  if (txnBroadcastServiceName && networkName) {
    return `https://minascan.io/${networkName}/tx/${txnHash}?type=zk-tx`;
  }
  return `Transaction hash: ${txnHash}`;
}
