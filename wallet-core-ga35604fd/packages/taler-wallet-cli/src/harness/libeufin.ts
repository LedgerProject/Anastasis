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
 * This file defines euFin test logic that needs state
 * and that depends on the main harness.ts.  The other
 * definitions - mainly helper functions to call RESTful
 * APIs - moved to libeufin-apis.ts.  That enables harness.ts
 * to depend on such API calls, in contrast to the previous
 * situation where harness.ts had to include this file causing
 * a circular dependency.  */

/**
 * Imports.
 */
import axios from "axios";
import { URL } from "@gnu-taler/taler-util";
import {
  GlobalTestState,
  DbInfo,
  pingProc,
  ProcessWrapper,
  runCommand,
  setupDb,
  sh,
  getRandomIban
} from "../harness/harness.js";
import {
  LibeufinSandboxApi,
  LibeufinNexusApi,
  CreateEbicsBankAccountRequest,
  LibeufinSandboxServiceInterface,
  CreateTalerWireGatewayFacadeRequest,
  SimulateIncomingTransactionRequest,
  SandboxAccountTransactions,
  DeleteBankConnectionRequest,
  CreateEbicsBankConnectionRequest,
  UpdateNexusUserRequest,
  NexusAuth,
  CreateAnastasisFacadeRequest,
  PostNexusTaskRequest,
  PostNexusPermissionRequest,
  CreateNexusUserRequest
} from "../harness/libeufin-apis.js";

export {
  LibeufinSandboxApi,
  LibeufinNexusApi
}

export interface LibeufinServices {
  libeufinSandbox: LibeufinSandboxService;
  libeufinNexus: LibeufinNexusService;
  commonDb: DbInfo;
}

export interface LibeufinSandboxConfig {
  httpPort: number;
  databaseJdbcUri: string;
}

export interface LibeufinNexusConfig {
  httpPort: number;
  databaseJdbcUri: string;
}

interface LibeufinNexusMoneyMovement {
  amount: string;
  creditDebitIndicator: string;
  details: {
    debtor: {
      name: string;
    };
    debtorAccount: {
      iban: string;
    };
    debtorAgent: {
      bic: string;
    };
    creditor: {
      name: string;
    };
    creditorAccount: {
      iban: string;
    };
    creditorAgent: {
      bic: string;
    };
    endToEndId: string;
    unstructuredRemittanceInformation: string;
  };
}

interface LibeufinNexusBatches {
  batchTransactions: Array<LibeufinNexusMoneyMovement>;
}

interface LibeufinNexusTransaction {
  amount: string;
  creditDebitIndicator: string;
  status: string;
  bankTransactionCode: string;
  valueDate: string;
  bookingDate: string;
  accountServicerRef: string;
  batches: Array<LibeufinNexusBatches>;
}

interface LibeufinNexusTransactions {
  transactions: Array<LibeufinNexusTransaction>;
}

export interface LibeufinCliDetails {
  nexusUrl: string;
  sandboxUrl: string;
  nexusDatabaseUri: string;
  sandboxDatabaseUri: string;
  user: LibeufinNexusUser;
}

export interface LibeufinEbicsSubscriberDetails {
  hostId: string;
  partnerId: string;
  userId: string;
}

export interface LibeufinEbicsConnectionDetails {
  subscriberDetails: LibeufinEbicsSubscriberDetails;
  ebicsUrl: string;
  connectionName: string;
}

export interface LibeufinBankAccountDetails {
  currency: string;
  iban: string;
  bic: string;
  personName: string;
  accountName: string;
}

export interface LibeufinNexusUser {
  username: string;
  password: string;
}

export interface LibeufinBackupFileDetails {
  passphrase: string;
  outputFile: string;
  connectionName: string;
}

export interface LibeufinKeyLetterDetails {
  outputFile: string;
  connectionName: string;
}

export interface LibeufinBankAccountImportDetails {
  offeredBankAccountName: string;
  nexusBankAccountName: string;
  connectionName: string;
}

