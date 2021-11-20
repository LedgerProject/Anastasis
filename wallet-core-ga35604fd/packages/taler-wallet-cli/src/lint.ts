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

/**
 * The deployment linter implements checks for a deployment
 * of the GNU Taler exchange.  It is meant to help sysadmins
 * when setting up an exchange.
 *
 * The linter does checks in the configuration and uses
 * various tools of the exchange in test mode (-t).
 *
 * To be able to run the tools as the right user, the linter should be
 * run as root.
 *
 * @author Florian Dold <dold@taler.net>
 */

/**
 * Imports.
 */
import {
  codecForExchangeKeysJson,
  codecForKeysManagementResponse,
  Configuration,
  decodeCrock,
} from "@gnu-taler/taler-util";
import {
  NodeHttpLib,
  readSuccessResponseJsonOrThrow,
} from "@gnu-taler/taler-wallet-core";
import { URL } from "url";
import { spawn } from "child_process";
import { delayMs } from "./harness/harness.js";

interface BasicConf {
  mainCurrency: string;
}

interface PubkeyConf {
  masterPublicKey: string;
}

const httpLib = new NodeHttpLib();

interface ShellResult {
  stdout: string;
  stderr: string;
  status: number;
}

interface LintContext {
  /**
   * Be more verbose.
   */
  verbose: boolean;

  /**
   * Always continue even after errors.
   */
  cont: boolean;

  cfg: Configuration;

  numErr: number;
}

/**
 * Run a shell command, return stdout.
 */
export async function sh(
  context: LintContext,
  command: string,
  env: { [index: string]: string | undefined } = process.env,
): Promise<ShellResult> {
  if (context.verbose) {
    console.log("executing command:", command);
  }
  return new Promise((resolve, reject) => {
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    const proc = spawn(command, {
      stdio: ["inherit", "pipe", "pipe"],
      shell: true,
      env: env,
    });
    proc.stdout.on("data", (x) => {
      if (x instanceof Buffer) {
        stdoutChunks.push(x);
      } else {
        throw Error("unexpected data chunk type");
      }
    });
    proc.stderr.on("data", (x) => {
      if (x instanceof Buffer) {
        stderrChunks.push(x);
      } else {
        throw Error("unexpected data chunk type");
      }
    });
    proc.on("exit", (code, signal) => {
      if (code != 0 && context.verbose) {
        console.log(`child process exited (${code} / ${signal})`);
      }
      const bOut = Buffer.concat(stdoutChunks).toString("utf-8");
      const bErr = Buffer.concat(stderrChunks).toString("utf-8");
      resolve({
        status: code ?? -1,
        stderr: bErr,
        stdout: bOut,
      });
    });
    proc.on("error", () => {
      reject(Error("Child process had error"));
    });
  });
}

function checkBasicConf(context: LintContext): BasicConf {
  const cfg = context.cfg;
  const currencyEntry = cfg.getString("taler", "currency");
  let mainCurrency: string | undefined;

  if (!currencyEntry.value) {
    context.numErr++;
    console.log("error: currency not defined in section TALER option CURRENCY");
    console.log("Aborting further checks.");
    process.exit(1);
  } else {
    mainCurrency = currencyEntry.value.toUpperCase();
  }

  if (mainCurrency === "KUDOS") {
    console.log(
      "warning: section TALER option CURRENCY contains toy currency value KUDOS",
    );
  }

  const roundUnit = cfg.getAmount("taler", "currency_round_unit");
  const ru = roundUnit.required();
  if (ru.currency.toLowerCase() != mainCurrency.toLowerCase()) {
    context.numErr++;
    console.log(
      "error: [TALER]/CURRENCY_ROUND_UNIT: currency does not match main currency",
    );
  }
  return { mainCurrency };
}

function checkCoinConfig(context: LintContext, basic: BasicConf): void {
  const cfg = context.cfg;
  const coinPrefix1 = "COIN_";
  const coinPrefix2 = "COIN-";
  let numCoins = 0;

  for (const secName of cfg.getSectionNames()) {
    if (!(secName.startsWith(coinPrefix1) || secName.startsWith(coinPrefix2))) {
      continue;
    }
    numCoins++;

    // FIXME: check that section is well-formed
  }

  if (numCoins == 0) {
    context.numErr++;
    console.log(
      "error: no coin denomination configured, please configure [coin-*] sections",
    );
  }
}

