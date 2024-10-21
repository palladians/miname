import fs from 'fs/promises';
import {
  AccountUpdate,
  Field,
  Mina,
  PrivateKey,
  UInt64,
  NetworkId,
} from 'o1js';
import {
  NameService,
  NameRecord,
  offchainState,
  Name,
} from '../../NameService.js';

// check command line arg
let deployAlias = process.argv[2];
if (!deployAlias)
  throw Error(`Missing <deployAlias> argument`);
Error.stackTraceLimit = 1000;
const DEFAULT_NETWORK_ID = 'testnet';

// parse config and private key from file
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
let cycleNumber = 3;
let names: string[] = [];
let nameMap = new Map();

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

console.time('deploy');
tx = await Mina.transaction({ sender: feepayerAddress, fee: fee }, async () => {
  AccountUpdate.fundNewAccount(feepayerAddress);
  await name_service_contract.deploy();
})
  .prove()
  .sign([feepayerKey, zkAppKey])
  .send()
  .wait();
console.timeEnd('deploy');

console.time('set premimum rate');
tx = await Mina.transaction({ sender: feepayerAddress, fee: fee }, async () => {
  await name_service_contract.set_premium(UInt64.from(100));
})
  .sign([feepayerKey])
  .prove()
  .send()
  .wait();
console.timeEnd('set premimum rate');

console.time('settlement proof 1');
let proof = await name_service_contract.offchainState.createSettlementProof();
console.timeEnd('settlement proof 1');

console.time('settle 1');
tx = await Mina.transaction({ sender: feepayerAddress, fee: fee }, async () =>
  name_service_contract.settle(proof)
)
  .sign([feepayerKey])
  .prove()
  .send()
  .wait();
console.timeEnd('settle 1');

console.time('get premimum rate');
let res;
tx = await Mina.transaction({ sender: feepayerAddress, fee: fee }, async () => {
  res = await name_service_contract.premium_rate();
})
  .sign([feepayerKey])
  .prove()
  .send()
  .wait();
console.log(res!.toString());
console.timeEnd('get premimum rate');
for (let i = 0; i < cycleNumber; i++) {
  for (let j = 0; j < 10 ** i; j++) {
    let name = Math.random().toString(36).substring(2, 12).concat('.mina');
    let new_record = new NameRecord({
      mina_address: PrivateKey.randomKeypair().publicKey,
      avatar: Field.random(),
      url: Field.random(),
    });
    names.push(name);
    nameMap.set(name, new_record);
    console.time('register a name');
    tx = await Mina.transaction(
      { sender: feepayerAddress, fee: fee + 100 },
      async () => {
        await name_service_contract.register_name(
          Name.fromString(name),
          new_record
        );
      }
    )
      .sign([feepayerKey])
      .prove()
      .send()
      .wait();
    console.timeEnd('register a name');
  }
  console.time('settlement proof');
  proof = await name_service_contract.offchainState.createSettlementProof();
  console.timeEnd('settlement proof');

  console.time('settle');
  tx = await Mina.transaction({ sender: feepayerAddress, fee: fee }, async () =>
    name_service_contract.settle(proof)
  )
    .sign([feepayerKey])
    .prove()
    .send()
    .wait();
  console.timeEnd('settle');

  console.time('get a randomName');
  let randomName = names[Math.floor(Math.random() * names.length)];
  let record = nameMap.get(randomName);
  tx = await Mina.transaction(
    { sender: feepayerAddress, fee: fee },
    async () => {
      let res = await name_service_contract.resolve_name(
        Name.fromString(randomName)
      );
      res.mina_address.assertEquals(record.mina_address);
      res.avatar.assertEquals(record.avatar);
      res.url.assertEquals(record.url);
    }
  )
    .sign([feepayerKey])
    .prove()
    .send()
    .wait();
  console.timeEnd('get a randomName');
}
