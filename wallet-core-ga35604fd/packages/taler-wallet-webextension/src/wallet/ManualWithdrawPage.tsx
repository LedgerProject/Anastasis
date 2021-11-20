/*
 This file is part of TALER
 (C) 2016 GNUnet e.V.

 TALER is free software; you can redistribute it and/or modify it under the
 terms of the GNU General Public License as published by the Free Software
 Foundation; either version 3, or (at your option) any later version.

 TALER is distributed in the hope that it will be useful, but WITHOUT ANY
 WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR
 A PARTICULAR PURPOSE.  See the GNU General Public License for more details.

 You should have received a copy of the GNU General Public License along with
 TALER; see the file COPYING.  If not, see <http://www.gnu.org/licenses/>
*/

import { VNode, h } from "preact";
import { useState } from "preact/hooks";
import { CreateManualWithdraw } from "./CreateManualWithdraw";
import * as wxApi from "../wxApi";
import {
  AcceptManualWithdrawalResult,
  AmountJson,
  Amounts,
} from "@gnu-taler/taler-util";
import { ReserveCreated } from "./ReserveCreated";
import { route } from "preact-router";
import { Pages } from "../NavigationBar";
import { useAsyncAsHook } from "../hooks/useAsyncAsHook";

export function ManualWithdrawPage(): VNode {
  const [success, setSuccess] = useState<
    | {
        response: AcceptManualWithdrawalResult;
        exchangeBaseUrl: string;
        amount: AmountJson;
      }
    | undefined
  >(undefined);
  const [error, setError] = useState<string | undefined>(undefined);

  const state = useAsyncAsHook(() => wxApi.listExchanges());

  async function doCreate(
    exchangeBaseUrl: string,
    amount: AmountJson,
  ): Promise<void> {
    try {
      const response = await wxApi.acceptManualWithdrawal(
        exchangeBaseUrl,
        Amounts.stringify(amount),
      );
      setSuccess({ exchangeBaseUrl, response, amount });
    } catch (e) {
      if (e instanceof Error) {
        setError(e.message);
      } else {
        setError("unexpected error");
      }
      setSuccess(undefined);
    }
  }

  if (success) {
    return (
      <ReserveCreated
        reservePub={success.response.reservePub}
        payto={success.response.exchangePaytoUris[0]}
        exchangeBaseUrl={success.exchangeBaseUrl}
        amount={success.amount}
        onBack={() => {
          route(Pages.balance);
        }}
      />
    );
  }

  if (!state) {
    return <div>loading...</div>;
  }
  if (state.hasError) {
    return <div>There was an error getting the known exchanges</div>;
  }
  const exchangeList = state.response.exchanges.reduce(
    (p, c) => ({
      ...p,
      [c.exchangeBaseUrl]: c.currency,
    }),
    {} as Record<string, string>,
  );

  return (
    <CreateManualWithdraw
      error={error}
      exchangeList={exchangeList}
      onCreate={doCreate}
    />
  );
}
