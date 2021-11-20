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

import { ReducerState } from "anastasis-core";
import { createExample, reducerStatesExample } from "../../utils";
import { PoliciesPayingScreen as TestedComponent } from "./PoliciesPayingScreen";

export default {
  title: "Pages/backup/__PoliciesPaying",
  component: TestedComponent,
  args: {
    order: 9,
  },
  argTypes: {
    onUpdate: { action: "onUpdate" },
    onBack: { action: "onBack" },
  },
};

export const Example = createExample(
  TestedComponent,
  reducerStatesExample.policyPay,
);
export const WithSomePaymentRequest = createExample(TestedComponent, {
  ...reducerStatesExample.policyPay,
  policy_payment_requests: [
    {
      payto: "payto://x-taler-bank/bank.taler/account-a",
      provider: "provider1",
    },
    {
      payto: "payto://x-taler-bank/bank.taler/account-b",
      provider: "provider2",
    },
  ],
} as ReducerState);
