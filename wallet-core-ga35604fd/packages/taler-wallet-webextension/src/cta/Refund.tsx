/*
 This file is part of TALER
 (C) 2015-2016 GNUnet e.V.

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
 * Page that shows refund status for purchases.
 *
 * @author Florian Dold
 */

import { Amounts, ApplyRefundResponse } from "@gnu-taler/taler-util";
import { h, VNode } from "preact";
import { useEffect, useState } from "preact/hooks";
import { AmountView } from "../renderHtml";
import * as wxApi from "../wxApi";

interface Props {
  talerRefundUri?: string;
}
export interface ViewProps {
  applyResult: ApplyRefundResponse;
}
export function View({ applyResult }: ViewProps): VNode {
  return (
    <section class="main">
      <h1>GNU Taler Wallet</h1>
      <article class="fade">
        <h2>Refund Status</h2>
        <p>
          The product <em>{applyResult.info.summary}</em> has received a total
          effective refund of{" "}
          <AmountView amount={applyResult.amountRefundGranted} />.
        </p>
        {applyResult.pendingAtExchange ? (
          <p>Refund processing is still in progress.</p>
        ) : null}
        {!Amounts.isZero(applyResult.amountRefundGone) ? (
          <p>
            The refund amount of{" "}
            <AmountView amount={applyResult.amountRefundGone} /> could not be
            applied.
          </p>
        ) : null}
      </article>
    </section>
  );
}
export function RefundPage({ talerRefundUri }: Props): VNode {
  const [applyResult, setApplyResult] = useState<
    ApplyRefundResponse | undefined
  >(undefined);
  const [errMsg, setErrMsg] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!talerRefundUri) return;
    const doFetch = async (): Promise<void> => {
      try {
        const result = await wxApi.applyRefund(talerRefundUri);
        setApplyResult(result);
      } catch (e) {
        if (e instanceof Error) {
          setErrMsg(e.message);
          console.log("err message", e.message);
        }
      }
    };
    doFetch();
  }, [talerRefundUri]);

  console.log("rendering");

  if (!talerRefundUri) {
    return <span>missing taler refund uri</span>;
  }

  if (errMsg) {
    return <span>Error: {errMsg}</span>;
  }

  if (!applyResult) {
    return <span>Updating refund status</span>;
  }

  return <View applyResult={applyResult} />;
}
