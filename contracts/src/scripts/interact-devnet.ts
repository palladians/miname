import fs from 'fs/promises';
import {
  AccountUpdate,
  Field,
  Mina,
  PrivateKey,
  UInt64,
  NetworkId,
  Provable,
} from 'o1js';
import {
  NameService,
  NameRecord,
  offchainState,
  Name,
  Premium,
} from '../NameService.js';

let skz = PrivateKey.randomKeypair();
console.log('pk', skz.publicKey.toBase58());
console.log('sk', skz.privateKey.toBase58());

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

let feepayerKey = PrivateKey.fromBase58(feepayerKeysBase58.privateKey);
let zkAppKey = PrivateKey.random();
let bob = PrivateKey.randomKeypair();
let alice = PrivateKey.randomKeypair();
let eve = PrivateKey.randomKeypair();

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
console.log(tx.toPretty());
console.timeEnd('deploy');

console.time('set premimum rate');
tx = await Mina.transaction({ sender: feepayerAddress, fee: fee }, async () => {
  await name_service_contract.set_premium(new Premium([6, 5, 4, 3, 2, 1]));
})
  .sign([feepayerKey])
  .prove()
  .send()
  .wait();
console.log(tx.toPretty());
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
console.log(tx.toPretty());
console.timeEnd('settle 1');

console.time('get premimum rate');
let res;
tx = await Mina.transaction({ sender: feepayerAddress, fee: fee }, async () => {
  res = await name_service_contract.premium_rate(Field(3));
})
  .sign([feepayerKey])
  .prove()
  .send()
  .wait();
console.log(res!.toString());
console.log(tx.toPretty());
console.timeEnd('get premimum rate');

console.time('register a name');
tx = await Mina.transaction(
  { sender: feepayerAddress, fee: fee + 100 },
  async () => {
    let new_record = new NameRecord({
      mina_address: alice.publicKey,
      avatar: Field(2),
      url: Field(3),
    });
    await name_service_contract.register_name(
      Name.fromString('alice.mina'),
      new_record
    );
  }
)
  .sign([feepayerKey])
  .prove()
  .send()
  .wait();
console.log(tx.toPretty());
console.timeEnd('register a name');

console.time('register another name for eve');
tx = await Mina.transaction(
  { sender: feepayerAddress, fee: fee + 100 },
  async () => {
    let new_record = new NameRecord({
      mina_address: eve.publicKey,
      avatar: Field(0),
      url: Field(0),
    });
    await name_service_contract.register_name(
      Name.fromString('eve.mina'),
      new_record
    );
  }
)
  .sign([feepayerKey])
  .prove()
  .send()
  .wait();
console.log(tx.toPretty());
console.timeEnd('register another name for eve');

console.time('register another name for bob');
tx = await Mina.transaction(
  { sender: feepayerAddress, fee: fee + 100 },
  async () => {
    let new_record = new NameRecord({
      mina_address: bob.publicKey,
      avatar: Field(0),
      url: Field(0),
    });
    await name_service_contract.register_name(
      Name.fromString('bob.mina'),
      new_record
    );
  }
)
  .sign([feepayerKey])
  .prove()
  .send()
  .wait();
console.log(tx.toPretty());
console.timeEnd('register another name for bob');

console.time('settlement proof 2');
proof = await name_service_contract.offchainState.createSettlementProof();
console.timeEnd('settlement proof 2');

console.time('settle 2');
tx = await Mina.transaction({ sender: feepayerAddress, fee: fee }, async () =>
  name_service_contract.settle(proof)
)
  .sign([feepayerKey])
  .prove()
  .send()
  .wait();
console.log(tx.toPretty());
console.timeEnd('settle 2');

console.time('get a name');
tx = await Mina.transaction({ sender: feepayerAddress, fee: fee }, async () => {
  let new_record = new NameRecord({
    mina_address: alice.publicKey,
    avatar: Field(2),
    url: Field(3),
  });
  let res = await name_service_contract.resolve_name(
    Name.fromString('alice.mina')
  );
  res.mina_address.assertEquals(new_record.mina_address);
  res.avatar.assertEquals(new_record.avatar);
  res.url.assertEquals(new_record.url);
})
  .sign([feepayerKey])
  .prove()
  .send()
  .wait();
console.log(tx.toPretty());
console.timeEnd('get a name');