export interface LibeufinPreparedPaymentDetails {
  creditorIban: string;
  creditorBic: string;
  creditorName: string;
  subject: string;
  amount: string;
  currency: string;
  nexusBankAccountName: string;
}

export class LibeufinSandboxService implements LibeufinSandboxServiceInterface {
  static async create(
    gc: GlobalTestState,
    sandboxConfig: LibeufinSandboxConfig,
  ): Promise<LibeufinSandboxService> {
    return new LibeufinSandboxService(gc, sandboxConfig);
  }

  sandboxProc: ProcessWrapper | undefined;
  globalTestState: GlobalTestState;

  constructor(
    gc: GlobalTestState,
    private sandboxConfig: LibeufinSandboxConfig,
  ) {
    this.globalTestState = gc;
  }

  get baseUrl(): string {
    return `http://localhost:${this.sandboxConfig.httpPort}/`;
  }

  async start(): Promise<void> {
    this.sandboxProc = this.globalTestState.spawnService(
      "libeufin-sandbox",
      ["serve", "--port", `${this.sandboxConfig.httpPort}`],
      "libeufin-sandbox",
      {
        ...process.env,
        LIBEUFIN_SANDBOX_DB_CONNECTION: this.sandboxConfig.databaseJdbcUri,
        LIBEUFIN_SANDBOX_ADMIN_PASSWORD: "secret",
      },
    );
  }

  async c53tick(): Promise<string> {
    const stdout = await sh(
      this.globalTestState,
      "libeufin-sandbox-c53tick",
      "libeufin-sandbox camt053tick",
      {
        ...process.env,
        LIBEUFIN_SANDBOX_DB_CONNECTION: this.sandboxConfig.databaseJdbcUri,
      },
    );
    return stdout;
  }

  async makeTransaction(
    debit: string,
    credit: string,
    amount: string, // $currency:x.y
    subject: string,): Promise<string> {
    const stdout = await sh(
      this.globalTestState,
      "libeufin-sandbox-maketransfer",
      `libeufin-sandbox make-transaction --debit-account=${debit} --credit-account=${credit} ${amount} "${subject}"`,
      {
        ...process.env,
        LIBEUFIN_SANDBOX_DB_CONNECTION: this.sandboxConfig.databaseJdbcUri,
      },
    );
    return stdout;
  }

  async pingUntilAvailable(): Promise<void> {
    const url = this.baseUrl;
    await pingProc(this.sandboxProc, url, "libeufin-sandbox");
  }
}

export class LibeufinNexusService {
  static async create(
    gc: GlobalTestState,
    nexusConfig: LibeufinNexusConfig,
  ): Promise<LibeufinNexusService> {
    return new LibeufinNexusService(gc, nexusConfig);
  }

  nexusProc: ProcessWrapper | undefined;
  globalTestState: GlobalTestState;

  constructor(gc: GlobalTestState, private nexusConfig: LibeufinNexusConfig) {
    this.globalTestState = gc;
  }

  get baseUrl(): string {
    return `http://localhost:${this.nexusConfig.httpPort}/`;
  }

  async start(): Promise<void> {
    await runCommand(
      this.globalTestState,
      "libeufin-nexus-superuser",
      "libeufin-nexus",
      ["superuser", "admin", "--password", "test"],
      {
        ...process.env,
        LIBEUFIN_NEXUS_DB_CONNECTION: this.nexusConfig.databaseJdbcUri,
      },
    );

    this.nexusProc = this.globalTestState.spawnService(
      "libeufin-nexus",
      ["serve", "--port", `${this.nexusConfig.httpPort}`],
      "libeufin-nexus",
      {
        ...process.env,
        LIBEUFIN_NEXUS_DB_CONNECTION: this.nexusConfig.databaseJdbcUri,
      },
    );
  }

  async pingUntilAvailable(): Promise<void> {
    const url = `${this.baseUrl}config`;
    await pingProc(this.nexusProc, url, "libeufin-nexus");
  }

