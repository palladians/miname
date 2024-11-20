import { Field, Mina, PrivateKey, PublicKey } from 'o1js';
import { beforeAll, describe, it, expect } from 'vitest';
import {
  Name,
  NameRecord,
  offchainState,
  NameService,
} from '../NameService.js';
import { randomAccounts, registerName, settle, testSetup } from './utils.js';

let sender: { address: PublicKey; key: PrivateKey };
let name_service_contract: NameService;
let addresses: Record<string, PublicKey>;
let keys: Record<string, PrivateKey>;

describe('NameService', () => {
  beforeAll(async () => {
    const Local = await Mina.LocalBlockchain({ proofsEnabled: true });
    const { keys: _keys, addresses: _addresses } = randomAccounts(
      'contract',
      'user1',
      'user2'
    );
    Mina.setActiveInstance(Local);
    sender = {
      address: Local.testAccounts[0].key.toPublicKey(),
      key: Local.testAccounts[0].key,
    };
    keys = _keys;
    addresses = _addresses;
    name_service_contract = new NameService(addresses.contract);
    name_service_contract.offchainState.setContractInstance(
      name_service_contract
    );
    await offchainState.compile();
    await NameService.compile();
    console.log('compiled');
    await testSetup(name_service_contract, sender, addresses, keys);
  });

  describe('provable integration test', () => {
    it('registers names, transfers names, updates records, and resolves names', async () => {
      /**
       * Generate and register two names, name1 and name2, with NameRecords nr1 and nr2.
       */
      const name1 = Name.fromString('name1');
      const name2 = Name.fromString('name2');

      const nr1 = new NameRecord({
        mina_address: addresses.user1,
        avatar: Field(1),
        url: Field(1),
      });
      const nr2 = new NameRecord({
        mina_address: addresses.user2,
        avatar: Field(2),
        url: Field(2),
      });

      await registerName(name1, nr1, name_service_contract, sender);
      await registerName(name2, nr2, name_service_contract, sender);

      await settle(name_service_contract, sender);
      console.log('settled first registrations');
      const name1Record = await name_service_contract.resolve_name(name1);
      expect(name1Record.toJSON()).toEqual(nr1.toJSON());
      const name2Record = await name_service_contract.resolve_name(name2);
      expect(name2Record.toJSON()).toEqual(nr2.toJSON());

      /**
       * Transfer name1 to user2 and update name2 to nr1.
       */
      const transferTx = await Mina.transaction(
        { sender: addresses.user1, fee: 1e5 },
        async () => {
          await name_service_contract.transfer_name_ownership(
            name1,
            addresses.user2
          );
        }
      );
      transferTx.sign([keys.user1]);
      await transferTx.prove();
      await transferTx.send().wait();

      await settle(name_service_contract, sender);
      console.log('settled transfer');
      const name1RecordAfterTransfer = await name_service_contract.resolve_name(
        name1
      );
      expect(name1RecordAfterTransfer.mina_address.toBase58()).toEqual(
        addresses.user2.toBase58()
      );

      /**
       * Update record at name2
       */
      const newNr2 = new NameRecord({
        mina_address: addresses.user2,
        avatar: Field(42),
        url: Field(100),
      });
      const updateTx = await Mina.transaction(
        { sender: addresses.user2, fee: 1e5 },
        async () => {
          await name_service_contract.set_record(name2, newNr2);
        }
      );
      updateTx.sign([keys.user2]);
      await updateTx.prove();
      await updateTx.send().wait();

      await settle(name_service_contract, sender);
      console.log('settled set record');
      const name2RecordAfterUpdate = await name_service_contract.resolve_name(
        name2
      );
      expect(name2RecordAfterUpdate.toJSON()).toEqual(newNr2.toJSON());
    });
  });
});
