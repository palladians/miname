#!/usr/bin/env bash
set -e

cd ../settlement

if [ -e ".env" ]; then
    echo "Using existing .env"
else
    read -p "Mina Endpoint: " mina_endpoint
    read -p "Archive Endpoint: " archive_endpoint
    read -p "Fee Payer Key: " fee_payer
    read -p "ZkApp Key: " zkapp_key
    read -p "RETRY_WAIT_MS [Default: 60000]: " retry_wait_ms
    retry_wait_ms=${retry_wait_ms:-60000}
    read -p "MIN_ACTIONS_TO_REDUCE [Default: 6]: " min_actions_to_reduce
    min_actions_to_reduce=${min_actions_to_reduce:-6}
    read -p "MAX_RETRIES_BEFORE_REDUCE [Default: 100]: " max_retries_before_reduce
    max_retries_before_reduce=${max_retries_before_reduce:-100}

    cat <<EOL > .env
MINA_ENDPOINT=§${mina_endpoint}§
ARCHIVE_ENDPOINT="${archive_endpoint}
FEE_PAYER_KEY="${fee_payer}"
ZKAPP_KEY="${zkapp_key}"
RETRY_WAIT_MS=${retry_wait_ms}
MIN_ACTIONS_TO_REDUCE=${min_actions_to_reduce}
MAX_RETRIES_BEFORE_REDUCE="{max_retries_before_reduce}
EOL
fi

cd ../contracts
npm run build

node build/src/scripts/interact-devnet.js devnet
wait
node build/src/utils/get-name.js devnet
