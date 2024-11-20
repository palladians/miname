import { Field, Mina, PrivateKey, Provable, PublicKey, UInt64 } from 'o1js';
import { beforeAll, describe, it, expect } from 'vitest';
import {
  Name,
  NameRecord,
  NameService,
  offchainState,
  Premium,
} from '../NameService.js';
import { randomAccounts, registerName, settle, testSetup } from './utils.js';

let sender: { address: PublicKey; key: PrivateKey };
let name_service_contract: NameService;
let addresses: Record<string, PublicKey>;
let keys: Record<string, PrivateKey>;

describe('NameService', () => {
  beforeAll(async () => {
    const Local = await Mina.LocalBlockchain({ proofsEnabled: false });
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
    await testSetup(name_service_contract, sender, addresses, keys);
  });

  describe('#set_premium', () => {
    const newPremium = new Premium([6, 5, 4, 3, 2, 1]);
    it('updates the premium', async () => {
      const setPremiumTx = await Mina.transaction(
        { sender: sender.address, fee: 1e5 },
        async () => {
          await name_service_contract.set_premium(newPremium);
        }
      );
      setPremiumTx.sign([sender.key]);
      await setPremiumTx.prove();
      await setPremiumTx.send().wait();

      expect(
        (await name_service_contract.premium_rate(Field(3))).toString()
      ).not.toEqual('6'); // ensure the premium didn't happen to be 6 before settlement
      await settle(name_service_contract, sender);
      expect(
        (await name_service_contract.premium_rate(Field(3))).toString()
      ).toEqual('6');
    });
    it('fails to set premium if caller is not the admin', async () => {
      await expect(
        Mina.transaction({ sender: addresses.user1, fee: 1e5 }, async () => {
          await name_service_contract.set_premium(newPremium);
        })
      ).rejects.toThrow();
    });
  });

  describe('#register_name', () => {
    it('registers a name', async () => {
      const stringName = 'o1Labs001';
      const name = Name.fromString(stringName);
      const stringUrl = 'o1Labs.org';
      const nr = new NameRecord({
        mina_address: addresses.user1,
        avatar: Field(0),
        url: Name.fromString(stringUrl).packed,
      });

      const registerTx = await Mina.transaction(
        { sender: addresses.user1, fee: 1e5 },
        async () => {
          await name_service_contract.register_name(name, nr);
        }
      );
      registerTx.sign([keys.user1]);
      await registerTx.prove();
      await registerTx.send().wait();

      await expect(name_service_contract.resolve_name(name)).rejects.toThrow(); // Name should not be registered before settlement
      await settle(name_service_contract, sender);
      expect(
        (await name_service_contract.resolve_name(name)).mina_address.toBase58()
      ).toEqual(addresses.user1.toBase58());
      const registeredUrl = new Name(
        (await name_service_contract.resolve_name(name)).url
      ).toString();
      expect(registeredUrl).toEqual(stringUrl);
    });
  });

  describe('#set_record', () => {
    it('updates the record for a name', async () => {
      const stringName = 'o1Labs002';
      const name = Name.fromString(stringName);
      const stringUrl = 'o1Labs.org';
      const nr = new NameRecord({
        mina_address: addresses.user1,
        avatar: Field(0),
        url: Name.fromString(stringUrl).packed,
      });

      await registerName(name, nr, name_service_contract, sender);

      const newUrl = 'o1Labs.com';
      const newNr = new NameRecord({
        mina_address: addresses.user1,
        avatar: Field(0),
        url: Name.fromString(newUrl).packed,
      });

      const setRecordTx = await Mina.transaction(
        { sender: addresses.user1, fee: 1e5 },
        async () => {
          await name_service_contract.set_record(name, newNr);
        }
      );
      setRecordTx.sign([keys.user1]);
      await setRecordTx.prove();
      await setRecordTx.send().wait();

      let resolved = await name_service_contract.resolve_name(name);
      expect(new Name(resolved.url).toString()).not.toEqual(newUrl);
      await settle(name_service_contract, sender);
      resolved = await name_service_contract.resolve_name(name);
      expect(new Name(resolved.url).toString()).toEqual(newUrl);
    });
  });

  describe('#transfer_name_ownership', () => {
    let name: Name;
    let nr: NameRecord;

    it('transfers name ownership for a name it controls', async () => {
      const stringName = 'o1Labs003';
      const stringUrl = 'o1Labs.org';
      name = Name.fromString(stringName);
      nr = new NameRecord({
        mina_address: addresses.user1,
        avatar: Field(0),
        url: Name.fromString(stringUrl).packed,
      });
      await registerName(name, nr, name_service_contract, sender);

      const transferTx = await Mina.transaction(
        { sender: addresses.user1, fee: 1e5 },
        async () => {
          await name_service_contract.transfer_name_ownership(
            name,
            addresses.user2
          );
        }
      );
      transferTx.sign([keys.user1]);
      await transferTx.prove();
      await transferTx.send().wait();

      await settle(name_service_contract, sender);
      expect(
        (await name_service_contract.resolve_name(name)).mina_address.toBase58()
      ).toEqual(addresses.user2.toBase58());
    });

    it('fails to transfer name ownership for a name it does not control', async () => {
      const stringName = 'o1Labs004';
      const stringUrl = 'o1Labs.org';
      name = Name.fromString(stringName);
      nr = new NameRecord({
        mina_address: addresses.user1,
        avatar: Field(0),
        url: Name.fromString(stringUrl).packed,
      });
      await registerName(name, nr, name_service_contract, sender);

      await expect(
        Mina.transaction({ sender: addresses.user2, fee: 1e5 }, async () => {
          await name_service_contract.transfer_name_ownership(
            name,
            addresses.user1
          );
        })
      ).rejects.toThrow();
    });

    it('fails to transfer a name that it owns but has not yet bees settled', async () => {
      const stringName = 'o1Labs005';
      const stringUrl = 'o1Labs.org';
      name = Name.fromString(stringName);
      nr = new NameRecord({
        mina_address: addresses.user1,
        avatar: Field(0),
        url: Name.fromString(stringUrl).packed,
      });
      const registerTx = await Mina.transaction(
        { sender: sender.address, fee: 1e5 },
        async () => {
          await name_service_contract.register_name(name, nr); // nr 1 is associated with user1
        }
      );
      registerTx.sign([sender.key]);
      await registerTx.prove();
      await registerTx.send().wait();

      await expect(
        Mina.transaction({ sender: addresses.user1, fee: 1e5 }, async () => {
          await name_service_contract.transfer_name_ownership(
            name,
            addresses.user2
          ); // user1 tries to transfer name to user2
        })
      ).rejects.toThrow();

      await settle(name_service_contract, sender);

      const transferTx = await Mina.transaction(
        { sender: addresses.user1, fee: 1e5 },
        async () => {
          await name_service_contract.transfer_name_ownership(
            name,
            addresses.user2
          );
        }
      );
      transferTx.sign([keys.user1]);
      await transferTx.prove();
      await transferTx.send().wait();

      expect(true); // after settling, the transfer succeeded
    });
  });

  describe('#owner_of', () => {
    it('returns the owner of a name', async () => {
      const stringName = 'o1Labs006';
      const stringUrl = 'o1Labs.org';
      const name = Name.fromString(stringName);
      const nr = new NameRecord({
        mina_address: addresses.user1,
        avatar: Field(0),
        url: Name.fromString(stringUrl).packed,
      });

      await expect(name_service_contract.owner_of(name)).rejects.toThrow();
      await registerName(name, nr, name_service_contract, sender);
      expect((await name_service_contract.owner_of(name)).toBase58()).toEqual(
        addresses.user1.toBase58()
      );
    });
  });

  describe('#resolve_name', () => {
    it('returns the full record associated with a name', async () => {
      const stringName = 'o1Labs007';
      const stringUrl = 'o1Labs.org';
      const name = Name.fromString(stringName);
      const nr = new NameRecord({
        mina_address: addresses.user1,
        avatar: Field(0),
        url: Name.fromString(stringUrl).packed,
      });

      await registerName(name, nr, name_service_contract, sender);
      const resolved = await name_service_contract.resolve_name(name);
      expect(resolved.toJSON()).toEqual(nr.toJSON());
    });
  });

  describe('#settle (with multiple transactions)', () => {
    it('registers multiple names from different users', async () => {
      const name1 = Name.fromString('o1Labs008');
      const nr1 = new NameRecord({
        mina_address: addresses.user1,
        avatar: Field(0),
        url: Name.fromString('o1Labs.org').packed,
      });

      const name2 = Name.fromString('o1Labs2001');
      const nr2 = new NameRecord({
        mina_address: addresses.user2,
        avatar: Field(0),
        url: Name.fromString('o1Labs2.org').packed,
      });

      const registerTx1 = await Mina.transaction(
        { sender: addresses.user1, fee: 1e5 },
        async () => {
          await name_service_contract.register_name(name1, nr1);
        }
      );
      registerTx1.sign([keys.user1]);
      await registerTx1.prove();
      await registerTx1.send().wait();

      const registerTx2 = await Mina.transaction(
        { sender: addresses.user2, fee: 1e5 },
        async () => {
          await name_service_contract.register_name(name2, nr2);
        }
      );
      registerTx2.sign([keys.user2]);
      await registerTx2.prove();
      await registerTx2.send().wait();

      await settle(name_service_contract, sender);

      const resolved1 = await name_service_contract.resolve_name(name1);
      expect(resolved1.toJSON()).toEqual(nr1.toJSON());

      const resolved2 = await name_service_contract.resolve_name(name2);
      expect(resolved2.toJSON()).toEqual(nr2.toJSON());
    });
  });
});
