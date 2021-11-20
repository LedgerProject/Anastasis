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

import { amountFractionalBase, Amounts, Balance } from "@gnu-taler/taler-util";
import { h, VNode } from "preact";
import { TableWithRoundRows as TableWithRoundedRows } from "./styled/index";

export function BalanceTable({ balances }: { balances: Balance[] }): VNode {
  const currencyFormatter = new Intl.NumberFormat("en-US");
  return (
    <TableWithRoundedRows>
      {balances.map((entry, idx) => {
        const av = Amounts.parseOrThrow(entry.available);

        const v = currencyFormatter.format(
          av.value + av.fraction / amountFractionalBase,
        );
        return (
          <tr key={idx}>
            <td>{av.currency}</td>
            <td
              style={{
                fontSize: "2em",
                textAlign: "right",
                width: "100%",
              }}
            >
              {v}
            </td>
          </tr>
        );
      })}
    </TableWithRoundedRows>
  );
}