  async createNexusSuperuser(details: LibeufinNexusUser): Promise<void> {
    const stdout = await sh(
      this.globalTestState,
      "libeufin-nexus",
      `libeufin-nexus superuser ${details.username} --password=${details.password}`,
      {
        ...process.env,
        LIBEUFIN_NEXUS_DB_CONNECTION: this.nexusConfig.databaseJdbcUri,
      },
    );
    console.log(stdout);
  }
}

export interface TwgAddIncomingRequest {
  amount: string;
  reserve_pub: string;
  debit_account: string;
}

/**
 * The bundle aims at minimizing the amount of input
 * data that is required to initialize a new user + Ebics
 * connection.
 */
export class NexusUserBundle {
  userReq: CreateNexusUserRequest;
  connReq: CreateEbicsBankConnectionRequest;
  anastasisReq: CreateAnastasisFacadeRequest;
  twgReq: CreateTalerWireGatewayFacadeRequest;
  twgTransferPermission: PostNexusPermissionRequest;
  twgHistoryPermission: PostNexusPermissionRequest;
  twgAddIncomingPermission: PostNexusPermissionRequest;
  localAccountName: string;
  remoteAccountName: string;

  constructor(salt: string, ebicsURL: string) {
    this.userReq = {
      username: `username-${salt}`,
      password: `password-${salt}`,
    };

    this.connReq = {
      name: `connection-${salt}`,
      ebicsURL: ebicsURL,
      hostID: `ebicshost,${salt}`,
      partnerID: `ebicspartner,${salt}`,
      userID: `ebicsuser,${salt}`,
    };

    this.twgReq = {
      currency: "EUR",
      name: `twg-${salt}`,
      reserveTransferLevel: "report",
      accountName: `local-account-${salt}`,
      connectionName: `connection-${salt}`,
    };
    this.anastasisReq = {
      currency: "EUR",
      name: `anastasis-${salt}`,
      reserveTransferLevel: "report",
      accountName: `local-account-${salt}`,
      connectionName: `connection-${salt}`,
    };
    this.remoteAccountName = `remote-account-${salt}`;
    this.localAccountName = `local-account-${salt}`;
    this.twgTransferPermission = {
      action: "grant",
      permission: {
        subjectId: `username-${salt}`,
        subjectType: "user",
        resourceType: "facade",
        resourceId: `twg-${salt}`,
        permissionName: "facade.talerWireGateway.transfer",
      },
    };
    this.twgHistoryPermission = {
      action: "grant",
      permission: {
        subjectId: `username-${salt}`,
        subjectType: "user",
        resourceType: "facade",
        resourceId: `twg-${salt}`,
        permissionName: "facade.talerWireGateway.history",
      },
    };
  }
}

/**
 * The bundle aims at minimizing the amount of input
 * data that is required to initialize a new Sandbox
 * customer, associating their bank account with a Ebics
 * subscriber.
 */
export class SandboxUserBundle {
  ebicsBankAccount: CreateEbicsBankAccountRequest;
  constructor(salt: string) {
    this.ebicsBankAccount = {
      bic: "BELADEBEXXX",
      iban: getRandomIban(),
      label: `remote-account-${salt}`,
      name: `Taler Exchange: ${salt}`,
      subscriber: {
        hostID: `ebicshost,${salt}`,
        partnerID: `ebicspartner,${salt}`,
        userID: `ebicsuser,${salt}`,
      },
    };
  }
}

export class LibeufinCli {
  cliDetails: LibeufinCliDetails;
  globalTestState: GlobalTestState;

  constructor(gc: GlobalTestState, cd: LibeufinCliDetails) {
    this.globalTestState = gc;
    this.cliDetails = cd;
  }

  env(): any {
    return {
      ...process.env,
      LIBEUFIN_SANDBOX_URL: this.cliDetails.sandboxUrl,
      LIBEUFIN_SANDBOX_USERNAME: "admin",
      LIBEUFIN_SANDBOX_PASSWORD: "secret",
    }
  }

  async checkSandbox(): Promise<void> {
    const stdout = await sh(
      this.globalTestState,
      "libeufin-cli-checksandbox",
      "libeufin-cli sandbox check",
      this.env()
    );
  }

