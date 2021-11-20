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

import { createExample } from "../test-utils";
import { CreateManualWithdraw as TestedComponent } from "./CreateManualWithdraw";

export default {
  title: "wallet/manual withdraw/creation",
  component: TestedComponent,
  argTypes: {},
};

// ,
const exchangeList = {
  "http://exchange.taler:8081": "COL",
  "http://exchange.tal": "EUR",
};

export const WithoutAnyExchangeKnown = createExample(TestedComponent, {
  exchangeList: {},
});

export const InitialState = createExample(TestedComponent, {
  exchangeList,
});

export const WithAmountInitialized = createExample(TestedComponent, {
  initialAmount: "10",
  exchangeList,
});

export const WithExchangeError = createExample(TestedComponent, {
  error: "The exchange url seems invalid",
  exchangeList,
});

export const WithAmountError = createExample(TestedComponent, {
  initialAmount: "e",
  exchangeList,
});
