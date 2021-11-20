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
  ConfirmPayResultType,
  PreparePayResultType,
  URL,
  encodeCrock,
  getRandomBytes,
} from "@gnu-taler/taler-util";
import { NodeHttpLib, WalletApiOperation } from "@gnu-taler/taler-wallet-core";
import {
  BankService,
  ExchangeService,
  GlobalTestState,
  MerchantPrivateApi,
  MerchantService,
  WalletCli,
} from "../harness/harness.js";
import {
  createSimpleTestkudosEnvironment,
  withdrawViaBank,
} from "../harness/helpers.js";

const httpLib = new NodeHttpLib();

interface Context {
  merchant: MerchantService;
  merchantBaseUrl: string;
  bank: BankService;
  exchange: ExchangeService;
}

async function testWithClaimToken(
  t: GlobalTestState,
  c: Context,
): Promise<void> {
  const wallet = new WalletCli(t, "withclaimtoken");
  const { bank, exchange } = c;
  const { merchant, merchantBaseUrl } = c;
  await withdrawViaBank(t, { wallet, bank, exchange, amount: "TESTKUDOS:20" });
  const sessionId = "mysession";
  const orderResp = await MerchantPrivateApi.createOrder(merchant, "default", {
    order: {
      summary: "Buy me!",
      amount: "TESTKUDOS:5",
      fulfillment_url: "https://example.com/article42",
      public_reorder_url: "https://example.com/article42-share",
    },
  });

  const claimToken = orderResp.token;
  const orderId = orderResp.order_id;
  t.assertTrue(!!claimToken);
  let talerPayUri: string;

  {
    const httpResp = await httpLib.get(
      new URL(`orders/${orderId}`, merchantBaseUrl).href,
    );
    const r = await httpResp.json();
    t.assertDeepEqual(httpResp.status, 202);
    console.log(r);
  }

  {
    const url = new URL(`orders/${orderId}`, merchantBaseUrl);
    url.searchParams.set("token", claimToken);
    const httpResp = await httpLib.get(url.href);
    const r = await httpResp.json();
    t.assertDeepEqual(httpResp.status, 402);
    console.log(r);
    talerPayUri = r.taler_pay_uri;
    t.assertTrue(!!talerPayUri);
  }

  {
    const url = new URL(`orders/${orderId}`, merchantBaseUrl);
    url.searchParams.set("token", claimToken);
    const httpResp = await httpLib.get(url.href, {
      headers: {
        Accept: "text/html",
      },
    });
    const r = await httpResp.text();
    t.assertDeepEqual(httpResp.status, 402);
    console.log(r);
  }

  const preparePayResp = await wallet.client.call(
    WalletApiOperation.PreparePayForUri,
    {
      talerPayUri,
    },
  );

  t.assertTrue(preparePayResp.status === PreparePayResultType.PaymentPossible);
  const contractTermsHash = preparePayResp.contractTermsHash;
  const proposalId = preparePayResp.proposalId;

  // claimed, unpaid, access with wrong h_contract
  {
    const url = new URL(`orders/${orderId}`, merchantBaseUrl);
    const hcWrong = encodeCrock(getRandomBytes(64));
    url.searchParams.set("h_contract", hcWrong);
    const httpResp = await httpLib.get(url.href);
    const r = await httpResp.json();
    console.log(r);
    t.assertDeepEqual(httpResp.status, 403);
  }

  // claimed, unpaid, access with wrong claim token
  {
    const url = new URL(`orders/${orderId}`, merchantBaseUrl);
    const ctWrong = encodeCrock(getRandomBytes(16));
    url.searchParams.set("token", ctWrong);
    const httpResp = await httpLib.get(url.href);
    const r = await httpResp.json();
    console.log(r);
    t.assertDeepEqual(httpResp.status, 403);
  }

  // claimed, unpaid, access with correct claim token
  {
    const url = new URL(`orders/${orderId}`, merchantBaseUrl);
    url.searchParams.set("token", claimToken);
    const httpResp = await httpLib.get(url.href);
    const r = await httpResp.json();
    console.log(r);
    t.assertDeepEqual(httpResp.status, 402);
  }

  // claimed, unpaid, access with correct contract terms hash
  {
    const url = new URL(`orders/${orderId}`, merchantBaseUrl);
    url.searchParams.set("h_contract", contractTermsHash);
    const httpResp = await httpLib.get(url.href);
    const r = await httpResp.json();
    console.log(r);
    t.assertDeepEqual(httpResp.status, 402);
  }

  // claimed, unpaid, access without credentials
  {
    const url = new URL(`orders/${orderId}`, merchantBaseUrl);
    const httpResp = await httpLib.get(url.href);
    const r = await httpResp.json();
    console.log(r);
    t.assertDeepEqual(httpResp.status, 202);
  }

  const confirmPayRes = await wallet.client.call(
    WalletApiOperation.ConfirmPay,
    {
      proposalId: proposalId,
    },
  );

  t.assertTrue(confirmPayRes.type === ConfirmPayResultType.Done);

  // paid, access without credentials
  {
    const url = new URL(`orders/${orderId}`, merchantBaseUrl);
    const httpResp = await httpLib.get(url.href);
    const r = await httpResp.json();
    console.log(r);
    t.assertDeepEqual(httpResp.status, 202);
  }

  // paid, access with wrong h_contract
  {
    const url = new URL(`orders/${orderId}`, merchantBaseUrl);
    const hcWrong = encodeCrock(getRandomBytes(64));
    url.searchParams.set("h_contract", hcWrong);
    const httpResp = await httpLib.get(url.href);
    const r = await httpResp.json();
    console.log(r);
    t.assertDeepEqual(httpResp.status, 403);
  }

  // paid, access with wrong claim token
  {
    const url = new URL(`orders/${orderId}`, merchantBaseUrl);
    const ctWrong = encodeCrock(getRandomBytes(16));
    url.searchParams.set("token", ctWrong);
    const httpResp = await httpLib.get(url.href);
    const r = await httpResp.json();
    console.log(r);
    t.assertDeepEqual(httpResp.status, 403);
  }

  // paid, access with correct h_contract
  {
    const url = new URL(`orders/${orderId}`, merchantBaseUrl);
    url.searchParams.set("h_contract", contractTermsHash);
    const httpResp = await httpLib.get(url.href);
    const r = await httpResp.json();
    console.log(r);
    t.assertDeepEqual(httpResp.status, 200);
  }

  // paid, access with correct claim token, JSON
  {
    const url = new URL(`orders/${orderId}`, merchantBaseUrl);
    url.searchParams.set("token", claimToken);
    const httpResp = await httpLib.get(url.href);
    const r = await httpResp.json();
    console.log(r);
    t.assertDeepEqual(httpResp.status, 200);
    const respFulfillmentUrl = r.fulfillment_url;
    t.assertDeepEqual(respFulfillmentUrl, "https://example.com/article42");
  }

  // paid, access with correct claim token, HTML
  {
    const url = new URL(`orders/${orderId}`, merchantBaseUrl);
    url.searchParams.set("token", claimToken);
    const httpResp = await httpLib.get(url.href, {
      headers: { Accept: "text/html" },
    });
    t.assertDeepEqual(httpResp.status, 200);
  }

  const confirmPayRes2 = await wallet.client.call(
    WalletApiOperation.ConfirmPay,
    {
      proposalId: proposalId,
      sessionId: sessionId,
    },
  );

  t.assertTrue(confirmPayRes2.type === ConfirmPayResultType.Done);

  // Create another order with identical fulfillment URL to test the "already paid" flow
  const alreadyPaidOrderResp = await MerchantPrivateApi.createOrder(
    merchant,
    "default",
    {
      order: {
        summary: "Buy me!",
        amount: "TESTKUDOS:5",
        fulfillment_url: "https://example.com/article42",
        public_reorder_url: "https://example.com/article42-share",
      },
    },
  );

  const apOrderId = alreadyPaidOrderResp.order_id;
  const apToken = alreadyPaidOrderResp.token;
  t.assertTrue(!!apToken);

  {
    const url = new URL(`orders/${apOrderId}`, merchantBaseUrl);
    url.searchParams.set("token", apToken);
    const httpResp = await httpLib.get(url.href);
    const r = await httpResp.json();
    console.log(r);
    t.assertDeepEqual(httpResp.status, 402);
  }

  // Check for already paid session ID, JSON
  {
    const url = new URL(`orders/${apOrderId}`, merchantBaseUrl);
    url.searchParams.set("token", apToken);
    url.searchParams.set("session_id", sessionId);
    const httpResp = await httpLib.get(url.href);
    const r = await httpResp.json();
    console.log(r);
    t.assertDeepEqual(httpResp.status, 402);
    const alreadyPaidOrderId = r.already_paid_order_id;
    t.assertDeepEqual(alreadyPaidOrderId, orderId);
  }

  // Check for already paid session ID, HTML
  {
    const url = new URL(`orders/${apOrderId}`, merchantBaseUrl);
    url.searchParams.set("token", apToken);
    url.searchParams.set("session_id", sessionId);
    const httpResp = await httpLib.get(url.href, {
      headers: { Accept: "text/html" },
    });
    t.assertDeepEqual(httpResp.status, 302);
    const location = httpResp.headers.get("Location");
    console.log("location header:", location);
    t.assertDeepEqual(location, "https://example.com/article42");
  }
}

