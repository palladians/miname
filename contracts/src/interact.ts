import { AccountUpdate, Field, Mina, PrivateKey, UInt64 } from 'o1js';
import { NameService, NameRecord, offchainState, Name } from './NameService.js';

const Local = await Mina.LocalBlockchain({ proofsEnabled: true });
Mina.setActiveInstance(Local);

let tx;
let [bob, alice, eve] = Local.testAccounts;

const zkAppPrivateKey = PrivateKey.random();
const zkAppAddress = zkAppPrivateKey.toPublicKey();
let name_service_contract = new NameService(zkAppAddress);
offchainState.setContractInstance(name_service_contract);

if (Local.proofsEnabled) {
  console.time('compile program');
  await offchainState.compile();
  offchainState.setContractClass(NameService);
  console.timeEnd('compile program');
  console.time('compile contract');
  await NameService.compile();
  console.timeEnd('compile contract');
}

console.time('deploy');
tx = await Mina.transaction(bob, async () => {
  AccountUpdate.fundNewAccount(bob);
  await name_service_contract.deploy();
})
  .prove()
  .sign([bob.key, zkAppPrivateKey])
  .send();
console.log(tx.toPretty());
console.timeEnd('deploy');

console.time('set premimum rate');
await Mina.transaction(bob, async () => {
  await name_service_contract.set_premium(UInt64.from(100));
})
  .sign([bob.key])
  .prove()
  .send();
console.log(tx.toPretty());
console.timeEnd('register first name');

console.time('settlement proof 1');
let proof = await offchainState.createSettlementProof();
console.timeEnd('settlement proof 1');

console.time('settle 1');
await Mina.transaction(bob, () => name_service_contract.settle(proof))
  .sign([bob.key])
  .prove()
  .send();
console.log(tx.toPretty());
console.timeEnd('settle 1');

console.time('register a name');
tx = await Mina.transaction({ sender: alice, fee: 100 }, async () => {
  let new_record = new NameRecord({
    mina_address: alice,
    avatar: Field(0),
    url: Field(0),
  });
  await name_service_contract.register_name(
    Name.fromString('alice.mina'),
    new_record
  );
})
  .sign([alice.key])
  .prove()
  .send();
console.log(tx.toPretty());
console.timeEnd('register a name');

console.time('register another name for eve');
tx = await Mina.transaction(eve, async () => {
  let new_record = new NameRecord({
    mina_address: eve,
    avatar: Field(0),
    url: Field(0),
  });
  await name_service_contract.register_name(
    Name.fromString('eve.mina'),
    new_record
  );
})
  .sign([eve.key])
  .prove()
  .send();
console.log(tx.toPretty());
console.timeEnd('register another name for eve');

console.time('register another name for bob');
tx = await Mina.transaction(bob, async () => {
  let new_record = new NameRecord({
    mina_address: bob,
    avatar: Field(0),
    url: Field(0),
  });
  await name_service_contract.register_name(
    Name.fromString('bob.mina'),
    new_record
  );
})
  .sign([bob.key])
  .prove()
  .send();
console.log(tx.toPretty());
console.timeEnd('register another name for bob');

console.time('settlement proof 2');
proof = await offchainState.createSettlementProof();
console.timeEnd('settlement proof 2');

console.time('settle 2');
await Mina.transaction(alice, () => name_service_contract.settle(proof))
  .sign([alice.key])
  .prove()
  .send();
console.log(tx.toPretty());
console.timeEnd('settle 2');

console.time('get a name');
await Mina.transaction(alice, async () => {
  let new_record = new NameRecord({
    mina_address: alice,
    avatar: Field(0),
    url: Field(0),
  });
  let res = await name_service_contract.resolve_name(
    Name.fromString('alice.mina')
  );
  res.mina_address.assertEquals(new_record.mina_address);
  res.avatar.assertEquals(new_record.avatar);
  res.url.assertEquals(new_record.url);
})
  .sign([alice.key])
  .prove()
  .send();
console.log(tx.toPretty());
console.timeEnd('get a name');
