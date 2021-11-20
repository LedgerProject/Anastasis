/*
 This file is part of GNU Taler
 (C) 2021 Taler Systems S.A.

 GNU Taler is free software; you can redistribute it and/or modify it under the
 terms of the GNU General Public License as published by the Free Software
 Foundation; either version 3, or (at your option) any later version.

 GNU Taler is distributed in the hope that it will be useful, but WITHOUT ANY
 WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR
 A PARTICULAR PURPOSE.  See the GNU General Public License for more details.

 You should have received a copy of the GNU General Public License along with
 GNU Taler; see the file COPYING.  If not, see <http://www.gnu.org/licenses/>
 */

import {
  minimatch
} from "@gnu-taler/taler-util";
import {
  GlobalTestState,
  runTestWithState,
  shouldLingerInTest,
  TestRunResult,
} from "../harness/harness.js";
import { runPaymentTest } from "./test-payment";
import { runPaymentDemoTest } from "./test-payment-on-demo";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as child_process from "child_process";
import { runBankApiTest } from "./test-bank-api";
import { runClaimLoopTest } from "./test-claim-loop";
import { runExchangeManagementTest } from "./test-exchange-management";
import { runFeeRegressionTest } from "./test-fee-regression";
import { runMerchantLongpollingTest } from "./test-merchant-longpolling";
import { runMerchantRefundApiTest } from "./test-merchant-refund-api";
import { runPayAbortTest } from "./test-pay-abort";
import { runPayPaidTest } from "./test-pay-paid";
import { runPaymentClaimTest } from "./test-payment-claim";
import { runPaymentFaultTest } from "./test-payment-fault";
import { runPaymentIdempotencyTest } from "./test-payment-idempotency";
import { runPaymentMultipleTest } from "./test-payment-multiple";
import { runPaymentTransientTest } from "./test-payment-transient";
import { runPaywallFlowTest } from "./test-paywall-flow";
import { runRefundAutoTest } from "./test-refund-auto";
import { runRefundGoneTest } from "./test-refund-gone";
import { runRefundIncrementalTest } from "./test-refund-incremental";
import { runRefundTest } from "./test-refund";
import { runRevocationTest } from "./test-revocation";
import { runTimetravelAutorefreshTest } from "./test-timetravel-autorefresh";
import { runTimetravelWithdrawTest } from "./test-timetravel-withdraw";
import { runTippingTest } from "./test-tipping";
import { runWallettestingTest } from "./test-wallettesting";
import { runTestWithdrawalManualTest } from "./test-withdrawal-manual";
import { runWithdrawalAbortBankTest } from "./test-withdrawal-abort-bank";
import { runWithdrawalBankIntegratedTest } from "./test-withdrawal-bank-integrated";
import { runMerchantExchangeConfusionTest } from "./test-merchant-exchange-confusion";
import { runLibeufinBasicTest } from "./test-libeufin-basic";
import { runLibeufinC5xTest } from "./test-libeufin-c5x";
import { runLibeufinNexusBalanceTest } from "./test-libeufin-nexus-balance";
import { runLibeufinBadGatewayTest } from "./test-libeufin-bad-gateway";
import { runLibeufinKeyrotationTest } from "./test-libeufin-keyrotation";
import { runLibeufinRefundTest } from "./test-libeufin-refund";
import { runLibeufinRefundMultipleUsersTest } from "./test-libeufin-refund-multiple-users";
import { runLibeufinTutorialTest } from "./test-libeufin-tutorial";
import { runLibeufinApiPermissionsTest } from "./test-libeufin-api-permissions";
import { runLibeufinApiFacadeTest } from "./test-libeufin-api-facade";
import { runLibeufinApiFacadeBadRequestTest } from "./test-libeufin-api-facade-bad-request";
import { runLibeufinAnastasisFacadeTest } from "./test-libeufin-facade-anastasis";
import { runLibeufinApiSchedulingTest } from "./test-libeufin-api-scheduling";
import { runLibeufinApiBankconnectionTest } from "./test-libeufin-api-bankconnection";
import { runLibeufinApiUsersTest } from "./test-libeufin-api-users";
import { runLibeufinApiBankaccountTest } from "./test-libeufin-api-bankaccount";
import { runLibeufinApiSandboxTransactionsTest } from "./test-libeufin-api-sandbox-transactions";
import { runLibeufinApiSandboxCamtTest } from "./test-libeufin-api-sandbox-camt";
import { runLibeufinSandboxWireTransferCliTest } from "./test-libeufin-sandbox-wire-transfer-cli";
import { runDepositTest } from "./test-deposit";
import CancellationToken from "cancellationtoken";
import { runMerchantInstancesTest } from "./test-merchant-instances";
import { runMerchantInstancesUrlsTest } from "./test-merchant-instances-urls";
import { runWalletBackupBasicTest } from "./test-wallet-backup-basic";
import { runMerchantInstancesDeleteTest } from "./test-merchant-instances-delete";
import { runWalletBackupDoublespendTest } from "./test-wallet-backup-doublespend";
import { runPaymentForgettableTest } from "./test-payment-forgettable.js";
import { runPaymentZeroTest } from "./test-payment-zero.js";
import { runMerchantSpecPublicOrdersTest } from "./test-merchant-spec-public-orders.js";
import { runExchangeTimetravelTest } from "./test-exchange-timetravel.js";
import { runDenomUnofferedTest } from "./test-denom-unoffered.js";
import { runTestWithdrawalFakebankTest } from "./test-withdrawal-fakebank.js";

