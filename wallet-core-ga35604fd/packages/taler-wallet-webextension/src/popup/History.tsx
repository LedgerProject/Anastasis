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
  i18n,
  Transaction,
  TransactionsResponse,
} from "@gnu-taler/taler-util";
import { Fragment, h, VNode } from "preact";
import { useEffect, useState } from "preact/hooks";
import { PopupBox } from "../components/styled";
import { TransactionItem } from "../components/TransactionItem";
import { useAsyncAsHook } from "../hooks/useAsyncAsHook";
import * as wxApi from "../wxApi";

export function HistoryPage(): VNode {
  const [transactions, setTransactions] = useState<
    TransactionsResponse | undefined
  >(undefined);
  const balance = useAsyncAsHook(wxApi.getBalance);
  const balanceWithoutError = balance?.hasError
    ? []
    : balance?.response.balances || [];

  useEffect(() => {
    const fetchData = async (): Promise<void> => {
      const res = await wxApi.getTransactions();
      setTransactions(res);
    };
    fetchData();
  }, []);

  if (!transactions) {
    return <div>Loading ...</div>;
  }

  return (
    <HistoryView
      balances={balanceWithoutError}
      list={[...transactions.transactions].reverse()}
    />
  );
}

function amountToString(c: AmountString): string {
  const idx = c.indexOf(":");
  return `${c.substring(idx + 1)} ${c.substring(0, idx)}`;
}

export function HistoryView({
  list,
  balances,
}: {
  list: Transaction[];
  balances: Balance[];
}): VNode {
  const multiCurrency = balances.length > 1;
  return (
    <Fragment>
      {balances.length > 0 && (
        <header>
          {multiCurrency ? (
            <div class="title">
              Balance:{" "}
              <ul style={{ margin: 0 }}>
                {balances.map((b, i) => (
                  <li key={i}>{b.available}</li>
                ))}
              </ul>
            </div>
          ) : (
            <div class="title">
              Balance: <span>{amountToString(balances[0].available)}</span>
            </div>
          )}
        </header>
      )}
      {list.length === 0 ? (
        <section data-expanded data-centered>
          <p>
            <i18n.Translate>
              You have no history yet, here you will be able to check your last
              transactions.
            </i18n.Translate>
          </p>
        </section>
      ) : (
        <section>
          {list.slice(0, 3).map((tx, i) => (
            <TransactionItem key={i} tx={tx} multiCurrency={multiCurrency} />
          ))}
        </section>
      )}
      <footer style={{ justifyContent: "space-around" }}>
        {list.length > 0 && (
          <a
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "darkgreen", textDecoration: "none" }}
            href={
              // eslint-disable-next-line no-undef
              chrome.extension
                ? // eslint-disable-next-line no-undef
                  chrome.extension.getURL(`/static/wallet.html#/history`)
                : "#"
            }
          >
            VIEW MORE TRANSACTIONS
          </a>
        )}
      </footer>
    </Fragment>
  );
}
