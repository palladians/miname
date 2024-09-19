# Name Service ZkApp

The Name Service zkApp allows users to register names that point to a name record containing data, including a Mina address. Names do not expire. Owners can update their name’s record and transfer ownership. Only the admin can pause or unpause the zkApp, set the premium rate, and transfer admin rights. For details, check out [Name Service README](/contracts/README.md).

# Offchain State API

[Offchain State API](https://docs.minaprotocol.com/zkapps/o1js-reference/namespaces/Experimental/functions/OffchainState) helps to overcome 8 state field limitation by enabling offchain mappings and fields.

Two types of offchain state are offered: `OffchainState.Field` (a single field of state) and `OffchainState.Map` (a key-value map).

- All offchain state is stored in a single Merkle map (Merkle tree of size 256)
- There are no practical limits to the number of state fields and maps
- You can use (pure) provable types of size up to ~100 field elements (~size of an action) for field and map values. (Map keys have unlimited size, since they don't need to be part of the action.)
- Fields support field.get(), field.update(update: {from: value, to: value}), field.override(value) in a contract.
- Maps support map.get(key), map.update(key, update: {from: value, to: value}) and map.overwrite(key, value).

To use offchain state, a smart contract developer must:

- Declare an OffchainState
- Call offchainState.compile() and offchainState.setContractInstance() in the setup phase
- Add a specific on-chain state field to store commitments to the offchain state
- Add a settle() method to the smart contract and call it periodically to settle state

Notes:

- State is only available for get() after it was settled
- The settle() implementation is trivial using the tools OffchainState provides
- Settling also involves calling createSettlementProof() outside the contract first, which is also simple from the user point of view

Please refer to [`offchain-contract.unit-test.ts`](https://github.com/o1-labs/o1js/blob/main/src/lib/mina/actions/offchain-contract.unit-test.ts) for more details on usage.

## Limitations and Warnings

### Concurrency Issue

The Offchain State allows handling mappings without concurrency issues. Multiple users can update the values of different keys in the same block. However, in the case of fields, when two users try to change an offchain field at the same time, only one will succeed. A simple workaround is to use on-chain state with actions and a reducer when concurrency is a concern.

### Archive Node Dependency

The `OffchainState` uses actions stored in archive nodes instead of a externel data store. Therefore, usage and settlement of the offchain state depends on liveness and speed of archive nodes.  Developers using offchain state in production are encouraged to run their own archive nodes for most reliabliity.

### Scaling

Currently, the entire Merkle tree is reconstructed on the fly by each user from the fetched actions. This doesn't scale well.

# Settlement

This example includes a settlement module. The module tracks the number of unsettled actions for a specific zkApp account and settles them when a certain number of actions is reached or when an action remains unsettled for a specified time period. Running the settlement module provides a better user experience than requiring users to request settlements themselves.
For Details, please refer to [Settlement Module Readme](/settlement/README.md).
