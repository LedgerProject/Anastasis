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

import { ExchangeListItem, i18n } from "@gnu-taler/taler-util";
import { Fragment, h, VNode } from "preact";
import { Checkbox } from "../components/Checkbox";
import { ButtonPrimary } from "../components/styled";
import { useDevContext } from "../context/devContext";
import { useAsyncAsHook } from "../hooks/useAsyncAsHook";
import { useBackupDeviceName } from "../hooks/useBackupDeviceName";
import { useExtendedPermissions } from "../hooks/useExtendedPermissions";
import { useLang } from "../hooks/useLang";
// import { strings as messages } from "../i18n/strings";
import * as wxApi from "../wxApi";

export function SettingsPage(): VNode {
  const [permissionsEnabled, togglePermissions] = useExtendedPermissions();
  const { devMode, toggleDevMode } = useDevContext();
  const { name, update } = useBackupDeviceName();
  const [lang, changeLang] = useLang();
  const exchangesHook = useAsyncAsHook(wxApi.listExchanges);

  return (
    <SettingsView
      lang={lang}
      changeLang={changeLang}
      knownExchanges={
        !exchangesHook || exchangesHook.hasError
          ? []
          : exchangesHook.response.exchanges
      }
      deviceName={name}
      setDeviceName={update}
      permissionsEnabled={permissionsEnabled}
      togglePermissions={togglePermissions}
      developerMode={devMode}
      toggleDeveloperMode={toggleDevMode}
    />
  );
}

export interface ViewProps {
  lang: string;
  changeLang: (s: string) => void;
  deviceName: string;
  setDeviceName: (s: string) => Promise<void>;
  permissionsEnabled: boolean;
  togglePermissions: () => void;
  developerMode: boolean;
  toggleDeveloperMode: () => void;
  knownExchanges: Array<ExchangeListItem>;
}

// type LangsNames = {
//   [P in keyof typeof messages]: string;
// };

// const names: LangsNames = {
//   es: "Español [es]",
//   en: "English [en]",
//   fr: "Français [fr]",
//   de: "Deutsch [de]",
//   sv: "Svenska [sv]",
//   it: "Italiano [it]",
// };

export function SettingsView({
  knownExchanges,
  // lang,
  // changeLang,
  // deviceName,
  // setDeviceName,
  permissionsEnabled,
  togglePermissions,
  developerMode,
  toggleDeveloperMode,
}: ViewProps): VNode {
  return (
    <Fragment>
      <section>
        <h2>
          <i18n.Translate>Known exchanges</i18n.Translate>
        </h2>
        {!knownExchanges || !knownExchanges.length ? (
          <div>No exchange yet!</div>
        ) : (
          <Fragment>
            <table>
              {knownExchanges.map((e, idx) => (
                <tr key={idx}>
                  <td>{e.currency}</td>
                  <td>
                    <a href={e.exchangeBaseUrl}>{e.exchangeBaseUrl}</a>
                  </td>
                </tr>
              ))}
            </table>
          </Fragment>
        )}
        <div style={{ display: "flex", justifyContent: "space-between" }}>
          <div />
          <ButtonPrimary>Manage exchange</ButtonPrimary>
        </div>
        {/* <h2><i18n.Translate>Wallet</i18n.Translate></h2> */}
        {/* <SelectList
          value={lang}
          onChange={changeLang}
          name="lang"
          list={names}
          label={i18n.str`Language`}
          description="(Choose your preferred lang)"
        />
        <EditableText
          value={deviceName}
          onChange={setDeviceName}
          name="device-id"
          label={i18n.str`Device name`}
          description="(This is how you will recognize the wallet in the backup provider)"
        /> */}
        <h2>
          <i18n.Translate>Permissions</i18n.Translate>
        </h2>
        <Checkbox
          label="Automatically open wallet based on page content"
          name="perm"
          description="(Enabling this option below will make using the wallet faster, but requires more permissions from your browser.)"
          enabled={permissionsEnabled}
          onToggle={togglePermissions}
        />
        <h2>Config</h2>
        <Checkbox
          label="Developer mode"
          name="devMode"
          description="(More options and information useful for debugging)"
          enabled={developerMode}
          onToggle={toggleDeveloperMode}
        />
      </section>
      <footer style={{ justifyContent: "space-around" }}>
        <a
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: "darkgreen", textDecoration: "none" }}
          href={
            // eslint-disable-next-line no-undef
            chrome.extension
              ? // eslint-disable-next-line no-undef
                chrome.extension.getURL(`/static/wallet.html#/settings`)
              : "#"
          }
        >
          VIEW MORE SETTINGS
        </a>
      </footer>
    </Fragment>
  );
}
