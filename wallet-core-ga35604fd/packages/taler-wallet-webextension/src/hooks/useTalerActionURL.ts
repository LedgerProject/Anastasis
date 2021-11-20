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

import { classifyTalerUri, TalerUriType } from "@gnu-taler/taler-util";
import { useEffect, useState } from "preact/hooks";

export function useTalerActionURL(): [
  string | undefined,
  (s: boolean) => void,
] {
  const [talerActionUrl, setTalerActionUrl] = useState<string | undefined>(
    undefined,
  );
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    async function check(): Promise<void> {
      const talerUri = await findTalerUriInActiveTab();
      setTalerActionUrl(talerUri);
    }
    check();
  }, []);
  const url = dismissed ? undefined : talerActionUrl;
  return [url, setDismissed];
}

async function findTalerUriInActiveTab(): Promise<string | undefined> {
  return new Promise((resolve, reject) => {
    chrome.tabs.executeScript(
      {
        code: `
        (() => {
          let x = document.querySelector("a[href^='taler://'") || document.querySelector("a[href^='taler+http://'");
          return x ? x.href.toString() : null;
        })();
      `,
        allFrames: false,
      },
      (result) => {
        if (chrome.runtime.lastError) {
          console.error(chrome.runtime.lastError);
          resolve(undefined);
          return;
        }
        console.log("got result", result);
        resolve(result[0]);
      },
    );
  });
}
