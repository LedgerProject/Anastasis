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
 *
 * @author Sebastian Javier Marchano (sebasjm)
 */

import { AmountJson, Amounts, i18n } from "@gnu-taler/taler-util";
import { Fragment, h, VNode } from "preact";
import { useState } from "preact/hooks";
import { ErrorMessage } from "../components/ErrorMessage";
import { SelectList } from "../components/SelectList";
import {
  BoldLight,
  ButtonPrimary,
  ButtonSuccess,
  Centered,
  Input,
  InputWithLabel,
  LightText,
} from "../components/styled";

export interface Props {
  error: string | undefined;
  initialAmount?: string;
  exchangeList: Record<string, string>;
  onCreate: (exchangeBaseUrl: string, amount: AmountJson) => Promise<void>;
}

export function CreateManualWithdraw({
  initialAmount,
  exchangeList,
  error,
  onCreate,
}: Props): VNode {
  const exchangeSelectList = Object.keys(exchangeList);
  const currencySelectList = Object.values(exchangeList);
  const exchangeMap = exchangeSelectList.reduce(
    (p, c) => ({ ...p, [c]: `${c} (${exchangeList[c]})` }),
    {} as Record<string, string>,
  );
  const currencyMap = currencySelectList.reduce(
    (p, c) => ({ ...p, [c]: c }),
    {} as Record<string, string>,
  );

  const initialExchange =
    exchangeSelectList.length > 0 ? exchangeSelectList[0] : "";

  const [exchange, setExchange] = useState(initialExchange || "");
  const [currency, setCurrency] = useState(exchangeList[initialExchange] ?? "");

  const [amount, setAmount] = useState(initialAmount || "");
  const parsedAmount = Amounts.parse(`${currency}:${amount}`);

  function changeExchange(exchange: string): void {
    setExchange(exchange);
    setCurrency(exchangeList[exchange]);
  }

  function changeCurrency(currency: string): void {
    setCurrency(currency);
    const found = Object.entries(exchangeList).find((e) => e[1] === currency);

    if (found) {
      setExchange(found[0]);
    } else {
      setExchange("");
    }
  }

  if (!initialExchange) {
    return (
      <Centered style={{ marginTop: 100 }}>
        <BoldLight>No exchange configured</BoldLight>
        <ButtonSuccess
          //FIXME: add exchange feature
          onClick={() => {
            null;
          }}
        >
          <i18n.Translate>Add exchange</i18n.Translate>
        </ButtonSuccess>
      </Centered>
    );
  }

  return (
    <Fragment>
      <section>
        <ErrorMessage
          title={error && "Can't create the reserve"}
          description={error}
        />
        <h2>Manual Withdrawal</h2>
        <LightText>
          Choose a exchange to create a reserve and then fill the reserve to
          withdraw the coins
        </LightText>
        <p>
          <Input>
            <SelectList
              label="Currency"
              list={currencyMap}
              name="currency"
              value={currency}
              onChange={changeCurrency}
            />
          </Input>
          <Input>
            <SelectList
              label="Exchange"
              list={exchangeMap}
              name="currency"
              value={exchange}
              onChange={changeExchange}
            />
          </Input>
          {/* <p style={{ display: "flex", justifyContent: "right" }}>
            <a href="" style={{ marginLeft: "auto" }}>
              Add new exchange
            </a>
          </p> */}
          {currency && (
            <InputWithLabel invalid={!!amount && !parsedAmount}>
              <label>Amount</label>
              <div>
                <span>{currency}</span>
                <input
                  type="number"
                  value={amount}
                  onInput={(e) => setAmount(e.currentTarget.value)}
                />
              </div>
            </InputWithLabel>
          )}
        </p>
      </section>
      <footer>
        <div />
        <ButtonPrimary
          disabled={!parsedAmount || !exchange}
          onClick={() => onCreate(exchange, parsedAmount!)}
        >
          Start withdrawal
        </ButtonPrimary>
      </footer>
    </Fragment>
  );
}