async function testWithoutClaimToken(
  t: GlobalTestState,
  c: Context,
): Promise<void> {
  const wallet = new WalletCli(t, "withoutct");
  const sessionId = "mysession2";
  const { bank, exchange } = c;
  const { merchant, merchantBaseUrl } = c;
  await withdrawViaBank(t, { wallet, bank, exchange, amount: "TESTKUDOS:20" });
  const orderResp = await MerchantPrivateApi.createOrder(merchant, "default", {
    order: {
      summary: "Buy me!",
      amount: "TESTKUDOS:5",
      fulfillment_url: "https://example.com/article42",
      public_reorder_url: "https://example.com/article42-share",
    },
    create_token: false,
  });

  const orderId = orderResp.order_id;
  let talerPayUri: string;

  {
    const httpResp = await httpLib.get(
      new URL(`orders/${orderId}`, merchantBaseUrl).href,
    );
    const r = await httpResp.json();
    t.assertDeepEqual(httpResp.status, 402);
    console.log(r);
  }

  {
    const url = new URL(`orders/${orderId}`, merchantBaseUrl);
    const httpResp = await httpLib.get(url.href);
    const r = await httpResp.json();
    t.assertDeepEqual(httpResp.status, 402);
    console.log(r);
    talerPayUri = r.taler_pay_uri;
    t.assertTrue(!!talerPayUri);
  }

  {
    const url = new URL(`orders/${orderId}`, merchantBaseUrl);
    const httpResp = await httpLib.get(url.href, {
      headers: {
        Accept: "text/html",
      },
    });
    const r = await httpResp.text();
    t.assertDeepEqual(httpResp.status, 402);
    console.log(r);
  }

  const preparePayResp = await wallet.client.call(
    WalletApiOperation.PreparePayForUri,
    {
      talerPayUri,
    },
  );

  console.log(preparePayResp);

  t.assertTrue(preparePayResp.status === PreparePayResultType.PaymentPossible);
  const contractTermsHash = preparePayResp.contractTermsHash;
  const proposalId = preparePayResp.proposalId;

  // claimed, unpaid, access with wrong h_contract
  {
    const url = new URL(`orders/${orderId}`, merchantBaseUrl);
    const hcWrong = encodeCrock(getRandomBytes(64));
    url.searchParams.set("h_contract", hcWrong);
    const httpResp = await httpLib.get(url.href);
    const r = await httpResp.json();
    console.log(r);
    t.assertDeepEqual(httpResp.status, 403);
  }

  // claimed, unpaid, access with wrong claim token
  {
    const url = new URL(`orders/${orderId}`, merchantBaseUrl);
    const ctWrong = encodeCrock(getRandomBytes(16));
    url.searchParams.set("token", ctWrong);
    const httpResp = await httpLib.get(url.href);
    const r = await httpResp.json();
    console.log(r);
    t.assertDeepEqual(httpResp.status, 403);
  }

  // claimed, unpaid, no claim token
  {
    const url = new URL(`orders/${orderId}`, merchantBaseUrl);
    const httpResp = await httpLib.get(url.href);
    const r = await httpResp.json();
    console.log(r);
    t.assertDeepEqual(httpResp.status, 402);
  }

  // claimed, unpaid, access with correct contract terms hash
  {
    const url = new URL(`orders/${orderId}`, merchantBaseUrl);
    url.searchParams.set("h_contract", contractTermsHash);
    const httpResp = await httpLib.get(url.href);
    const r = await httpResp.json();
    console.log(r);
    t.assertDeepEqual(httpResp.status, 402);
  }

  // claimed, unpaid, access without credentials
  {
    const url = new URL(`orders/${orderId}`, merchantBaseUrl);
    const httpResp = await httpLib.get(url.href);
    const r = await httpResp.json();
    console.log(r);
    // No credentials, but the order doesn't require a claim token.
    // This effectively means that the order ID is already considered
    // enough authentication, at least to check for the basic order status
    t.assertDeepEqual(httpResp.status, 402);
  }

  const confirmPayRes = await wallet.client.call(
    WalletApiOperation.ConfirmPay,
    {
      proposalId: proposalId,
    },
  );

  t.assertTrue(confirmPayRes.type === ConfirmPayResultType.Done);

  // paid, access without credentials
  {
    const url = new URL(`orders/${orderId}`, merchantBaseUrl);
    const httpResp = await httpLib.get(url.href);
    const r = await httpResp.json();
    console.log(r);
    t.assertDeepEqual(httpResp.status, 200);
  }

  // paid, access with wrong h_contract
  {
    const url = new URL(`orders/${orderId}`, merchantBaseUrl);
    const hcWrong = encodeCrock(getRandomBytes(64));
    url.searchParams.set("h_contract", hcWrong);
    const httpResp = await httpLib.get(url.href);
    const r = await httpResp.json();
    console.log(r);
    t.assertDeepEqual(httpResp.status, 403);
  }

  // paid, access with wrong claim token
  {
    const url = new URL(`orders/${orderId}`, merchantBaseUrl);
    const ctWrong = encodeCrock(getRandomBytes(16));
    url.searchParams.set("token", ctWrong);
    const httpResp = await httpLib.get(url.href);
    const r = await httpResp.json();
    console.log(r);
    t.assertDeepEqual(httpResp.status, 403);
  }

  // paid, access with correct h_contract
  {
    const url = new URL(`orders/${orderId}`, merchantBaseUrl);
    url.searchParams.set("h_contract", contractTermsHash);
    const httpResp = await httpLib.get(url.href);
    const r = await httpResp.json();
    console.log(r);
    t.assertDeepEqual(httpResp.status, 200);
  }

  // paid, JSON
  {
    const url = new URL(`orders/${orderId}`, merchantBaseUrl);
    const httpResp = await httpLib.get(url.href);
    const r = await httpResp.json();
    console.log(r);
    t.assertDeepEqual(httpResp.status, 200);
    const respFulfillmentUrl = r.fulfillment_url;
    t.assertDeepEqual(respFulfillmentUrl, "https://example.com/article42");
  }

  // paid, HTML
  {
    const url = new URL(`orders/${orderId}`, merchantBaseUrl);
    const httpResp = await httpLib.get(url.href, {
      headers: { Accept: "text/html" },
    });
    t.assertDeepEqual(httpResp.status, 200);
  }

  const confirmPayRes2 = await wallet.client.call(
    WalletApiOperation.ConfirmPay,
    {
      proposalId: proposalId,
      sessionId: sessionId,
    },
  );

  t.assertTrue(confirmPayRes2.type === ConfirmPayResultType.Done);

  // Create another order with identical fulfillment URL to test the "already paid" flow
  const alreadyPaidOrderResp = await MerchantPrivateApi.createOrder(
    merchant,
    "default",
    {
      order: {
        summary: "Buy me!",
        amount: "TESTKUDOS:5",
        fulfillment_url: "https://example.com/article42",
        public_reorder_url: "https://example.com/article42-share",
      },
    },
  );

  const apOrderId = alreadyPaidOrderResp.order_id;
  const apToken = alreadyPaidOrderResp.token;
  t.assertTrue(!!apToken);

  {
    const url = new URL(`orders/${apOrderId}`, merchantBaseUrl);
    url.searchParams.set("token", apToken);
    const httpResp = await httpLib.get(url.href);
    const r = await httpResp.json();
    console.log(r);
    t.assertDeepEqual(httpResp.status, 402);
  }

  // Check for already paid session ID, JSON
  {
    const url = new URL(`orders/${apOrderId}`, merchantBaseUrl);
    url.searchParams.set("token", apToken);
    url.searchParams.set("session_id", sessionId);
    const httpResp = await httpLib.get(url.href);
    const r = await httpResp.json();
    console.log(r);
    t.assertDeepEqual(httpResp.status, 402);
    const alreadyPaidOrderId = r.already_paid_order_id;
    t.assertDeepEqual(alreadyPaidOrderId, orderId);
  }

  // Check for already paid session ID, HTML
  {
    const url = new URL(`orders/${apOrderId}`, merchantBaseUrl);
    url.searchParams.set("token", apToken);
    url.searchParams.set("session_id", sessionId);
    const httpResp = await httpLib.get(url.href, {
      headers: { Accept: "text/html" },
    });
    t.assertDeepEqual(httpResp.status, 302);
    const location = httpResp.headers.get("Location");
    console.log("location header:", location);
    t.assertDeepEqual(location, "https://example.com/article42");
  }
}

