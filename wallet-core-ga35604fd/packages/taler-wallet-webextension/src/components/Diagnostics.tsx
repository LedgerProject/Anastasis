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
import { Fragment, h, VNode } from "preact";
import { PageLink } from "../renderHtml";

interface Props {
  timedOut: boolean;
  diagnostics: WalletDiagnostics | undefined;
}

export function Diagnostics({ timedOut, diagnostics }: Props): VNode {
  if (timedOut) {
    return <p>Diagnostics timed out. Could not talk to the wallet backend.</p>;
  }

  if (diagnostics) {
    if (diagnostics.errors.length === 0) {
      return <Fragment />;
    }
    return (
      <div
        style={{
          borderLeft: "0.5em solid red",
          paddingLeft: "1em",
          paddingTop: "0.2em",
          paddingBottom: "0.2em",
        }}
      >
        <p>Problems detected:</p>
        <ol>
          {diagnostics.errors.map((errMsg) => (
            <li key={errMsg}>{errMsg}</li>
          ))}
        </ol>
        {diagnostics.firefoxIdbProblem ? (
          <p>
            Please check in your <code>about:config</code> settings that you
            have IndexedDB enabled (check the preference name{" "}
            <code>dom.indexedDB.enabled</code>).
          </p>
        ) : null}
        {diagnostics.dbOutdated ? (
          <p>
            Your wallet database is outdated. Currently automatic migration is
            not supported. Please go{" "}
            <PageLink pageName="/reset-required">here</PageLink> to reset the
            wallet database.
          </p>
        ) : null}
      </div>
    );
  }

  return <p>Running diagnostics ...</p>;
}