  async createEbicsHost(hostId: string): Promise<void> {
    const stdout = await sh(
      this.globalTestState,
      "libeufin-cli-createebicshost",
      `libeufin-cli sandbox ebicshost create --host-id=${hostId}`,
      this.env()
    );
    console.log(stdout);
  }

  async createEbicsSubscriber(
    details: LibeufinEbicsSubscriberDetails,
  ): Promise<void> {
    const stdout = await sh(
      this.globalTestState,
      "libeufin-cli-createebicssubscriber",
      "libeufin-cli sandbox ebicssubscriber create" +
        ` --host-id=${details.hostId}` +
        ` --partner-id=${details.partnerId}` +
        ` --user-id=${details.userId}`,
      this.env()
    );
    console.log(stdout);
  }

  async createEbicsBankAccount(
    sd: LibeufinEbicsSubscriberDetails,
    bankAccountDetails: LibeufinBankAccountDetails,
  ): Promise<void> {
    const stdout = await sh(
      this.globalTestState,
      "libeufin-cli-createebicsbankaccount",
      "libeufin-cli sandbox ebicsbankaccount create" +
        ` --iban=${bankAccountDetails.iban}` +
        ` --bic=${bankAccountDetails.bic}` +
        ` --person-name='${bankAccountDetails.personName}'` +
        ` --account-name=${bankAccountDetails.accountName}` +
        ` --ebics-host-id=${sd.hostId}` +
        ` --ebics-partner-id=${sd.partnerId}` +
        ` --ebics-user-id=${sd.userId}`,
      this.env()
    );
    console.log(stdout);
  }

  async generateTransactions(accountName: string): Promise<void> {
    const stdout = await sh(
      this.globalTestState,
      "libeufin-cli-generatetransactions",
      `libeufin-cli sandbox bankaccount generate-transactions ${accountName}`,
      this.env()
    );
    console.log(stdout);
  }

  async showSandboxTransactions(accountName: string): Promise<void> {
    const stdout = await sh(
      this.globalTestState,
      "libeufin-cli-showsandboxtransactions",
      `libeufin-cli sandbox bankaccount transactions ${accountName}`,
      this.env()
    );
    console.log(stdout);
  }

  async createEbicsConnection(
    connectionDetails: LibeufinEbicsConnectionDetails,
  ): Promise<void> {
    const stdout = await sh(
      this.globalTestState,
      "libeufin-cli-createebicsconnection",
      `libeufin-cli connections new-ebics-connection` +
        ` --ebics-url=${connectionDetails.ebicsUrl}` +
        ` --host-id=${connectionDetails.subscriberDetails.hostId}` +
        ` --partner-id=${connectionDetails.subscriberDetails.partnerId}` +
        ` --ebics-user-id=${connectionDetails.subscriberDetails.userId}` +
        ` ${connectionDetails.connectionName}`,
      {
        ...process.env,
        LIBEUFIN_NEXUS_URL: this.cliDetails.nexusUrl,
        LIBEUFIN_NEXUS_USERNAME: this.cliDetails.user.username,
        LIBEUFIN_NEXUS_PASSWORD: this.cliDetails.user.password,
      },
    );
    console.log(stdout);
  }

  async createBackupFile(details: LibeufinBackupFileDetails): Promise<void> {
    const stdout = await sh(
      this.globalTestState,
      "libeufin-cli-createbackupfile",
      `libeufin-cli connections export-backup` +
        ` --passphrase=${details.passphrase}` +
        ` --output-file=${details.outputFile}` +
        ` ${details.connectionName}`,
      {
        ...process.env,
        LIBEUFIN_NEXUS_URL: this.cliDetails.nexusUrl,
        LIBEUFIN_NEXUS_USERNAME: this.cliDetails.user.username,
        LIBEUFIN_NEXUS_PASSWORD: this.cliDetails.user.password,
      },
    );
    console.log(stdout);
  }

