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
import { ReserveCreated as TestedComponent } from "./ReserveCreated";

export default {
  title: "wallet/manual withdraw/reserve created",
  component: TestedComponent,
  argTypes: {},
};

export const TalerBank = createExample(TestedComponent, {
  reservePub: "A05AJGMFNSK4Q62NXR2FKNDB1J4EXTYQTE7VA4M9GZQ4TR06YBNG",
  payto:
    "payto://x-taler-bank/bank.taler:5882/exchangeminator?amount=COL%3A1&message=Taler+Withdrawal+A05AJGMFNSK4Q62NXR2FKNDB1J4EXTYQTE7VA4M9GZQ4TR06YBNG",
  amount: {
    currency: "USD",
    value: 10,
    fraction: 0,
  },
  exchangeBaseUrl: "https://exchange.demo.taler.net",
});

export const IBAN = createExample(TestedComponent, {
  reservePub: "A05AJGMFNSK4Q62NXR2FKNDB1J4EXTYQTE7VA4M9GZQ4TR06YBNG",
  payto:
    "payto://iban/ASDQWEASDZXCASDQWE?amount=COL%3A1&message=Taler+Withdrawal+A05AJGMFNSK4Q62NXR2FKNDB1J4EXTYQTE7VA4M9GZQ4TR06YBNG",
  amount: {
    currency: "USD",
    value: 10,
    fraction: 0,
  },
  exchangeBaseUrl: "https://exchange.demo.taler.net",
});