/**
 * Test runner.
 */

/**
 * Spec for one test.
 */
interface TestMainFunction {
  (t: GlobalTestState): Promise<void>;
  timeoutMs?: number;
  excludeByDefault?: boolean;
  suites?: string[];
}

const allTests: TestMainFunction[] = [
  runBankApiTest,
  runClaimLoopTest,
  runDepositTest,
  runDenomUnofferedTest,
  runExchangeManagementTest,
  runExchangeTimetravelTest,
  runFeeRegressionTest,
  runLibeufinBasicTest,
  runLibeufinKeyrotationTest,
  runLibeufinTutorialTest,
  runLibeufinRefundTest,
  runLibeufinC5xTest,
  runLibeufinNexusBalanceTest,
  runLibeufinBadGatewayTest,
  runLibeufinRefundMultipleUsersTest,
  runLibeufinApiPermissionsTest,
  runLibeufinApiFacadeTest,
  runLibeufinApiFacadeBadRequestTest,
  runLibeufinAnastasisFacadeTest,
  runLibeufinApiSchedulingTest,
  runLibeufinApiUsersTest,
  runLibeufinApiBankaccountTest,
  runLibeufinApiBankconnectionTest,
  runLibeufinApiSandboxTransactionsTest,
  runLibeufinApiSandboxCamtTest,
  runLibeufinSandboxWireTransferCliTest,
  runMerchantExchangeConfusionTest,
  runMerchantInstancesTest,
  runMerchantInstancesDeleteTest,
  runMerchantInstancesUrlsTest,
  runMerchantLongpollingTest,
  runMerchantSpecPublicOrdersTest,
  runMerchantRefundApiTest,
  runPayAbortTest,
  runPaymentClaimTest,
  runPaymentFaultTest,
  runPaymentForgettableTest,
  runPaymentIdempotencyTest,
  runPaymentMultipleTest,
  runPaymentTest,
  runPaymentDemoTest,
  runPaymentTransientTest,
  runPaymentZeroTest,
  runPayPaidTest,
  runPaywallFlowTest,
  runRefundAutoTest,
  runRefundGoneTest,
  runRefundIncrementalTest,
  runRefundTest,
  runRevocationTest,
  runTestWithdrawalManualTest,
  runTestWithdrawalFakebankTest,
  runTimetravelAutorefreshTest,
  runTimetravelWithdrawTest,
  runTippingTest,
  runWalletBackupBasicTest,
  runWalletBackupDoublespendTest,
  runWallettestingTest,
  runWithdrawalAbortBankTest,
  runWithdrawalBankIntegratedTest,
];

export interface TestRunSpec {
  includePattern?: string;
  suiteSpec?: string;
  dryRun?: boolean;
  verbosity: number;
}

