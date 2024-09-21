import { Field, Mina, PrivateKey, PublicKey, UInt64 } from 'o1js';
import { beforeAll, describe, it, expect } from 'vitest';
import {
  Name,
  NameRecord,
  NameService,
  offchainState,
} from '../NameService.js';
import { randomAccounts, registerName, settle, testSetup } from './utils.js';

let sender: { address: PublicKey; key: PrivateKey };
let nameService: NameService;
let addresses: Record<string, PublicKey>;
let keys: Record<string, PrivateKey>;

describe('NameService', () => {
  beforeAll(async () => {
    const Local = await Mina.LocalBlockchain({ proofsEnabled: false });
    Mina.setActiveInstance(Local);
    sender = {
      address: Local.testAccounts[0].key.toPublicKey(),
      key: Local.testAccounts[0].key,
    };

    const { keys: _keys, addresses: _addresses } = randomAccounts(
      'contract',
      'user1',
      'user2'
    );
    keys = _keys;
    addresses = _addresses;
    nameService = new NameService(addresses.contract);
    offchainState.setContractInstance(nameService);
    await testSetup(nameService, sender, addresses, keys);
  });

  describe('#set_premium', () => {
    it('updates the premium', async () => {
      const newPremium = UInt64.from(5);
      const setPremiumTx = await Mina.transaction(
        { sender: sender.address, fee: 1e5 },
        async () => {
          await nameService.set_premium(newPremium);
        }
      );
      setPremiumTx.sign([sender.key]);
      await setPremiumTx.prove();
      await setPremiumTx.send().wait();

      expect((await nameService.premium_rate()).toString()).not.toEqual('5'); // ensure the premium didn't happen to be 5 before settlement
      await settle(nameService, sender);
      expect((await nameService.premium_rate()).toString()).toEqual('5');
    });
  });

  describe('#register_name', () => {
    it('registers a name', async () => {
      const stringName = 'o1Labs001';
      const name = Name.fromString(stringName);
      const nr = new NameRecord({
        mina_address: addresses.user1,
        avatar: Field(0),
        url: Field(0),
      });

      const registerTx = await Mina.transaction(
        { sender: addresses.user1, fee: 1e5 },
        async () => {
          await nameService.register_name(name, nr);
        }
      );
      registerTx.sign([keys.user1]);
      await registerTx.prove();
      await registerTx.send().wait();

      await expect(nameService.resolve_name(name)).rejects.toThrow(); // Name should not be registered before settlement
      await settle(nameService, sender);
      expect(
        (await nameService.resolve_name(name)).mina_address.toBase58()
      ).toEqual(addresses.user1.toBase58());

      const registeredAddress = 
        (await nameService.resolve_name(name)).mina_address;
      expect(registeredAddress).toEqual(addresses.user1);
    });
  });

  describe('#set_record', () => {
    it('updates the record for a name', async () => {
      const stringName = 'o1Labs002';
      const name = Name.fromString(stringName);
      const nr = new NameRecord({
        mina_address: addresses.user1,
        avatar: Field(0),
        url: Field(0),
      });

      await registerName(name, nr, nameService, sender);

      const newNr = new NameRecord({
        mina_address: addresses.user1,
        avatar: Field(0),
        url: Field(1),
      });

      const setRecordTx = await Mina.transaction(
        { sender: addresses.user1, fee: 1e5 },
        async () => {
          await nameService.set_record(name, newNr);
        }
      );
      setRecordTx.sign([keys.user1]);
      await setRecordTx.prove();
      await setRecordTx.send().wait();

      let resolved = await nameService.resolve_name(name);
      expect(resolved.url).not.toEqual(Field(1));
      await settle(nameService, sender);
      resolved = await nameService.resolve_name(name);
      expect(resolved.url).toEqual(Field(1));
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
        url: Field(0),
      });
      await registerName(name, nr, nameService, sender);

      const transferTx = await Mina.transaction(
        { sender: addresses.user1, fee: 1e5 },
        async () => {
          await nameService.transfer_name_ownership(
            name,
            addresses.user2
          );
        }
      );
      transferTx.sign([keys.user1]);
      await transferTx.prove();
      await transferTx.send().wait();

      await settle(nameService, sender);
      expect(
        (await nameService.resolve_name(name)).mina_address.toBase58()
      ).toEqual(addresses.user2.toBase58());
    });

    it('fails to transfer name ownership for a name it does not control', async () => {
      const stringName = 'o1Labs004';
      const stringUrl = 'o1Labs.org';
      name = Name.fromString(stringName);
      nr = new NameRecord({
        mina_address: addresses.user1,
        avatar: Field(0),
        url: Field(0),
      });
      await registerName(name, nr, nameService, sender);

      await expect(
        Mina.transaction({ sender: addresses.user2, fee: 1e5 }, async () => {
          await nameService.transfer_name_ownership(
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
        url: Field(0),
      });
      const registerTx = await Mina.transaction(
        { sender: sender.address, fee: 1e5 },
        async () => {
          await nameService.register_name(name, nr); // nr 1 is associated with user1
        }
      );
      registerTx.sign([sender.key]);
      await registerTx.prove();
      await registerTx.send().wait();

      await expect(
        Mina.transaction({ sender: addresses.user1, fee: 1e5 }, async () => {
          await nameService.transfer_name_ownership(
            name,
            addresses.user2
          ); // user1 tries to transfer name to user2
        })
      ).rejects.toThrow();

      await settle(nameService, sender);

      const transferTx = await Mina.transaction(
        { sender: addresses.user1, fee: 1e5 },
        async () => {
          await nameService.transfer_name_ownership(
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
      const name = Name.fromString(stringName);
      const nr = new NameRecord({
        mina_address: addresses.user1,
        avatar: Field(0),
        url: Field(0),
      });

      await expect(nameService.owner_of(name)).rejects.toThrow();
      await registerName(name, nr, nameService, sender);
      expect((await nameService.owner_of(name)).toBase58()).toEqual(
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
        url: Field(0),
      });

      await registerName(name, nr, nameService, sender);
      const resolved = await nameService.resolve_name(name);
      expect(resolved.toJSON()).toEqual(nr.toJSON());
    });
  });

  describe('#settle (with multiple transactions)', () => {
    it('registers multiple names from different users', async () => {
      const name1 = Name.fromString('o1Labs008');
      const nr1 = new NameRecord({
        mina_address: addresses.user1,
        avatar: Field(0),
        url: Field(0),
      });

      const name2 = Name.fromString('o1Labs2001');
      const nr2 = new NameRecord({
        mina_address: addresses.user2,
        avatar: Field(0),
        url: Field(0),
      });

      const registerTx1 = await Mina.transaction(
        { sender: addresses.user1, fee: 1e5 },
        async () => {
          await nameService.register_name(name1, nr1);
        }
      );
      registerTx1.sign([keys.user1]);
      await registerTx1.prove();
      await registerTx1.send().wait();

      const registerTx2 = await Mina.transaction(
        { sender: addresses.user2, fee: 1e5 },
        async () => {
          await nameService.register_name(name2, nr2);
        }
      );
      registerTx2.sign([keys.user2]);
      await registerTx2.prove();
      await registerTx2.send().wait();

      await settle(nameService, sender);

      const resolved1 = await nameService.resolve_name(name1);
      expect(resolved1.toJSON()).toEqual(nr1.toJSON());

      const resolved2 = await nameService.resolve_name(name2);
      expect(resolved2.toJSON()).toEqual(nr2.toJSON());
    });
  });
});