  async createKeyLetter(details: LibeufinKeyLetterDetails): Promise<void> {
    const stdout = await sh(
      this.globalTestState,
      "libeufin-cli-createkeyletter",
      `libeufin-cli connections get-key-letter` +
        ` ${details.connectionName} ${details.outputFile}`,
      {
        ...process.env,
        LIBEUFIN_NEXUS_URL: this.cliDetails.nexusUrl,
        LIBEUFIN_NEXUS_USERNAME: this.cliDetails.user.username,
        LIBEUFIN_NEXUS_PASSWORD: this.cliDetails.user.password,
      },
    );
    console.log(stdout);
  }

  async connect(connectionName: string): Promise<void> {
    const stdout = await sh(
      this.globalTestState,
      "libeufin-cli-connect",
      `libeufin-cli connections connect ${connectionName}`,
      {
        ...process.env,
        LIBEUFIN_NEXUS_URL: this.cliDetails.nexusUrl,
        LIBEUFIN_NEXUS_USERNAME: this.cliDetails.user.username,
        LIBEUFIN_NEXUS_PASSWORD: this.cliDetails.user.password,
      },
    );
    console.log(stdout);
  }

  async downloadBankAccounts(connectionName: string): Promise<void> {
    const stdout = await sh(
      this.globalTestState,
      "libeufin-cli-downloadbankaccounts",
      `libeufin-cli connections download-bank-accounts ${connectionName}`,
      {
        ...process.env,
        LIBEUFIN_NEXUS_URL: this.cliDetails.nexusUrl,
        LIBEUFIN_NEXUS_USERNAME: this.cliDetails.user.username,
        LIBEUFIN_NEXUS_PASSWORD: this.cliDetails.user.password,
      },
    );
    console.log(stdout);
  }

  async listOfferedBankAccounts(connectionName: string): Promise<void> {
    const stdout = await sh(
      this.globalTestState,
      "libeufin-cli-listofferedbankaccounts",
      `libeufin-cli connections list-offered-bank-accounts ${connectionName}`,
      {
        ...process.env,
        LIBEUFIN_NEXUS_URL: this.cliDetails.nexusUrl,
        LIBEUFIN_NEXUS_USERNAME: this.cliDetails.user.username,
        LIBEUFIN_NEXUS_PASSWORD: this.cliDetails.user.password,
      },
    );
    console.log(stdout);
  }

  async importBankAccount(
    importDetails: LibeufinBankAccountImportDetails,
  ): Promise<void> {
    const stdout = await sh(
      this.globalTestState,
      "libeufin-cli-importbankaccount",
      "libeufin-cli connections import-bank-account" +
        ` --offered-account-id=${importDetails.offeredBankAccountName}` +
        ` --nexus-bank-account-id=${importDetails.nexusBankAccountName}` +
        ` ${importDetails.connectionName}`,
      {
        ...process.env,
        LIBEUFIN_NEXUS_URL: this.cliDetails.nexusUrl,
        LIBEUFIN_NEXUS_USERNAME: this.cliDetails.user.username,
        LIBEUFIN_NEXUS_PASSWORD: this.cliDetails.user.password,
      },
    );
    console.log(stdout);
  }

  async fetchTransactions(bankAccountName: string): Promise<void> {
    const stdout = await sh(
      this.globalTestState,
      "libeufin-cli-fetchtransactions",
      `libeufin-cli accounts fetch-transactions ${bankAccountName}`,
      {
        ...process.env,
        LIBEUFIN_NEXUS_URL: this.cliDetails.nexusUrl,
        LIBEUFIN_NEXUS_USERNAME: this.cliDetails.user.username,
        LIBEUFIN_NEXUS_PASSWORD: this.cliDetails.user.password,
      },
    );
    console.log(stdout);
  }

  async transactions(bankAccountName: string): Promise<void> {
    const stdout = await sh(
      this.globalTestState,
      "libeufin-cli-transactions",
      `libeufin-cli accounts transactions ${bankAccountName}`,
      {
        ...process.env,
        LIBEUFIN_NEXUS_URL: this.cliDetails.nexusUrl,
        LIBEUFIN_NEXUS_USERNAME: this.cliDetails.user.username,
        LIBEUFIN_NEXUS_PASSWORD: this.cliDetails.user.password,
      },
    );
    console.log(stdout);
  }

