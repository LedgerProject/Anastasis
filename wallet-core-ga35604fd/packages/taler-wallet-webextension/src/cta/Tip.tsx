/*
 This file is part of TALER
 (C) 2017 GNUnet e.V.

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
 * Page shown to the user to accept or ignore a tip from a merchant.
 *
 * @author Florian Dold <dold@taler.net>
 */

import { PrepareTipResult } from "@gnu-taler/taler-util";
import { h, VNode } from "preact";
import { useEffect, useState } from "preact/hooks";
import { AmountView } from "../renderHtml";
import * as wxApi from "../wxApi";

interface Props {
  talerTipUri?: string;
}
export interface ViewProps {
  prepareTipResult: PrepareTipResult;
  onAccept: () => void;
  onIgnore: () => void;
}
export function View({
  prepareTipResult,
  onAccept,
  onIgnore,
}: ViewProps): VNode {
  return (
    <section class="main">
      <h1>GNU Taler Wallet</h1>
      <article class="fade">
        {prepareTipResult.accepted ? (
          <span>
            Tip from <code>{prepareTipResult.merchantBaseUrl}</code> accepted.
            Check your transactions list for more details.
          </span>
        ) : (
          <div>
            <p>
              The merchant <code>{prepareTipResult.merchantBaseUrl}</code> is
              offering you a tip of{" "}
              <strong>
                <AmountView amount={prepareTipResult.tipAmountEffective} />
              </strong>{" "}
              via the exchange <code>{prepareTipResult.exchangeBaseUrl}</code>
            </p>
            <button onClick={onAccept}>Accept tip</button>
            <button onClick={onIgnore}>Ignore</button>
          </div>
        )}
      </article>
    </section>
  );
}

export function TipPage({ talerTipUri }: Props): VNode {
  const [updateCounter, setUpdateCounter] = useState<number>(0);
  const [prepareTipResult, setPrepareTipResult] = useState<
    PrepareTipResult | undefined
  >(undefined);

  const [tipIgnored, setTipIgnored] = useState(false);

  useEffect(() => {
    if (!talerTipUri) return;
    const doFetch = async (): Promise<void> => {
      const p = await wxApi.prepareTip({ talerTipUri });
      setPrepareTipResult(p);
    };
    doFetch();
  }, [talerTipUri, updateCounter]);

  const doAccept = async () => {
    if (!prepareTipResult) {
      return;
    }
    await wxApi.acceptTip({ walletTipId: prepareTipResult?.walletTipId });
    setUpdateCounter(updateCounter + 1);
  };

  const doIgnore = () => {
    setTipIgnored(true);
  };

  if (!talerTipUri) {
    return <span>missing tip uri</span>;
  }

  if (tipIgnored) {
    return <span>You've ignored the tip.</span>;
  }

  if (!prepareTipResult) {
    return <span>Loading ...</span>;
  }

  return (
    <View
      prepareTipResult={prepareTipResult}
      onAccept={doAccept}
      onIgnore={doIgnore}
    />
  );
}
