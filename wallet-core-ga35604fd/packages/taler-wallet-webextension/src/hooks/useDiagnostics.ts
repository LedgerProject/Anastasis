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

import { WalletDiagnostics } from "@gnu-taler/taler-util";
import { useEffect, useState } from "preact/hooks";
import * as wxApi from "../wxApi";

export function useDiagnostics(): [WalletDiagnostics | undefined, boolean] {
  const [timedOut, setTimedOut] = useState(false);
  const [diagnostics, setDiagnostics] = useState<WalletDiagnostics | undefined>(
    undefined,
  );

  useEffect(() => {
    let gotDiagnostics = false;
    setTimeout(() => {
      if (!gotDiagnostics) {
        console.error("timed out");
        setTimedOut(true);
      }
    }, 1000);
    const doFetch = async (): Promise<void> => {
      const d = await wxApi.getDiagnostics();
      console.log("got diagnostics", d);
      gotDiagnostics = true;
      setDiagnostics(d);
    };
    console.log("fetching diagnostics");
    doFetch();
  }, []);
  return [diagnostics, timedOut];
}
