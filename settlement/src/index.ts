import {
  NameService,
  PrivateKey,
} from "../../contracts/build/src/NameService";
import { compile, settlementCycle } from "./settlement.js";
import type { SettlementConfig, CycleConfig } from "./types.js";
import { checkEnv } from "./utils";
import dotenv from "dotenv";

dotenv.config();

const RETRY_WAIT_MS = Number(process.env.RETRY_WAIT_MS) || 60_000;
const MIN_ACTIONS_TO_REDUCE = Number(process.env.MIN_ACTIONS_TO_REDUCE) || 6;
const MAX_RETRIES_BEFORE_REDUCE =
  Number(process.env.MAX_RETRIES_BEFORE_REDUCE) || 100;
const feepayerKey = PrivateKey.fromBase58(
  checkEnv(process.env.FEE_PAYER_KEY, "MISSING FEE_PAYER_KEY")
);
const zkAppKey = PrivateKey.fromBase58(
  checkEnv(process.env.ZKAPP_KEY, "MISSING ZKAPP_KEY")
);

const config: SettlementConfig = {
  RETRY_WAIT_MS,
  MIN_ACTIONS_TO_REDUCE,
  MAX_RETRIES_BEFORE_REDUCE,
};

const settlementCycleConfig: CycleConfig = {
  nameservice: NameService,
  feepayerKey: feepayerKey,
  zkAppKey: zkAppKey,
  counter: 0,
  config: config,
};

await compile(zkAppKey);
await settlementCycle(settlementCycleConfig);