/**
 * Checks for the /orders/{id} endpoint of the merchant.
 *
 * The tests here should exercise all code paths in the executable
 * specification of the endpoint.
 */
export async function runMerchantSpecPublicOrdersTest(t: GlobalTestState) {
  const { bank, exchange, merchant } = await createSimpleTestkudosEnvironment(
    t,
  );

  // Base URL for the default instance.
  const merchantBaseUrl = merchant.makeInstanceBaseUrl();

  {
    const httpResp = await httpLib.get(new URL("config", merchantBaseUrl).href);
    const r = await httpResp.json();
    console.log(r);
    t.assertDeepEqual(r.currency, "TESTKUDOS");
  }

  {
    const httpResp = await httpLib.get(
      new URL("orders/foo", merchantBaseUrl).href,
    );
    const r = await httpResp.json();
    console.log(r);
    t.assertDeepEqual(httpResp.status, 404);
    // FIXME: also check Taler error code
  }

  {
    const httpResp = await httpLib.get(
      new URL("orders/foo", merchantBaseUrl).href,
      {
        headers: {
          Accept: "text/html",
        },
      },
    );
    const r = await httpResp.text();
    console.log(r);
    t.assertDeepEqual(httpResp.status, 404);
    // FIXME: also check Taler error code
  }

  await testWithClaimToken(t, {
    merchant,
    merchantBaseUrl,
    exchange,
    bank,
  });

  await testWithoutClaimToken(t, {
    merchant,
    merchantBaseUrl,
    exchange,
    bank,
  });
}

runMerchantSpecPublicOrdersTest.suites = ["merchant"];