async function checkWireConfig(context: LintContext): Promise<void> {
  const cfg = context.cfg;
  const accountPrefix = "EXCHANGE-ACCOUNT-";
  const accountCredentialsPrefix = "EXCHANGE-ACCOUNTCREDENTIALS-";

  let accounts = new Set<string>();
  let credentials = new Set<string>();

  for (const secName of cfg.getSectionNames()) {
    if (secName.startsWith(accountPrefix)) {
      accounts.add(secName.slice(accountPrefix.length));
      // FIXME: check settings
    }

    if (secName.startsWith(accountCredentialsPrefix)) {
      credentials.add(secName.slice(accountCredentialsPrefix.length));
      // FIXME: check settings
    }
  }

  if (accounts.size === 0) {
    context.numErr++;
    console.log(
      "error: No accounts configured (no sections EXCHANGE-ACCOUNT-*).",
    );
    if (!context.cont) {
      console.log("Aborting further checks.");
      process.exit(1);
    }
  }

  for (const acc of accounts) {
    if (!credentials.has(acc)) {
      console.log(
        `warning: no credentials configured for exchange-account-${acc}`,
      );
    }
  }

  for (const acc of accounts) {
    // test credit history
    {
      const res = await sh(
        context,
        "su -l --shell /bin/sh " +
          `-c 'taler-exchange-wire-gateway-client -s exchange-accountcredentials-${acc} --credit-history' ` +
          "taler-exchange-wire",
      );
      if (res.status != 0) {
        context.numErr++;
        console.log(res.stdout);
        console.log(res.stderr);
        console.log(
          "error: Could not run taler-exchange-wire-gateway-client. Please review logs above.",
        );
        if (!context.cont) {
          console.log("Aborting further checks.");
          process.exit(1);
        }
      }
    }
  }

  // TWG client
  {
    const res = await sh(
      context,
      `su -l --shell /bin/sh -c 'taler-exchange-wirewatch -t' taler-exchange-wire`,
    );
    if (res.status != 0) {
      context.numErr++;
      console.log(res.stdout);
      console.log(res.stderr);
      console.log("error: Could not run wirewatch. Please review logs above.");
      if (!context.cont) {
        console.log("Aborting further checks.");
        process.exit(1);
      }
    }
  }

  // Wirewatch
  {
    const res = await sh(
      context,
      `su -l --shell /bin/sh -c 'taler-exchange-wirewatch -t' taler-exchange-wire`,
    );
    if (res.status != 0) {
      context.numErr++;
      console.log(res.stdout);
      console.log(res.stderr);
      console.log("error: Could not run wirewatch. Please review logs above.");
      if (!context.cont) {
        console.log("Aborting further checks.");
        process.exit(1);
      }
    }
  }

  // Closer
  {
    const res = await sh(
      context,
      `su -l --shell /bin/sh -c 'taler-exchange-closer -t' taler-exchange-closer`,
    );
    if (res.status != 0) {
      context.numErr++;
      console.log(res.stdout);
      console.log(res.stderr);
      console.log("error: Could not run closer. Please review logs above.");
      if (!context.cont) {
        console.log("Aborting further checks.");
        process.exit(1);
      }
    }
  }
}

async function checkAggregatorConfig(context: LintContext) {
  const res = await sh(
    context,
    "su -l --shell /bin/sh -c 'taler-exchange-aggregator -t' taler-exchange-aggregator",
  );
  if (res.status != 0) {
    context.numErr++;
    console.log(res.stdout);
    console.log(res.stderr);
    console.log("error: Could not run aggregator. Please review logs above.");
    if (!context.cont) {
      console.log("Aborting further checks.");
      process.exit(1);
    }
  }
}

async function checkCloserConfig(context: LintContext) {
  const res = await sh(
    context,
    `su -l --shell /bin/sh -c 'taler-exchange-closer -t' taler-exchange-closer`,
  );
  if (res.status != 0) {
    context.numErr++;
    console.log(res.stdout);
    console.log(res.stderr);
    console.log("error: Could not run closer. Please review logs above.");
    if (!context.cont) {
      console.log("Aborting further checks.");
      process.exit(1);
    }
  }
}

function checkMasterPublicKeyConfig(context: LintContext): PubkeyConf {
  const cfg = context.cfg;
  const pub = cfg.getString("exchange", "master_public_key");

  const pubDecoded = decodeCrock(pub.required());

  if (pubDecoded.length != 32) {
    context.numErr++;
    console.log("error: invalid master public key");
    if (!context.cont) {
      console.log("Aborting further checks.");
      process.exit(1);
    }
  }

  return {
    masterPublicKey: pub.required(),
  };
}

