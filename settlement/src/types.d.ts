export type {
    SettlementInputs
}

type SettlementInputs = {
    feePayer: Mina.FeePayerSpec;
    nameservice: NameService;
    feepayerKey: PrivateKey;
    zkAppKey: PrivateKey;
    counter?: number;
}