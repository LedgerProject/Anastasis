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

import { h, VNode } from "preact";
import { Diagnostics } from "../components/Diagnostics";
import { useDiagnostics } from "../hooks/useDiagnostics";
import * as wxApi from "../wxApi";

export function DeveloperPage(): VNode {
  const [status, timedOut] = useDiagnostics();
  return (
    <div>
      <p>Debug tools:</p>
      <button onClick={openExtensionPage("/static/popup.html")}>
        wallet tab
      </button>
      <br />
      <button onClick={confirmReset}>reset</button>
      <Diagnostics diagnostics={status} timedOut={timedOut} />
    </div>
  );
}

export function reload(): void {
  try {
    // eslint-disable-next-line no-undef
    chrome.runtime.reload();
    window.close();
  } catch (e) {
    // Functionality missing in firefox, ignore!
  }
}

export async function confirmReset(): Promise<void> {
  if (
    confirm(
      "Do you want to IRREVOCABLY DESTROY everything inside your" +
        " wallet and LOSE ALL YOUR COINS?",
    )
  ) {
    await wxApi.resetDb();
    window.close();
  }
}

export function openExtensionPage(page: string) {
  return () => {
    // eslint-disable-next-line no-undef
    chrome.tabs.create({
      // eslint-disable-next-line no-undef
      url: chrome.extension.getURL(page),
    });
  };
}
