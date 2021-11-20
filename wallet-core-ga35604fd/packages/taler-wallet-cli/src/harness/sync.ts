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
import { URL } from "@gnu-taler/taler-util";
import * as fs from "fs";
import * as util from "util";
import {
  GlobalTestState,
  pingProc,
  ProcessWrapper,
} from "../harness/harness.js";
import { Configuration } from "@gnu-taler/taler-util";

const exec = util.promisify(require("child_process").exec);

export interface SyncConfig {
  /**
   * Human-readable name used in the test harness logs.
   */
  name: string;

  httpPort: number;

  /**
   * Database connection string (only postgres is supported).
   */
  database: string;

  annualFee: string;

  currency: string;

  uploadLimitMb: number;

  /**
   * Fulfillment URL used for contract terms related to
   * sync.
   */
  fulfillmentUrl: string;

  paymentBackendUrl: string;
}

function setSyncPaths(config: Configuration, home: string) {
  config.setString("paths", "sync_home", home);
  // We need to make sure that the path of taler_runtime_dir isn't too long,
  // as it contains unix domain sockets (108 character limit).
  const runDir = fs.mkdtempSync("/tmp/taler-test-");
  config.setString("paths", "sync_runtime_dir", runDir);
  config.setString("paths", "sync_data_home", "$SYNC_HOME/.local/share/sync/");
  config.setString("paths", "sync_config_home", "$SYNC_HOME/.config/sync/");
  config.setString("paths", "sync_cache_home", "$SYNC_HOME/.config/sync/");
}

export class SyncService {
  static async create(
    gc: GlobalTestState,
    sc: SyncConfig,
  ): Promise<SyncService> {
    const config = new Configuration();

    const cfgFilename = gc.testDir + `/sync-${sc.name}.conf`;
    setSyncPaths(config, gc.testDir + "/synchome");
    config.setString("taler", "currency", sc.currency);
    config.setString("sync", "serve", "tcp");
    config.setString("sync", "port", `${sc.httpPort}`);
    config.setString("sync", "db", "postgres");
    config.setString("syncdb-postgres", "config", sc.database);
    config.setString("sync", "payment_backend_url", sc.paymentBackendUrl);
    config.setString("sync", "upload_limit_mb", `${sc.uploadLimitMb}`);
    config.write(cfgFilename);

    return new SyncService(gc, sc, cfgFilename);
  }

  proc: ProcessWrapper | undefined;

  get baseUrl(): string {
    return `http://localhost:${this.syncConfig.httpPort}/`;
  }

  async start(): Promise<void> {
    await exec(`sync-dbinit -c "${this.configFilename}"`);

    this.proc = this.globalState.spawnService(
      "sync-httpd",
      ["-LDEBUG", "-c", this.configFilename],
      `sync-${this.syncConfig.name}`,
    );
  }

  async pingUntilAvailable(): Promise<void> {
    const url = new URL("config", this.baseUrl).href;
    await pingProc(this.proc, url, "sync");
  }

  constructor(
    private globalState: GlobalTestState,
    private syncConfig: SyncConfig,
    private configFilename: string,
  ) {}
}
