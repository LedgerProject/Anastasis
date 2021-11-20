
/**
 * This file defines most of the API calls offered
 * by Nexus and Sandbox.  They don't have state,
 * therefore got moved away from libeufin.ts where
 * the services get actually started and managed.
 */


import axios from "axios";
import { URL } from "@gnu-taler/taler-util";

export interface LibeufinSandboxServiceInterface {
  baseUrl: string;
}

export interface LibeufinNexusServiceInterface {
  baseUrl: string;
}

export interface CreateEbicsSubscriberRequest {
  hostID: string;
  userID: string;
  partnerID: string;
  systemID?: string;
}

export interface BankAccountInfo {
  iban: string;
  bic: string;
  name: string;
  label: string;
}

export interface CreateEbicsBankConnectionRequest {
  name: string; // connection name.
  ebicsURL: string;
  hostID: string;
  userID: string;
  partnerID: string;
  systemID?: string;
}

export interface UpdateNexusUserRequest {
  newPassword: string;
}

export interface NexusAuth {
  auth: {
    username: string;
    password: string;
  };
}

export interface PostNexusTaskRequest {
  name: string;
  cronspec: string;
  type: string; // fetch | submit
  params:
    | {
        level: string; // report | statement | all
        rangeType: string; // all | since-last | previous-days | latest
      }
    | {};
}

export interface CreateNexusUserRequest {
  username: string;
  password: string;
}

export interface PostNexusPermissionRequest {
  action: "revoke" | "grant";
  permission: {
    subjectType: string;
    subjectId: string;
    resourceType: string;
    resourceId: string;
    permissionName: string;
  };
}


export interface CreateAnastasisFacadeRequest {
  name: string;
  connectionName: string;
  accountName: string;
  currency: string;
  reserveTransferLevel: "report" | "statement" | "notification";
}

export interface CreateTalerWireGatewayFacadeRequest {
  name: string;
  connectionName: string;
  accountName: string;
  currency: string;
  reserveTransferLevel: "report" | "statement" | "notification";
}

export interface SandboxAccountTransactions {
  payments: {
    accountLabel: string;
    creditorIban: string;
    creditorBic?: string;
    creditorName: string;
    debtorIban: string;
    debtorBic: string;
    debtorName: string;
    amount: string;
    currency: string;
    subject: string;
    date: string;
    creditDebitIndicator: "debit" | "credit";
    accountServicerReference: string;
  }[];
}

export interface DeleteBankConnectionRequest {
  bankConnectionId: string;
}

export interface SimulateIncomingTransactionRequest {
  debtorIban: string;
  debtorBic: string;
  debtorName: string;

  /**
   * Subject / unstructured remittance info.
   */
  subject: string;

  /**
   * Decimal amount without currency.
   */
  amount: string;
}


export interface CreateEbicsBankAccountRequest {
  subscriber: {
    hostID: string;
    partnerID: string;
    userID: string;
    systemID?: string;
  };
  // IBAN
  iban: string;
  // BIC
  bic: string;
  // human name
  name: string;
  label: string;
}

export interface LibeufinSandboxAddIncomingRequest {
  creditorIban: string;
  creditorBic: string;
  creditorName: string;
  debtorIban: string;
  debtorBic: string;
  debtorName: string;
  subject: string;
  amount: string;
  currency: string;
  uid: string;
  direction: string;
}

function getRandomString(): string {
  return Math.random().toString(36).substring(2);
}

export namespace LibeufinSandboxApi {

  /**
   * Return balance and payto-address of 'accountLabel'.
   * Note: the demobank serving the request is hard-coded
   * inside the base URL, and therefore contained in
   * 'libeufinSandboxService'.
   */
  export async function demobankAccountInfo(
    username: string,
    password: string,
    libeufinSandboxService: LibeufinSandboxServiceInterface,
    accountLabel: string
  ) {
    let url = new URL(`accounts/${accountLabel}`,libeufinSandboxService.baseUrl); 
    return await axios.get(url.href, {
      auth: {
        username: username,
        password: password 
      }
    });
  }

  // Creates one bank account via the Access API.
  export async function createDemobankAccount(
    username: string,
    password: string,
    libeufinSandboxService: LibeufinSandboxServiceInterface,
  ) {
    let url = new URL("testing/register", libeufinSandboxService.baseUrl); 
    await axios.post(url.href, {
      username: username,
      password: password 
    });
  }

