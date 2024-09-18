import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, MockInstance, vi } from "vitest";
import { settlementCycle } from "./settlement.js";
import * as UtilsModule from "./utils.js";
import * as NameServiceModule from "../../contracts/build/src/NameService.js";
import { PrivateKey } from "o1js";
import { NameService, offchainState } from "../../contracts/build/src/NameService.js";
import assert from "node:assert";

const feepayerKey = PrivateKey.random();
const zkAppKey = PrivateKey.random();
const feePayer = {
    sender: feepayerKey.toPublicKey(),
    fee: 1e9
}
const config = {
    RETRY_WAIT_MS: 60_000,
    MIN_ACTIONS_TO_REDUCE: 6,
    MAX_RETRIES_BEFORE_REDUCE: 100
  };
const nameservice = new NameService(zkAppKey.toPublicKey());

describe('Settlement', () => {
    describe.skip('#compile', () => {
        it.todo('instantiates a NameServie');
        it.todo('instantiates an offchain state');
        it.todo('sets the contract instance on offchain state');
        it.todo('compiles the NameService contract');
        it.todo('compiles the offchain circuit');
    });

    describe('#settlementCycle', () => {
        beforeEach(() => {
            vi.clearAllMocks();
        })

        afterAll(async () => {
            vi.restoreAllMocks();
        });

        describe('the first time it is called', () => {
            const counter = 0;

            describe('with no actions to reduce', () => {
                const actionsCount = 0;

                it('does not reduce actions and retries with same count', async () => {
                    await setupAndTestSettlement({
                        stubbedActionsCount: actionsCount,
                        stubbedCounter: counter,
                        shouldSettle: false,
                        expectedCounter: counter
                    });
                });
            });

            describe('with fewer than the minimum required actions to reduce', () => {
                const actionsCount = config.MIN_ACTIONS_TO_REDUCE - 1;

                it('does not reduce actions and enqueues a retry with count + 1', async () => {
                    await setupAndTestSettlement({
                        stubbedActionsCount: actionsCount,
                        stubbedCounter: counter,
                        shouldSettle: false,
                        expectedCounter: counter + 1
                    });
                });
            });

            describe('with more than the minimum required actions to reduce', () => {
                const actionsCount = config.MIN_ACTIONS_TO_REDUCE - 1;

                it('does not reduce actions and enqueues a retry with count + 1', async () => {
                    await setupAndTestSettlement({
                        stubbedActionsCount: actionsCount,
                        stubbedCounter: counter,
                        shouldSettle: false,
                        expectedCounter: counter + 1
                    });
                });
            });
        });

        describe('with fewer than the max retries needed before reducing', () => {
            const counter = config.MAX_RETRIES_BEFORE_REDUCE - 1;

            describe('with no actions to reduce', () => {
                const actionsCount = 0;

                it('does not reduce actions and enqueues a retry with same count', async () => {
                    await setupAndTestSettlement({
                        stubbedActionsCount: actionsCount,
                        stubbedCounter: counter,
                        shouldSettle: false,
                        expectedCounter: counter
                    });
                });
            });

            describe('with fewer than the minimum required actions to reduce', () => {
                const actionsCount = config.MIN_ACTIONS_TO_REDUCE - 1;

                it('does not reduce actions and enqueues a retry with count + 1', async () => {
                    await setupAndTestSettlement({
                        stubbedActionsCount: actionsCount,
                        stubbedCounter: counter,
                        shouldSettle: false,
                        expectedCounter: counter + 1
                    });
                });
            });

            describe('with more than the minimum required actions to reduce', () => {
                const actionsCount = config.MIN_ACTIONS_TO_REDUCE + 1;

                it('reduces the actions and enqueues a retry with count = 0', async () => {
                    await setupAndTestSettlement({
                        stubbedActionsCount: actionsCount,
                        stubbedCounter: counter,
                        shouldSettle: true,
                        expectedCounter: 0
                    });
                });
            });
        });

        describe('with more than the max retries needed before reducing', () => {
            const counter = config.MAX_RETRIES_BEFORE_REDUCE + 1;

            describe('with no actions to reduce', () => {
                const actionsCount = 0;

                it('does not reduce actions and enqueues a retry with same count', async () => {
                    await setupAndTestSettlement({
                        stubbedActionsCount: actionsCount,
                        stubbedCounter: counter,
                        shouldSettle: false,
                        expectedCounter: counter
                    })
                });
            });

            describe('with fewer than the minimum required actions to reduce', () => {
                const actionsCount = config.MIN_ACTIONS_TO_REDUCE - 1;

                it('reduces the actions and enqueues a retry with count = 0', async () => {
                    await setupAndTestSettlement({
                        stubbedActionsCount: actionsCount,
                        stubbedCounter: counter,
                        shouldSettle: true,
                        expectedCounter: 0
                    })
                });
            });

            describe('with more than the minimum required actions to reduce', () => {
                const actionsCount = config.MIN_ACTIONS_TO_REDUCE + 1;

                it('reduces the actions and enqueues a retry with count = 0', async () => {
                    await setupAndTestSettlement({
                        stubbedActionsCount: actionsCount,
                        stubbedCounter: counter,
                        shouldSettle: true,
                        expectedCounter: 0
                    })
                });
            });
        });
    });
});

async function setupAndTestSettlement({
    stubbedActionsCount,
    stubbedCounter,
    shouldSettle,
    expectedCounter
}: {
    stubbedActionsCount: number;
    stubbedCounter: number;
    shouldSettle: boolean;
    expectedCounter: number;
}) {
    
    const fetchActionsSpy: MockInstance = vi.spyOn(UtilsModule, 'fetchActions').mockImplementation(() => Promise.resolve(stubbedActionsCount));
    const settleSpy: MockInstance = vi.spyOn(UtilsModule, 'settle').mockResolvedValue();
    const setTimeoutSpy: MockInstance = vi.spyOn(globalThis, 'setTimeout').mockImplementation(vi.fn());
  
    await settlementCycle({ nameservice, feepayerKey, zkAppKey, counter: stubbedCounter, config});
  
    expect(settleSpy).toHaveBeenCalledTimes(shouldSettle ? 1 : 0);
    expect(setTimeoutSpy).toHaveBeenCalledOnce();
    expect(fetchActionsSpy).toHaveBeenCalledOnce();
  
    const [callback, delay, settlementInput] = setTimeoutSpy.mock.calls[0];
  
    expect(callback).toBe(settlementCycle);
    expect(delay).toBe(config.RETRY_WAIT_MS);
    expect(settlementInput.counter).toBe(expectedCounter);
  
    fetchActionsSpy.mockRestore();
    setTimeoutSpy.mockRestore();
    settleSpy.mockRestore();
}