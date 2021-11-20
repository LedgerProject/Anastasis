/*
 This file is part of TALER
 (C) 2015 GNUnet e.V.

 TALER is free software; you can redistribute it and/or modify it under the
 terms of the GNU General Public License as published by the Free Software
 Foundation; either version 3, or (at your option) any later version.

 TALER is distributed in the hope that it will be useful, but WITHOUT ANY
 WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR
 A PARTICULAR PURPOSE.  See the GNU General Public License for more details.

 You should have received a copy of the GNU General Public License along with
 TALER; see the file COPYING.  If not, see <http://www.gnu.org/licenses/>
 */

/**
 * Page shown to the user to confirm entering
 * a contract.
 */

/**
 * Imports.
 */
// import * as i18n from "../i18n";

import {
  AmountJson,
  AmountLike,
  Amounts,
  ConfirmPayResult,
  ConfirmPayResultDone,
  ConfirmPayResultType,
  ContractTerms,
  i18n,
  PreparePayResult,
  PreparePayResultType,
} from "@gnu-taler/taler-util";
import { Fragment, h, VNode } from "preact";
import { useEffect, useState } from "preact/hooks";
import { LogoHeader } from "../components/LogoHeader";
import { Part } from "../components/Part";
import { QR } from "../components/QR";
import {
  ButtonSuccess,
  ErrorBox,
  LinkSuccess,
  SuccessBox,
  WalletAction,
  WarningBox,
} from "../components/styled";
import { useAsyncAsHook } from "../hooks/useAsyncAsHook";
import * as wxApi from "../wxApi";

interface Props {
  talerPayUri?: string;
}

// export function AlreadyPaid({ payStatus }: { payStatus: PreparePayResult }) {
//   const fulfillmentUrl = payStatus.contractTerms.fulfillment_url;
//   let message;
//   if (fulfillmentUrl) {
//     message = (
//       <span>
//         You have already paid for this article. Click{" "}
//         <a href={fulfillmentUrl} target="_bank" rel="external">here</a> to view it again.
//       </span>
//     );
//   } else {
//     message = <span>
//       You have already paid for this article:{" "}
//       <em>
//         {payStatus.contractTerms.fulfillment_message ?? "no message given"}
//       </em>
//     </span>;
//   }
//   return <section class="main">
//     <h1>GNU Taler Wallet</h1>
//     <article class="fade">
//       {message}
//     </article>
//   </section>
// }

const doPayment = async (
  payStatus: PreparePayResult,
): Promise<ConfirmPayResultDone> => {
  if (payStatus.status !== "payment-possible") {
    throw Error(`invalid state: ${payStatus.status}`);
  }
  const proposalId = payStatus.proposalId;
  const res = await wxApi.confirmPay(proposalId, undefined);
  if (res.type !== ConfirmPayResultType.Done) {
    throw Error("payment pending");
  }
  const fu = res.contractTerms.fulfillment_url;
  if (fu) {
    document.location.href = fu;
  }
  return res;
};

export function PayPage({ talerPayUri }: Props): VNode {
  const [payStatus, setPayStatus] = useState<PreparePayResult | undefined>(
    undefined,
  );
  const [payResult, setPayResult] = useState<ConfirmPayResult | undefined>(
    undefined,
  );
  const [payErrMsg, setPayErrMsg] = useState<string | undefined>(undefined);

  const balance = useAsyncAsHook(wxApi.getBalance);
  const balanceWithoutError = balance?.hasError
    ? []
    : balance?.response.balances || [];

  const foundBalance = balanceWithoutError.find(
    (b) =>
      payStatus &&
      Amounts.parseOrThrow(b.available).currency ===
        Amounts.parseOrThrow(payStatus?.amountRaw).currency,
  );
  const foundAmount = foundBalance
    ? Amounts.parseOrThrow(foundBalance.available)
    : undefined;

  useEffect(() => {
    if (!talerPayUri) return;
    const doFetch = async (): Promise<void> => {
      try {
        const p = await wxApi.preparePay(talerPayUri);
        setPayStatus(p);
      } catch (e) {
        if (e instanceof Error) {
          setPayErrMsg(e.message);
        }
      }
    };
    doFetch();
  }, [talerPayUri]);

  if (!talerPayUri) {
    return <span>missing pay uri</span>;
  }

  if (!payStatus) {
    if (payErrMsg) {
      return (
        <WalletAction>
          <LogoHeader />
          <h2>{i18n.str`Digital cash payment`}</h2>
          <section>
            <p>Could not get the payment information for this order</p>
            <ErrorBox>{payErrMsg}</ErrorBox>
          </section>
        </WalletAction>
      );
    }
    return <span>Loading payment information ...</span>;
  }

  const onClick = async (): Promise<void> => {
    try {
      const res = await doPayment(payStatus);
      setPayResult(res);
    } catch (e) {
      console.error(e);
      if (e instanceof Error) {
        setPayErrMsg(e.message);
      }
    }
  };

  return (
    <PaymentRequestView
      uri={talerPayUri}
      payStatus={payStatus}
      payResult={payResult}
      onClick={onClick}
      payErrMsg={payErrMsg}
      balance={foundAmount}
    />
  );
}

