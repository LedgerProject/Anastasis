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

import { OrderShortInfo } from "@gnu-taler/taler-util";
import { createExample } from "../test-utils";
import { View as TestedComponent } from "./Refund";

export default {
  title: "cta/refund",
  component: TestedComponent,
  argTypes: {},
};

export const Complete = createExample(TestedComponent, {
  applyResult: {
    amountEffectivePaid: "USD:10",
    amountRefundGone: "USD:0",
    amountRefundGranted: "USD:2",
    contractTermsHash: "QWEASDZXC",
    info: ({
      summary: "tasty cold beer",
      contractTermsHash: "QWEASDZXC",
    } as Partial<OrderShortInfo>) as any,
    pendingAtExchange: false,
    proposalId: "proposal123",
  },
});

export const Partial = createExample(TestedComponent, {
  applyResult: {
    amountEffectivePaid: "USD:10",
    amountRefundGone: "USD:1",
    amountRefundGranted: "USD:2",
    contractTermsHash: "QWEASDZXC",
    info: ({
      summary: "tasty cold beer",
      contractTermsHash: "QWEASDZXC",
    } as Partial<OrderShortInfo>) as any,
    pendingAtExchange: false,
    proposalId: "proposal123",
  },
});

export const InProgress = createExample(TestedComponent, {
  applyResult: {
    amountEffectivePaid: "USD:10",
    amountRefundGone: "USD:1",
    amountRefundGranted: "USD:2",
    contractTermsHash: "QWEASDZXC",
    info: ({
      summary: "tasty cold beer",
      contractTermsHash: "QWEASDZXC",
    } as Partial<OrderShortInfo>) as any,
    pendingAtExchange: true,
    proposalId: "proposal123",
  },
});
