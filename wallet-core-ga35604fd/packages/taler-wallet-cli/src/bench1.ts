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
 * Imports.
 */
import {
  buildCodecForObject,
  codecForNumber,
  codecForString,
  codecOptional,
  Logger,
} from "@gnu-taler/taler-util";
import {
  getDefaultNodeWallet,
  NodeHttpLib,
  WalletApiOperation,
  Wallet,
} from "@gnu-taler/taler-wallet-core";

/**
 * Entry point for the benchmark.
 *
 * The benchmark runs against an existing Taler deployment and does not
 * set up its own services.
 */
export async function runBench1(configJson: any): Promise<void> {

  const logger = new Logger("Bench1");

  // Validate the configuration file for this benchmark.
  const b1conf = codecForBench1Config().decode(configJson);

  const myHttpLib = new NodeHttpLib();
  myHttpLib.setThrottling(false);

  const numIter = b1conf.iterations ?? 1;
  const numDeposits = b1conf.deposits ?? 5;
  const restartWallet = b1conf.restartAfter ?? 20;

  const withdrawAmount = (numDeposits + 1) * 10;

  logger.info(`Starting Benchmark iterations=${numIter} deposits=${numDeposits}`);

  let wallet = {} as Wallet;

  for (let i = 0; i < numIter; i++) {
    // Create a new wallet in each iteration 
    // otherwise the TPS go down 
    // my assumption is that the in-memory db file gets too large 
    if (i % restartWallet == 0) {
      if (Object.keys(wallet).length !== 0) {
	      wallet.stop();
      }
      wallet = await getDefaultNodeWallet({
        // No persistent DB storage.
        persistentStoragePath: undefined,
        httpLib: myHttpLib,
      });
      await wallet.client.call(WalletApiOperation.InitWallet, {});
    }
	
    logger.trace(`Starting withdrawal amount=${withdrawAmount}`);
    let start = Date.now();

    await wallet.client.call(WalletApiOperation.WithdrawFakebank, {
      amount: b1conf.currency + ":" + withdrawAmount,
      bank: b1conf.bank,
      exchange: b1conf.exchange,
    });

    await wallet.runTaskLoop({
      stopWhenDone: true,
    });

    logger.info(`Finished withdrawal amount=${withdrawAmount} time=${Date.now() - start}`);

    for (let i = 0; i < numDeposits; i++) {

      logger.trace(`Starting deposit amount=10`);
      start = Date.now()

      await wallet.client.call(WalletApiOperation.CreateDepositGroup, {
        amount: b1conf.currency + ":10",
        depositPaytoUri: b1conf.payto,
      });

      await wallet.runTaskLoop({
        stopWhenDone: true,
      });

      logger.info(`Finished deposit amount=10 time=${Date.now() - start}`);
    }
  }
}

/**
 * Format of the configuration file passed to the benchmark
 */
interface Bench1Config {
  /**
   * Base URL of the bank.
   */
  bank: string;

  /**
   * Payto url for deposits.
   */
  payto: string;

  /**
   * Base URL of the exchange.
   */
  exchange: string;

  /**
   * How many withdraw/deposit iterations should be made?
   * Defaults to 1.
   */
  iterations?: number;

  currency: string;

  deposits?: number;

  /**
   * How any iterations run until the wallet db gets purged
   * Defaults to 20.
   */
  restartAfter?: number;
}

/**
 * Schema validation codec for Bench1Config.
 */
const codecForBench1Config = () =>
  buildCodecForObject<Bench1Config>()
    .property("bank", codecForString())
    .property("payto", codecForString())
    .property("exchange", codecForString())
    .property("iterations", codecOptional(codecForNumber()))
    .property("deposits", codecOptional(codecForNumber()))
    .property("currency", codecForString())
    .property("restartAfter", codecOptional(codecForNumber()))
    .build("Bench1Config");
