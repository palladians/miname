import fs from 'fs/promises';
import { Mina, PrivateKey, NetworkId } from 'o1js';
import { NameService, offchainState, Name } from '../../NameService.js';

let deployAlias = process.argv[2];
if (!deployAlias) throw Error(`Missing <deployAlias> argument`);
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

const Network = Mina.Network({
  archive: 'https://api.minascan.io/archive/devnet/v1/graphql',
  networkId: (config.networkId ?? DEFAULT_NETWORK_ID) as NetworkId,
  mina: config.url,
});

const fee = Number(config.fee) * 1e9; // in nanomina (1 billion = 1.0 mina)
Mina.setActiveInstance(Network);
let tx;
let feepayerAddress = feepayerKey.toPublicKey();
console.log(feepayerAddress.toBase58());
let zkAppAddress = zkAppKey.toPublicKey();
let name_service_contract = new NameService(zkAppAddress);

console.time('compile program');
await offchainState.compile();
name_service_contract.offchainState.setContractInstance(name_service_contract);
console.timeEnd('compile program');
console.time('compile contract');
await NameService.compile();
console.timeEnd('compile contract');

console.time('get a name');
let res: any;
tx = await Mina.transaction({ sender: feepayerAddress, fee: fee }, async () => {
  res = await name_service_contract.resolve_name(
    Name.fromString('xy4zfqeg35.mina') // replace with a random name
  );
})
  .sign([feepayerKey])
  .prove()
  .send()
  .wait();
console.log('mina_address: ', res.mina_address);
console.log('avatar: ', res.avatar);
console.log('url: ', res.url);
console.log(tx.toPretty());
console.timeEnd('get a name');