  export async function createDemobankEbicsSubscriber(
    req: CreateEbicsSubscriberRequest,
    demobankAccountLabel: string,
    libeufinSandboxService: LibeufinSandboxServiceInterface,
    username: string = "admin",
    password: string = "secret",
  ) {
    // baseUrl should already be pointed to one demobank.
    let url = new URL("ebics/subscribers", libeufinSandboxService.baseUrl);
    await axios.post(url.href, {
      userID: req.userID,
      hostID: req.hostID,
      partnerID: req.partnerID,
      demobankAccountLabel: demobankAccountLabel,
    }, {
      auth: {
        username: "admin",
        password: "secret",
      },
    });
  }

  export async function rotateKeys(
    libeufinSandboxService: LibeufinSandboxServiceInterface,
    hostID: string,
  ) {
    const baseUrl = libeufinSandboxService.baseUrl;
    let url = new URL(`admin/ebics/hosts/${hostID}/rotate-keys`, baseUrl);
    await axios.post(url.href, {}, {
      auth: {
        username: "admin",
        password: "secret",
      },
    });
  }
  export async function createEbicsHost(
    libeufinSandboxService: LibeufinSandboxServiceInterface,
    hostID: string,
  ) {
    const baseUrl = libeufinSandboxService.baseUrl;
    let url = new URL("admin/ebics/hosts", baseUrl);
    await axios.post(url.href, {
      hostID,
      ebicsVersion: "2.5",
    },
    {
      auth: {
        username: "admin",
        password: "secret",
      },
    });
  }

  export async function createBankAccount(
    libeufinSandboxService: LibeufinSandboxServiceInterface,
    req: BankAccountInfo,
  ) {
    const baseUrl = libeufinSandboxService.baseUrl;
    let url = new URL(`admin/bank-accounts/${req.label}`, baseUrl);
    await axios.post(url.href, req, {
      auth: {
        username: "admin",
        password: "secret",
      },
    });
  }

  /**
   * This function is useless.  It creates a Ebics subscriber
   * but never gives it a bank account.  To be removed
   */
  export async function createEbicsSubscriber(
    libeufinSandboxService: LibeufinSandboxServiceInterface,
    req: CreateEbicsSubscriberRequest,
  ) {
    const baseUrl = libeufinSandboxService.baseUrl;
    let url = new URL("admin/ebics/subscribers", baseUrl);
    await axios.post(url.href, req, {
      auth: {
        username: "admin",
        password: "secret",
      },
    });
  }

  export async function createEbicsBankAccount(
    libeufinSandboxService: LibeufinSandboxServiceInterface,
    req: CreateEbicsBankAccountRequest,
  ) {
    const baseUrl = libeufinSandboxService.baseUrl;
    let url = new URL("admin/ebics/bank-accounts", baseUrl);
    await axios.post(url.href, req, {
      auth: {
        username: "admin",
        password: "secret",
      },
    });
  }

  export async function simulateIncomingTransaction(
    libeufinSandboxService: LibeufinSandboxServiceInterface,
    accountLabel: string,
    req: SimulateIncomingTransactionRequest,
  ) {
    const baseUrl = libeufinSandboxService.baseUrl;
    let url = new URL(
      `admin/bank-accounts/${accountLabel}/simulate-incoming-transaction`,
      baseUrl,
    );
    await axios.post(url.href, req, {
      auth: {
        username: "admin",
        password: "secret",
      },
    });
  }

  export async function getAccountTransactions(
    libeufinSandboxService: LibeufinSandboxServiceInterface,
    accountLabel: string,
  ): Promise<SandboxAccountTransactions> {
    const baseUrl = libeufinSandboxService.baseUrl;
    let url = new URL(
      `admin/bank-accounts/${accountLabel}/transactions`,
      baseUrl,
    );
    const res = await axios.get(url.href, {
      auth: {
        username: "admin",
        password: "secret",
      },
    });
    return res.data as SandboxAccountTransactions;
  }

