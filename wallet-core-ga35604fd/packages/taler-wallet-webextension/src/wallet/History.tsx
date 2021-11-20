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

import {
  AmountString,
  Balance,
  NotificationType,
  Transaction,
} from "@gnu-taler/taler-util";
import { Fragment, h, VNode } from "preact";
import { DateSeparator } from "../components/styled";
import { Time } from "../components/Time";
import { TransactionItem } from "../components/TransactionItem";
import { useAsyncAsHook } from "../hooks/useAsyncAsHook";
import * as wxApi from "../wxApi";

export function HistoryPage(): VNode {
  const balance = useAsyncAsHook(wxApi.getBalance);
  const balanceWithoutError = balance?.hasError
    ? []
    : balance?.response.balances || [];

  const transactionQuery = useAsyncAsHook(wxApi.getTransactions, [
    NotificationType.WithdrawGroupFinished,
  ]);

  if (!transactionQuery) {
    return <div>Loading ...</div>;
  }
  if (transactionQuery.hasError) {
    return <div>There was an error loading the transactions.</div>;
  }

  return (
    <HistoryView
      balances={balanceWithoutError}
      list={[...transactionQuery.response.transactions].reverse()}
    />
  );
}

function amountToString(c: AmountString): string {
  const idx = c.indexOf(":");
  return `${c.substring(idx + 1)} ${c.substring(0, idx)}`;
}

const term = 1000 * 60 * 60 * 24;
function normalizeToDay(x: number): number {
  return Math.round(x / term) * term;
}

export function HistoryView({
  list,
  balances,
}: {
  list: Transaction[];
  balances: Balance[];
}): VNode {
  const byDate = list.reduce((rv, x) => {
    const theDate =
      x.timestamp.t_ms === "never" ? 0 : normalizeToDay(x.timestamp.t_ms);
    if (theDate) {
      (rv[theDate] = rv[theDate] || []).push(x);
    }

    return rv;
  }, {} as { [x: string]: Transaction[] });

  const multiCurrency = balances.length > 1;

  return (
    <Fragment>
      {balances.length > 0 && (
        <header>
          {balances.length === 1 && (
            <div class="title">
              Balance: <span>{amountToString(balances[0].available)}</span>
            </div>
          )}
          {balances.length > 1 && (
            <div class="title">
              Balance:{" "}
              <ul style={{ margin: 0 }}>
                {balances.map((b, i) => (
                  <li key={i}>{b.available}</li>
                ))}
              </ul>
            </div>
          )}
        </header>
      )}
      <section>
        {Object.keys(byDate).map((d, i) => {
          return (
            <Fragment key={i}>
              <DateSeparator>
                <Time
                  timestamp={{ t_ms: Number.parseInt(d, 10) }}
                  format="dd MMMM yyyy"
                />
              </DateSeparator>
              {byDate[d].map((tx, i) => (
                <TransactionItem
                  key={i}
                  tx={tx}
                  multiCurrency={multiCurrency}
                />
              ))}
            </Fragment>
          );
        })}
      </section>
    </Fragment>
  );
}
