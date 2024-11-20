# Settlement Module

The Offchain State API provides a lagging state that needs to be settled. Settlement involves generating a settlement proof by reducing the state changes emitted as actions and calling the `settle() ` method with the proof.

Actions are commutative when emitted, but to be settled, they need to be on the ledger. This requires a block producer to order them and include them in a block. At the settlement stage, all actions are ordered, and the settler cannot extract value by manipulating the order. Anyone can create settlement proof and call the `settle()` method.

Users expect their state changes to be applied without latency. To provide this experience, emitted actions need to be settled regularly, either by the users or the zkApp developer. The Settlement Module in this project offers a base implementation to provide a smooth user experience and reduce fees. It tracks emitted actions and settles them only when an action has been pending for a sufficient amount of time or when the configured action limit is reached, rather than settling on a regular basis. This approach prevents unnecessary settlements when no actions have been emitted and ensures timely settlements when many actions are emitted

# How to use?

## Configure `.env`
```sh
MINA_ENDPOINT= # Mina Endpoint
ARCHIVE_ENDPOINT= # Archive Node Endpoint
FEE_PAYER_KEY= # Private key of fee payer in base58 format
ZKAPP_KEY= # Private key of zkapp in base58 format
RETRY_WAIT_MS= # Wait time between cycles in milliseconds
MIN_ACTIONS_TO_REDUCE= # Minimum number of actions that trigger settlement
MAX_RETRIES_BEFORE_REDUCE= # Maximum number of cycles before settlement is triggered
```

## Build

```sh
npm run build
```

## Run

```sh
npm run start
```

# License

[Apache-2.0](LICENSE)
