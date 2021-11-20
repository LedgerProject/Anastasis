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

import { Timestamp } from "@gnu-taler/taler-util";
import { formatISO, format } from "date-fns";
import { h, VNode } from "preact";

export function Time({
  timestamp,
  format: formatString,
}: {
  timestamp: Timestamp | undefined;
  format: string;
}): VNode {
  return (
    <time
      dateTime={
        !timestamp || timestamp.t_ms === "never"
          ? undefined
          : formatISO(timestamp.t_ms)
      }
    >
      {!timestamp || timestamp.t_ms === "never"
        ? "never"
        : format(timestamp.t_ms, formatString)}
    </time>
  );
}