  async preparePayment(details: LibeufinPreparedPaymentDetails): Promise<void> {
    const stdout = await sh(
      this.globalTestState,
      "libeufin-cli-preparepayment",
      `libeufin-cli accounts prepare-payment` +
        ` --creditor-iban=${details.creditorIban}` +
        ` --creditor-bic=${details.creditorBic}` +
        ` --creditor-name='${details.creditorName}'` +
        ` --payment-subject='${details.subject}'` +
        ` --payment-amount=${details.currency}:${details.amount}` +
        ` ${details.nexusBankAccountName}`,
      {
        ...process.env,
        LIBEUFIN_NEXUS_URL: this.cliDetails.nexusUrl,
        LIBEUFIN_NEXUS_USERNAME: this.cliDetails.user.username,
        LIBEUFIN_NEXUS_PASSWORD: this.cliDetails.user.password,
      },
    );
    console.log(stdout);
  }

  async submitPayment(
    details: LibeufinPreparedPaymentDetails,
    paymentUuid: string,
  ): Promise<void> {
    const stdout = await sh(
      this.globalTestState,
      "libeufin-cli-submitpayment",
      `libeufin-cli accounts submit-payment` +
        ` --payment-uuid=${paymentUuid}` +
        ` ${details.nexusBankAccountName}`,
      {
        ...process.env,
        LIBEUFIN_NEXUS_URL: this.cliDetails.nexusUrl,
        LIBEUFIN_NEXUS_USERNAME: this.cliDetails.user.username,
        LIBEUFIN_NEXUS_PASSWORD: this.cliDetails.user.password,
      },
    );
    console.log(stdout);
  }

  async newAnastasisFacade(req: NewAnastasisFacadeReq): Promise<void> {
    const stdout = await sh(
      this.globalTestState,
      "libeufin-cli-new-anastasis-facade",
      `libeufin-cli facades new-anastasis-facade` +
        ` --currency ${req.currency}` +
        ` --facade-name ${req.facadeName}` +
        ` ${req.connectionName} ${req.accountName}`,
      {
        ...process.env,
        LIBEUFIN_NEXUS_URL: this.cliDetails.nexusUrl,
        LIBEUFIN_NEXUS_USERNAME: this.cliDetails.user.username,
        LIBEUFIN_NEXUS_PASSWORD: this.cliDetails.user.password,
      },
    );
    console.log(stdout);
  }

  async newTalerWireGatewayFacade(req: NewTalerWireGatewayReq): Promise<void> {
    const stdout = await sh(
      this.globalTestState,
      "libeufin-cli-new-taler-wire-gateway-facade",
      `libeufin-cli facades new-taler-wire-gateway-facade` +
        ` --currency ${req.currency}` +
        ` --facade-name ${req.facadeName}` +
        ` ${req.connectionName} ${req.accountName}`,
      {
        ...process.env,
        LIBEUFIN_NEXUS_URL: this.cliDetails.nexusUrl,
        LIBEUFIN_NEXUS_USERNAME: this.cliDetails.user.username,
        LIBEUFIN_NEXUS_PASSWORD: this.cliDetails.user.password,
      },
    );
    console.log(stdout);
  }

  async listFacades(): Promise<void> {
    const stdout = await sh(
      this.globalTestState,
      "libeufin-cli-facades-list",
      `libeufin-cli facades list`,
      {
        ...process.env,
        LIBEUFIN_NEXUS_URL: this.cliDetails.nexusUrl,
        LIBEUFIN_NEXUS_USERNAME: this.cliDetails.user.username,
        LIBEUFIN_NEXUS_PASSWORD: this.cliDetails.user.password,
      },
    );
    console.log(stdout);
  }
}

interface NewAnastasisFacadeReq {
  facadeName: string;
  connectionName: string;
  accountName: string;
  currency: string;
}

