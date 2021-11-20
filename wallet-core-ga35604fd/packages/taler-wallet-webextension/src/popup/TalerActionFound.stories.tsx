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
import { TalerActionFound as TestedComponent } from "./TalerActionFound";

export default {
  title: "popup/TalerActionFound",
  component: TestedComponent,
};

export const PayAction = createExample(TestedComponent, {
  url: "taler://pay/something",
});

export const WithdrawalAction = createExample(TestedComponent, {
  url: "taler://withdraw/something",
});

export const TipAction = createExample(TestedComponent, {
  url: "taler://tip/something",
});

export const NotifyAction = createExample(TestedComponent, {
  url: "taler://notify-reserve/something",
});

export const RefundAction = createExample(TestedComponent, {
  url: "taler://refund/something",
});

export const InvalidAction = createExample(TestedComponent, {
  url: "taler://something/asd",
});