  export async function getCamt053(
    libeufinSandboxService: LibeufinSandboxServiceInterface,
    accountLabel: string,
  ): Promise<any> {
    const baseUrl = libeufinSandboxService.baseUrl;
    let url = new URL("admin/payments/camt", baseUrl);
    return await axios.post(url.href, {
      bankaccount: accountLabel,
      type: 53, 
    },
    {
      auth: {
        username: "admin",
        password: "secret",
      },
    });
  }

  export async function getAccountInfoWithBalance(
    libeufinSandboxService: LibeufinSandboxServiceInterface,
    accountLabel: string,
  ): Promise<any> {
    const baseUrl = libeufinSandboxService.baseUrl;
    let url = new URL(
      `admin/bank-accounts/${accountLabel}`,
      baseUrl,
    );
    return await axios.get(url.href, {
      auth: {
        username: "admin",
        password: "secret",
      },
    });
  }
}

export namespace LibeufinNexusApi {
  export async function getAllConnections(
    nexus: LibeufinNexusServiceInterface,
  ): Promise<any> {
    let url = new URL("bank-connections", nexus.baseUrl);
    const res = await axios.get(url.href, {
      auth: {
        username: "admin",
        password: "test",
      },
    });
    return res;
  }

  export async function deleteBankConnection(
    libeufinNexusService: LibeufinNexusServiceInterface,
    req: DeleteBankConnectionRequest,
  ): Promise<any> {
    const baseUrl = libeufinNexusService.baseUrl;
    let url = new URL("bank-connections/delete-connection", baseUrl);
    return await axios.post(url.href, req, {
      auth: {
        username: "admin",
        password: "test",
      },
    });
  }

  export async function createEbicsBankConnection(
    libeufinNexusService: LibeufinNexusServiceInterface,
    req: CreateEbicsBankConnectionRequest,
  ): Promise<void> {
    const baseUrl = libeufinNexusService.baseUrl;
    let url = new URL("bank-connections", baseUrl);
    await axios.post(
      url.href,
      {
        source: "new",
        type: "ebics",
        name: req.name,
        data: {
          ebicsURL: req.ebicsURL,
          hostID: req.hostID,
          userID: req.userID,
          partnerID: req.partnerID,
          systemID: req.systemID,
        },
      },
      {
        auth: {
          username: "admin",
          password: "test",
        },
      },
    );
  }

  export async function getBankAccount(
    libeufinNexusService: LibeufinNexusServiceInterface,
    accountName: string,
  ): Promise<any> {
    const baseUrl = libeufinNexusService.baseUrl;
    let url = new URL(
      `bank-accounts/${accountName}`,
      baseUrl,
    );
    return await axios.get(
      url.href,
      {
        auth: {
          username: "admin",
          password: "test",
        },
      },
    );
  }


  export async function submitInitiatedPayment(
    libeufinNexusService: LibeufinNexusServiceInterface,
    accountName: string,
    paymentId: string,
  ): Promise<void> {
    const baseUrl = libeufinNexusService.baseUrl;
    let url = new URL(
      `bank-accounts/${accountName}/payment-initiations/${paymentId}/submit`,
      baseUrl,
    );
    await axios.post(
      url.href,
      {},
      {
        auth: {
          username: "admin",
          password: "test",
        },
      },
    );
  }

  export async function fetchAccounts(
    libeufinNexusService: LibeufinNexusServiceInterface,
    connectionName: string,
  ): Promise<void> {
    const baseUrl = libeufinNexusService.baseUrl;
    let url = new URL(
      `bank-connections/${connectionName}/fetch-accounts`,
      baseUrl,
    );
    await axios.post(
      url.href,
      {},
      {
        auth: {
          username: "admin",
          password: "test",
        },
      },
    );
  }

  export async function importConnectionAccount(
    libeufinNexusService: LibeufinNexusServiceInterface,
    connectionName: string,
    offeredAccountId: string,
    nexusBankAccountId: string,
  ): Promise<void> {
    const baseUrl = libeufinNexusService.baseUrl;
    let url = new URL(
      `bank-connections/${connectionName}/import-account`,
      baseUrl,
    );
    await axios.post(
      url.href,
      {
        offeredAccountId,
        nexusBankAccountId,
      },
      {
        auth: {
          username: "admin",
          password: "test",
        },
      },
    );
  }