export interface TestInfo {
  name: string;
  suites: string[];
  excludeByDefault: boolean;
}

function updateCurrentSymlink(testDir: string): void {
  const currLink = path.join(
    os.tmpdir(),
    `taler-integrationtests-${os.userInfo().username}-current`,
  );
  try {
    fs.unlinkSync(currLink);
  } catch (e) {
    // Ignore
  }
  try {
    fs.symlinkSync(testDir, currLink);
  } catch (e) {
    console.log(e);
    // Ignore
  }
}

export function getTestName(tf: TestMainFunction): string {
  const res = tf.name.match(/run([a-zA-Z0-9]*)Test/);
  if (!res) {
    throw Error("invalid test name, must be 'run${NAME}Test'");
  }
  return res[1]
    .replace(/[a-z0-9][A-Z]/g, (x) => {
      return x[0] + "-" + x[1];
    })
    .toLowerCase();
}

interface RunTestChildInstruction {
  testName: string;
  testRootDir: string;
}

export async function runTests(spec: TestRunSpec) {
  const testRootDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "taler-integrationtests-"),
  );
  updateCurrentSymlink(testRootDir);
  console.log("testsuite root directory: ", testRootDir);

  const testResults: TestRunResult[] = [];

  let currentChild: child_process.ChildProcess | undefined;

  const handleSignal = (s: NodeJS.Signals) => {
    console.log(`received signal ${s} in test parent`);
    if (currentChild) {
      currentChild.kill("SIGTERM");
    }
    reportAndQuit(testRootDir, testResults, true);
  };

  process.on("SIGINT", (s) => handleSignal(s));
  process.on("SIGTERM", (s) => handleSignal(s));
  //process.on("unhandledRejection", handleSignal);
  //process.on("uncaughtException", handleSignal);

  let suites: Set<string> | undefined;

  if (spec.suiteSpec) {
    suites = new Set(spec.suiteSpec.split(",").map((x) => x.trim()));
  }

  for (const [n, testCase] of allTests.entries()) {
    const testName = getTestName(testCase);
    if (spec.includePattern && !minimatch(testName, spec.includePattern)) {
      continue;
    }

    if (suites) {
      const ts = new Set(testCase.suites ?? []);
      const intersection = new Set([...suites].filter((x) => ts.has(x)));
      if (intersection.size === 0) {
        continue;
      }
    } else {
      if (testCase.excludeByDefault) {
        continue;
      }
    }

    if (spec.dryRun) {
      console.log(`dry run: would run test ${testName}`);
      continue;
    }

    const testInstr: RunTestChildInstruction = {
      testName,
      testRootDir,
    };

    currentChild = child_process.fork(__filename, ["__TWCLI_TESTWORKER"], {
      env: {
        TWCLI_RUN_TEST_INSTRUCTION: JSON.stringify(testInstr),
        ...process.env,
      },
      stdio: ["pipe", "pipe", "pipe", "ipc"],
    });

    const testDir = path.join(testRootDir, testName);
    fs.mkdirSync(testDir, { recursive: true });

    const harnessLogFilename = path.join(testRootDir, testName, "harness.log");
    const harnessLogStream = fs.createWriteStream(harnessLogFilename);

    if (spec.verbosity > 0) {
      currentChild.stderr?.pipe(process.stderr);
      currentChild.stdout?.pipe(process.stdout);
    }

    currentChild.stdout?.pipe(harnessLogStream);
    currentChild.stderr?.pipe(harnessLogStream);

    const defaultTimeout = 60000;
    const testTimeoutMs = testCase.timeoutMs ?? defaultTimeout;

    console.log(`running ${testName} with timeout ${testTimeoutMs}ms`);

    const { token } = CancellationToken.timeout(testTimeoutMs);

    const resultPromise: Promise<TestRunResult> = new Promise(
      (resolve, reject) => {
        let msg: TestRunResult | undefined;
        currentChild!.on("message", (m) => {
          if (token.isCancelled) {
            return;
          }
          msg = m as TestRunResult;
        });
        currentChild!.on("exit", (code, signal) => {
          if (token.isCancelled) {
            return;
          }
          console.log(`process exited code=${code} signal=${signal}`);
          if (signal) {
            reject(new Error(`test worker exited with signal ${signal}`));
          } else if (code != 0) {
            reject(new Error(`test worker exited with code ${code}`));
          } else if (!msg) {
            reject(
              new Error(
                `test worker exited without giving back the test results`,
              ),
            );
          } else {
            resolve(msg);
          }
        });
        currentChild!.on("error", (err) => {
          if (token.isCancelled) {
            return;
          }
          reject(err);
        });
      },
    );

    let result: TestRunResult;

    try {
      result = await token.racePromise(resultPromise);
    } catch (e: any) {
      console.error(`test ${testName} timed out`);
      if (token.isCancelled) {
        result = {
          status: "fail",
          reason: "timeout",
          timeSec: testTimeoutMs / 1000,
          name: testName,
        };
        currentChild.kill("SIGTERM");
      } else {
        throw Error(e);
      }
    }

    harnessLogStream.close();

    console.log(`parent: got result ${JSON.stringify(result)}`);

    testResults.push(result);
  }

  reportAndQuit(testRootDir, testResults);
}

