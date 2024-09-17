export type { SettlementInputs, SettlementConfig, CycleConfig };

type SettlementInputs = {
  nameservice: NameService;
  feepayerKey: PrivateKey;
  zkAppKey: PrivateKey;
};

type SettlementConfig = {
  RETRY_WAIT_MS: number;
  MIN_ACTIONS_TO_REDUCE: number;
  MAX_RETRIES_BEFORE_REDUCE: number;
};

type CycleConfig = {
  nameservice: NameService;
  feepayerKey: PrivateKey;
  zkAppKey: PrivateKey;
  counter?: number;
  config: SettlementConfig;
};