  export async function connectBankConnection(
    libeufinNexusService: LibeufinNexusServiceInterface,
    connectionName: string,
  ) {
    const baseUrl = libeufinNexusService.baseUrl;
    let url = new URL(`bank-connections/${connectionName}/connect`, baseUrl);
    await axios.post(
      url.href,
      {},
      {
        auth: {
          username: "admin",
          password: "test",
        },
      },
    );
  }

  export async function getPaymentInitiations(
    libeufinNexusService: LibeufinNexusServiceInterface,
    accountName: string,
    username: string = "admin",
    password: string = "test",
  ): Promise<void> {
    const baseUrl = libeufinNexusService.baseUrl;
    let url = new URL(
      `/bank-accounts/${accountName}/payment-initiations`,
      baseUrl,
    );
    let response = await axios.get(url.href, {
      auth: {
        username: username,
        password: password,
      },
    });
    console.log(
      `Payment initiations of: ${accountName}`,
      JSON.stringify(response.data, null, 2),
    );
  }

  export async function getConfig(
    libeufinNexusService: LibeufinNexusServiceInterface,
  ): Promise<void> {
    const baseUrl = libeufinNexusService.baseUrl;
    let url = new URL(`/config`, baseUrl);
    let response = await axios.get(url.href);
  }

  // Uses the Anastasis API to get a list of transactions.
  export async function getAnastasisTransactions(
    libeufinNexusService: LibeufinNexusServiceInterface,
    anastasisBaseUrl: string,
    params: {}, // of the request: {delta: 5, ..}
    username: string = "admin",
    password: string = "test",
  ): Promise<any> {
    let url = new URL("history/incoming", anastasisBaseUrl);
    let response = await axios.get(url.href, { params: params,
      auth: {
        username: username,
        password: password,
      },
    });
    return response;
  }

  // FIXME: this function should return some structured
  // object that represents a history.
  export async function getAccountTransactions(
    libeufinNexusService: LibeufinNexusServiceInterface,
    accountName: string,
    username: string = "admin",
    password: string = "test",
  ): Promise<any> {
    const baseUrl = libeufinNexusService.baseUrl;
    let url = new URL(`/bank-accounts/${accountName}/transactions`, baseUrl);
    let response = await axios.get(url.href, {
      auth: {
        username: username,
        password: password,
      },
    });
    return response;
  }

  export async function fetchTransactions(
    libeufinNexusService: LibeufinNexusServiceInterface,
    accountName: string,
    rangeType: string = "all",
    level: string = "report",
    username: string = "admin",
    password: string = "test",
  ): Promise<any> {
    const baseUrl = libeufinNexusService.baseUrl;
    let url = new URL(
      `/bank-accounts/${accountName}/fetch-transactions`,
      baseUrl,
    );
    return await axios.post(
      url.href,
      {
        rangeType: rangeType,
        level: level,
      },
      {
        auth: {
          username: username,
          password: password,
        },
      },
    );
  }

  export async function changePassword(
    libeufinNexusService: LibeufinNexusServiceInterface,
    username: string,
    req: UpdateNexusUserRequest,
    auth: NexusAuth,
  ) {
    const baseUrl = libeufinNexusService.baseUrl;
    let url = new URL(`/users/${username}/password`, baseUrl);
    await axios.post(url.href, req, auth);
  }

  export async function getUser(
    libeufinNexusService: LibeufinNexusServiceInterface,
    auth: NexusAuth,
  ): Promise<any> {
    const baseUrl = libeufinNexusService.baseUrl;
    let url = new URL(`/user`, baseUrl);
    return await axios.get(url.href, auth);
  }

  export async function createUser(
    libeufinNexusService: LibeufinNexusServiceInterface,
    req: CreateNexusUserRequest,
  ) {
    const baseUrl = libeufinNexusService.baseUrl;
    let url = new URL(`/users`, baseUrl);
    await axios.post(url.href, req, {
      auth: {
        username: "admin",
        password: "test",
      },
    });
  }

  export async function getAllPermissions(
    libeufinNexusService: LibeufinNexusServiceInterface,
  ): Promise<any> {
    const baseUrl = libeufinNexusService.baseUrl;
    let url = new URL(`/permissions`, baseUrl);
    return await axios.get(url.href, {
      auth: {
        username: "admin",
        password: "test",
      },
    });
  }