export interface PaymentRequestViewProps {
  payStatus: PreparePayResult;
  payResult?: ConfirmPayResult;
  onClick: () => void;
  payErrMsg?: string;
  uri: string;
  balance: AmountJson | undefined;
}
export function PaymentRequestView({
  uri,
  payStatus,
  payResult,
  onClick,
  payErrMsg,
  balance,
}: PaymentRequestViewProps): VNode {
  let totalFees: AmountJson = Amounts.getZero(payStatus.amountRaw);
  const contractTerms: ContractTerms = payStatus.contractTerms;

  if (!contractTerms) {
    return (
      <span>
        Error: did not get contract terms from merchant or wallet backend.
      </span>
    );
  }

  if (payStatus.status === PreparePayResultType.PaymentPossible) {
    const amountRaw = Amounts.parseOrThrow(payStatus.amountRaw);
    const amountEffective: AmountJson = Amounts.parseOrThrow(
      payStatus.amountEffective,
    );
    totalFees = Amounts.sub(amountEffective, amountRaw).amount;
  }

  let merchantName: VNode;
  if (contractTerms.merchant && contractTerms.merchant.name) {
    merchantName = <strong>{contractTerms.merchant.name}</strong>;
  } else {
    merchantName = <strong>(pub: {contractTerms.merchant_pub})</strong>;
  }

  function Alternative(): VNode {
    const [showQR, setShowQR] = useState<boolean>(false);
    const privateUri =
      payStatus.status !== PreparePayResultType.AlreadyConfirmed
        ? `${uri}&n=${payStatus.noncePriv}`
        : uri;
    return (
      <section>
        <LinkSuccess upperCased onClick={() => setShowQR((qr) => !qr)}>
          {!showQR ? i18n.str`Pay with a mobile phone` : i18n.str`Hide QR`}
        </LinkSuccess>
        {showQR && (
          <div>
            <QR text={privateUri} />
            Scan the QR code or <a href={privateUri}>click here</a>
          </div>
        )}
      </section>
    );
  }

  function ButtonsSection(): VNode {
    if (payResult) {
      if (payResult.type === ConfirmPayResultType.Pending) {
        return (
          <section>
            <div>
              <p>Processing...</p>
            </div>
          </section>
        );
      }
      return <Fragment />;
    }
    if (payErrMsg) {
      return (
        <section>
          <div>
            <p>Payment failed: {payErrMsg}</p>
            <button class="pure-button button-success" onClick={onClick}>
              {i18n.str`Retry`}
            </button>
          </div>
        </section>
      );
    }
    if (payStatus.status === PreparePayResultType.PaymentPossible) {
      return (
        <Fragment>
          <section>
            <ButtonSuccess upperCased onClick={onClick}>
              {i18n.str`Pay`} {amountToString(payStatus.amountEffective)}
            </ButtonSuccess>
          </section>
          <Alternative />
        </Fragment>
      );
    }
    if (payStatus.status === PreparePayResultType.InsufficientBalance) {
      return (
        <Fragment>
          <section>
            {balance ? (
              <WarningBox>
                Your balance of {amountToString(balance)} is not enough to pay
                for this purchase
              </WarningBox>
            ) : (
              <WarningBox>
                Your balance is not enough to pay for this purchase.
              </WarningBox>
            )}
          </section>
          <section>
            <ButtonSuccess upperCased>
              {i18n.str`Withdraw digital cash`}
            </ButtonSuccess>
          </section>
          <Alternative />
        </Fragment>
      );
    }
    if (payStatus.status === PreparePayResultType.AlreadyConfirmed) {
      return (
        <Fragment>
          <section>
            {payStatus.paid && contractTerms.fulfillment_message && (
              <Part
                title="Merchant message"
                text={contractTerms.fulfillment_message}
                kind="neutral"
              />
            )}
          </section>
          {!payStatus.paid && <Alternative />}
        </Fragment>
      );
    }
    return <span />;
  }

  return (
    <WalletAction>
      <LogoHeader />

      <h2>{i18n.str`Digital cash payment`}</h2>
      {payStatus.status === PreparePayResultType.AlreadyConfirmed &&
        (payStatus.paid ? (
          <SuccessBox> Already paid </SuccessBox>
        ) : (
          <WarningBox> Already claimed </WarningBox>
        ))}
      {payResult && payResult.type === ConfirmPayResultType.Done && (
        <SuccessBox>
          <h3>Payment complete</h3>
          <p>
            {!payResult.contractTerms.fulfillment_message
              ? "You will now be sent back to the merchant you came from."
              : payResult.contractTerms.fulfillment_message}
          </p>
        </SuccessBox>
      )}
      <section>
        {payStatus.status !== PreparePayResultType.InsufficientBalance &&
          Amounts.isNonZero(totalFees) && (
            <Part
              big
              title="Total to pay"
              text={amountToString(payStatus.amountEffective)}
              kind="negative"
            />
          )}
        <Part
          big
          title="Purchase amount"
          text={amountToString(payStatus.amountRaw)}
          kind="neutral"
        />
        {Amounts.isNonZero(totalFees) && (
          <Fragment>
            <Part
              big
              title="Fee"
              text={amountToString(totalFees)}
              kind="negative"
            />
          </Fragment>
        )}
        <Part
          title="Merchant"
          text={contractTerms.merchant.name}
          kind="neutral"
        />
        <Part title="Purchase" text={contractTerms.summary} kind="neutral" />
        {contractTerms.order_id && (
          <Part
            title="Receipt"
            text={`#${contractTerms.order_id}`}
            kind="neutral"
          />
        )}
      </section>
      <ButtonsSection />
    </WalletAction>
  );
}

function amountToString(text: AmountLike): string {
  const aj = Amounts.jsonifyAmount(text);
  const amount = Amounts.stringifyValue(aj, 2);
  return `${amount} ${aj.currency}`;
}
