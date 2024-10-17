import { NameService, PrivateKey } from "../../contracts/build/src/NameService.js";
import { compile, settlementCycle } from "./settlement.js";
import type { SettlementConfig, CycleConfig } from "./types.js";
import { checkEnv } from "./utils.js";
import dotenv from "dotenv";

dotenv.config();

const minaEndpoint = checkEnv(
  process.env.MINA_ENDPOINT,
  "MISSING MINA_ENDPOINT"
);
const archiveEndpoint = checkEnv(
  process.env.ARCHIVE_ENDPOINT,
  "MISSING ARCHIVE_ENDPOINT"
);

const feepayerKey = PrivateKey.fromBase58(
  checkEnv(process.env.FEE_PAYER_KEY, "MISSING FEE_PAYER_KEY")
);
const zkAppKey = PrivateKey.fromBase58(
  checkEnv(process.env.ZKAPP_KEY, "MISSING ZKAPP_KEY")
);

const retry_wait_ms = Number(process.env.RETRY_WAIT_MS) || 60000;
const min_actions_to_reduce = Number(process.env.MIN_ACTIONS_TO_REDUCE) || 6;
const max_retries_before_reduce =
  Number(process.env.MAX_RETRIES_BEFORE_REDUCE) || 100;

const settlement_config: SettlementConfig = {
  RETRY_WAIT_MS: retry_wait_ms,
  MIN_ACTIONS_TO_REDUCE: min_actions_to_reduce,
  MAX_RETRIES_BEFORE_REDUCE: max_retries_before_reduce,
};

const nameservice_instance: NameService = new NameService(zkAppKey.toPublicKey());

const settlementCycleConfig: CycleConfig = {
  nameservice: nameservice_instance,
  feepayerKey: feepayerKey,
  zkAppKey: zkAppKey,
  counter: 0,
  config: settlement_config,
};

await compile(zkAppKey, minaEndpoint, archiveEndpoint);
await settlementCycle(settlementCycleConfig);