export async function checkExchangeHttpd(
  context: LintContext,
  pubConf: PubkeyConf,
): Promise<void> {
  const cfg = context.cfg;
  const baseUrlEntry = cfg.getString("exchange", "base_url");

  if (!baseUrlEntry.isDefined) {
    context.numErr++;
    console.log(
      "error: configuration needs to specify section EXCHANGE option BASE_URL",
    );
    if (!context.cont) {
      console.log("Aborting further checks.");
      process.exit(1);
    }
  }

  const baseUrl = baseUrlEntry.required();

  if (!baseUrl.startsWith("http")) {
    context.numErr++;
    console.log(
      "error: section EXCHANGE option BASE_URL needs to be an http or https URL",
    );
    if (!context.cont) {
      console.log("Aborting further checks.");
      process.exit(1);
    }
  }

  if (!baseUrl.endsWith("/")) {
    context.numErr++;
    console.log(
      "error: section EXCHANGE option BASE_URL needs to end with a slash",
    );
    if (!context.cont) {
      console.log("Aborting further checks.");
      process.exit(1);
    }
  }

  if (!baseUrl.startsWith("https://")) {
    console.log(
      "warning: section EXCHANGE option BASE_URL: it is recommended to serve the exchange via HTTPS",
    );
  }

  {
    const mgmtUrl = new URL("management/keys", baseUrl);
    const resp = await httpLib.get(mgmtUrl.href);

    const futureKeys = await readSuccessResponseJsonOrThrow(
      resp,
      codecForKeysManagementResponse(),
    );

    if (futureKeys.future_denoms.length > 0) {
      console.log(
        `warning: exchange has denomination keys that need to be signed by the offline signing procedure`,
      );
    }

    if (futureKeys.future_signkeys.length > 0) {
      console.log(
        `warning: exchange has signing keys that need to be signed by the offline signing procedure`,
      );
    }
  }

  // Check if we can use /keys already
  {
    const keysUrl = new URL("keys", baseUrl);

    const resp = await Promise.race([httpLib.get(keysUrl.href), delayMs(2000)]);

    if (!resp) {
      context.numErr++;
      console.log(
        "error: request to /keys timed out. " +
          "Make sure to sign and upload denomination and signing keys " +
          "with taler-exchange-offline.",
      );
      if (!context.cont) {
        console.log("Aborting further checks.");
        process.exit(1);
      }
    } else {
      const keys = await readSuccessResponseJsonOrThrow(
        resp,
        codecForExchangeKeysJson(),
      );

      if (keys.master_public_key !== pubConf.masterPublicKey) {
        context.numErr++;
        console.log(
          "error: master public key of exchange does not match public key of live exchange",
        );
        if (!context.cont) {
          console.log("Aborting further checks.");
          process.exit(1);
        }
      }
    }
  }

  // Check /wire
  {
    const keysUrl = new URL("wire", baseUrl);

    const resp = await Promise.race([httpLib.get(keysUrl.href), delayMs(2000)]);

    if (!resp) {
      context.numErr++;
      console.log(
        "error: request to /wire timed out. " +
          "Make sure to sign and upload accounts and wire fees " +
          "using the taler-exchange-offline tool.",
      );
      if (!context.cont) {
        console.log("Aborting further checks.");
        process.exit(1);
      }
    } else {
      if (resp.status !== 200) {
        console.log(
          "error:  Can't access exchange /wire.  Please check " +
            "the logs of taler-exchange-httpd for further information.",
        );
      }
    }
  }
}

/**
 * Do some basic checks in the configuration of a Taler deployment.
 */
export async function lintExchangeDeployment(
  verbose: boolean,
  cont: boolean,
): Promise<void> {
  if (process.getuid() != 0) {
    console.log(
      "warning: the exchange deployment linter is designed to be run as root",
    );
  }

  const cfg = Configuration.load();

  const context: LintContext = {
    cont,
    verbose,
    cfg,
    numErr: 0,
  };

  const basic = checkBasicConf(context);

  checkCoinConfig(context, basic);

  await checkWireConfig(context);

  await checkAggregatorConfig(context);

  await checkCloserConfig(context);

  const pubConf = checkMasterPublicKeyConfig(context);

  await checkExchangeHttpd(context, pubConf);

  if (context.numErr == 0) {
    console.log("Linting completed without errors.");
    process.exit(0);
  } else {
    console.log(`Linting completed with ${context.numErr} errors.`);
    process.exit(1);
  }
}