export function reportAndQuit(
  testRootDir: string,
  testResults: TestRunResult[],
  interrupted: boolean = false,
): never {
  let numTotal = 0;
  let numFail = 0;
  let numSkip = 0;
  let numPass = 0;

  for (const result of testResults) {
    numTotal++;
    if (result.status === "fail") {
      numFail++;
    } else if (result.status === "skip") {
      numSkip++;
    } else if (result.status === "pass") {
      numPass++;
    }
  }

  const resultsFile = path.join(testRootDir, "results.json");
  fs.writeFileSync(
    path.join(testRootDir, "results.json"),
    JSON.stringify({ testResults, interrupted }, undefined, 2),
  );
  if (interrupted) {
    console.log("test suite was interrupted");
  }
  console.log(`See ${resultsFile} for details`);
  console.log(`Skipped: ${numSkip}/${numTotal}`);
  console.log(`Failed: ${numFail}/${numTotal}`);
  console.log(`Passed: ${numPass}/${numTotal}`);

  if (interrupted) {
    process.exit(3);
  } else if (numPass < numTotal - numSkip) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

export function getTestInfo(): TestInfo[] {
  return allTests.map((x) => ({
    name: getTestName(x),
    suites: x.suites ?? [],
    excludeByDefault: x.excludeByDefault ?? false,
  }));
}

const runTestInstrStr = process.env["TWCLI_RUN_TEST_INSTRUCTION"];
if (runTestInstrStr && process.argv.includes("__TWCLI_TESTWORKER")) {
  // Test will call taler-wallet-cli, so we must not propagate this variable.
  delete process.env["TWCLI_RUN_TEST_INSTRUCTION"];
  const { testRootDir, testName } = JSON.parse(
    runTestInstrStr,
  ) as RunTestChildInstruction;
  console.log(`running test ${testName} in worker process`);

  process.on("disconnect", () => {
    console.log("got disconnect from parent");
    process.exit(3);
  });

  try {
    require("source-map-support").install();
  } catch (e) {
    // Do nothing.
  }

  const runTest = async () => {
    let testMain: TestMainFunction | undefined;
    for (const t of allTests) {
      if (getTestName(t) === testName) {
        testMain = t;
        break;
      }
    }

    if (!process.send) {
      console.error("can't communicate with parent");
      process.exit(2);
    }

    if (!testMain) {
      console.log(`test ${testName} not found`);
      process.exit(2);
    }

    const testDir = path.join(testRootDir, testName);
    console.log(`running test ${testName}`);
    const gc = new GlobalTestState({
      testDir,
    });
    const testResult = await runTestWithState(gc, testMain, testName);
    process.send(testResult);
  };

  runTest()
    .then(() => {
      console.log(`test ${testName} finished in worker`);
      if (shouldLingerInTest()) {
        console.log("lingering ...");
        return;
      }
      process.exit(0);
    })
    .catch((e) => {
      console.log(e);
      process.exit(1);
    });
}