interface NewTalerWireGatewayReq {
  facadeName: string;
  connectionName: string;
  accountName: string;
  currency: string;
}

/**
 * Launch Nexus and Sandbox AND creates users / facades / bank accounts /
 * .. all that's required to start making banking traffic.
 */
export async function launchLibeufinServices(
  t: GlobalTestState,
  nexusUserBundle: NexusUserBundle[],
  sandboxUserBundle: SandboxUserBundle[] = [],
  withFacades: string[] = [], // takes only "twg" and/or "anastasis"
): Promise<LibeufinServices> {
  const db = await setupDb(t);

  const libeufinSandbox = await LibeufinSandboxService.create(t, {
    httpPort: 5010,
    databaseJdbcUri: `jdbc:sqlite:${t.testDir}/libeufin-sandbox.sqlite3`,
  });

  await libeufinSandbox.start();
  await libeufinSandbox.pingUntilAvailable();

  const libeufinNexus = await LibeufinNexusService.create(t, {
    httpPort: 5011,
    databaseJdbcUri: `jdbc:sqlite:${t.testDir}/libeufin-nexus.sqlite3`,
  });

  await libeufinNexus.start();
  await libeufinNexus.pingUntilAvailable();
  console.log("Libeufin services launched!");

  for (let sb of sandboxUserBundle) {
    await LibeufinSandboxApi.createEbicsHost(
      libeufinSandbox,
      sb.ebicsBankAccount.subscriber.hostID,
    );
    await LibeufinSandboxApi.createEbicsSubscriber(
      libeufinSandbox,
      sb.ebicsBankAccount.subscriber,
    );
    await LibeufinSandboxApi.createEbicsBankAccount(
      libeufinSandbox,
      sb.ebicsBankAccount,
    );
  }
  console.log("Sandbox user(s) / account(s) / subscriber(s): created");

  for (let nb of nexusUserBundle) {
    await LibeufinNexusApi.createEbicsBankConnection(libeufinNexus, nb.connReq);
    await LibeufinNexusApi.connectBankConnection(
      libeufinNexus,
      nb.connReq.name,
    );
    await LibeufinNexusApi.fetchAccounts(libeufinNexus, nb.connReq.name);
    await LibeufinNexusApi.importConnectionAccount(
      libeufinNexus,
      nb.connReq.name,
      nb.remoteAccountName,
      nb.localAccountName,
    );
    await LibeufinNexusApi.createUser(libeufinNexus, nb.userReq);
    for (let facade of withFacades) {
      switch (facade) {
        case "twg":
          await LibeufinNexusApi.createTwgFacade(libeufinNexus, nb.twgReq);
          await LibeufinNexusApi.postPermission(
            libeufinNexus,
            nb.twgTransferPermission,
          );
          await LibeufinNexusApi.postPermission(
            libeufinNexus,
            nb.twgHistoryPermission,
          );
	  break;
        case "anastasis":
	  await LibeufinNexusApi.createAnastasisFacade(libeufinNexus, nb.anastasisReq);
      }
    }
  }
  console.log(
    "Nexus user(s) / connection(s) / facade(s) / permission(s): created",
  );

  return {
    commonDb: db,
    libeufinNexus: libeufinNexus,
    libeufinSandbox: libeufinSandbox,
  };
}

/**
 * Helper function that searches a payment among
 * a list, as returned by Nexus.  The key is just
 * the payment subject.
 */
export function findNexusPayment(
  key: string,
  payments: LibeufinNexusTransactions,
): LibeufinNexusMoneyMovement | void {
  let transactions = payments["transactions"];
  for (let i = 0; i < transactions.length; i++) {
    let batches = transactions[i]["batches"];
    for (let y = 0; y < batches.length; y++) {
      let movements = batches[y]["batchTransactions"];
      for (let z = 0; z < movements.length; z++) {
        let movement = movements[z];
        if (movement["details"]["unstructuredRemittanceInformation"] == key)
          return movement;
      }
    }
  }
}