  export async function postPermission(
    libeufinNexusService: LibeufinNexusServiceInterface,
    req: PostNexusPermissionRequest,
  ) {
    const baseUrl = libeufinNexusService.baseUrl;
    let url = new URL(`/permissions`, baseUrl);
    await axios.post(url.href, req, {
      auth: {
        username: "admin",
        password: "test",
      },
    });
  }

  export async function getTasks(
    libeufinNexusService: LibeufinNexusServiceInterface,
    bankAccountName: string,
    // When void, the request returns the list of all the
    // tasks under this bank account.
    taskName: string | void,
  ): Promise<any> {
    const baseUrl = libeufinNexusService.baseUrl;
    let url = new URL(`/bank-accounts/${bankAccountName}/schedule`, baseUrl);
    if (taskName) url = new URL(taskName, `${url}/`);

    // It's caller's responsibility to interpret the response.
    return await axios.get(url.href, {
      auth: {
        username: "admin",
        password: "test",
      },
    });
  }

  export async function deleteTask(
    libeufinNexusService: LibeufinNexusServiceInterface,
    bankAccountName: string,
    taskName: string,
  ) {
    const baseUrl = libeufinNexusService.baseUrl;
    let url = new URL(
      `/bank-accounts/${bankAccountName}/schedule/${taskName}`,
      baseUrl,
    );
    await axios.delete(url.href, {
      auth: {
        username: "admin",
        password: "test",
      },
    });
  }

  export async function postTask(
    libeufinNexusService: LibeufinNexusServiceInterface,
    bankAccountName: string,
    req: PostNexusTaskRequest,
  ): Promise<any> {
    const baseUrl = libeufinNexusService.baseUrl;
    let url = new URL(`/bank-accounts/${bankAccountName}/schedule`, baseUrl);
    return await axios.post(url.href, req, {
      auth: {
        username: "admin",
        password: "test",
      },
    });
  }

  export async function deleteFacade(
    libeufinNexusService: LibeufinNexusServiceInterface,
    facadeName: string,
  ): Promise<any> {
    const baseUrl = libeufinNexusService.baseUrl;
    let url = new URL(`facades/${facadeName}`, baseUrl);
    return await axios.delete(url.href, {
      auth: {
        username: "admin",
        password: "test",
      },
    });
  }

  export async function getAllFacades(
    libeufinNexusService: LibeufinNexusServiceInterface,
  ): Promise<any> {
    const baseUrl = libeufinNexusService.baseUrl;
    let url = new URL("facades", baseUrl);
    return await axios.get(url.href, {
      auth: {
        username: "admin",
        password: "test",
      },
    });
  }

  export async function createAnastasisFacade(
    libeufinNexusService: LibeufinNexusServiceInterface,
    req: CreateAnastasisFacadeRequest,
  ) {
    const baseUrl = libeufinNexusService.baseUrl;
    let url = new URL("facades", baseUrl);
    await axios.post(
      url.href,
      {
        name: req.name,
        type: "anastasis",
        config: {
          bankAccount: req.accountName,
          bankConnection: req.connectionName,
          currency: req.currency,
          reserveTransferLevel: req.reserveTransferLevel,
        },
      },
      {
        auth: {
          username: "admin",
          password: "test",
        },
      },
    );
  }

  export async function createTwgFacade(
    libeufinNexusService: LibeufinNexusServiceInterface,
    req: CreateTalerWireGatewayFacadeRequest,
  ) {
    const baseUrl = libeufinNexusService.baseUrl;
    let url = new URL("facades", baseUrl);
    await axios.post(
      url.href,
      {
        name: req.name,
        type: "taler-wire-gateway",
        config: {
          bankAccount: req.accountName,
          bankConnection: req.connectionName,
          currency: req.currency,
          reserveTransferLevel: req.reserveTransferLevel,
        },
      },
      {
        auth: {
          username: "admin",
          password: "test",
        },
      },
    );
  }

  export async function submitAllPaymentInitiations(
    libeufinNexusService: LibeufinNexusServiceInterface,
    accountId: string,
  ) {
    const baseUrl = libeufinNexusService.baseUrl;
    let url = new URL(
      `/bank-accounts/${accountId}/submit-all-payment-initiations`,
      baseUrl,
    );
    await axios.post(
      url.href,
      {},
      {
        auth: {
          username: "admin",
          password: "test",
        },
      },
    );
  }
}

