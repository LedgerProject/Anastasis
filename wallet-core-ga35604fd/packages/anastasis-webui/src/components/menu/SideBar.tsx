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

import { Fragment, h, VNode } from "preact";
import { BackupStates, RecoveryStates } from "../../../../anastasis-core/lib";
import { useAnastasisContext } from "../../context/anastasis";
import { Translate } from "../../i18n";
import { LangSelector } from "./LangSelector";

interface Props {
  mobile?: boolean;
}

export function Sidebar({ mobile }: Props): VNode {
  // const config = useConfigContext();
  const config = { version: "none" };
  // FIXME: add replacement for __VERSION__ with the current version
  const process = { env: { __VERSION__: "0.0.0" } };
  const reducer = useAnastasisContext()!;

  return (
    <aside class="aside is-placed-left is-expanded">
      {/* {mobile && <div class="footer" onClick={(e) => { return e.stopImmediatePropagation() }}>
        <LangSelector />
      </div>} */}
      <div class="aside-tools">
        <div class="aside-tools-label">
          <div>
            <b>Anastasis</b>
          </div>
          <div
            class="is-size-7 has-text-right"
            style={{ lineHeight: 0, marginTop: -10 }}
          >
            Version {process.env.__VERSION__} ({config.version})
          </div>
        </div>
      </div>
      <div class="menu is-menu-main">
        {!reducer.currentReducerState && (
          <p class="menu-label">
            <Translate>Backup or Recorver</Translate>
          </p>
        )}
        <ul class="menu-list">
          {!reducer.currentReducerState && (
            <li>
              <div class="ml-4">
                <span class="menu-item-label">
                  <Translate>Select one option</Translate>
                </span>
              </div>
            </li>
          )}
          {reducer.currentReducerState &&
          reducer.currentReducerState.backup_state ? (
            <Fragment>
              <li
                class={
                  reducer.currentReducerState.backup_state ===
                    BackupStates.ContinentSelecting ||
                  reducer.currentReducerState.backup_state ===
                    BackupStates.CountrySelecting
                    ? "is-active"
                    : ""
                }
              >
                <div class="ml-4">
                  <span class="menu-item-label">
                    <Translate>Location</Translate>
                  </span>
                </div>
              </li>
              <li
                class={
                  reducer.currentReducerState.backup_state ===
                  BackupStates.UserAttributesCollecting
                    ? "is-active"
                    : ""
                }
              >
                <div class="ml-4">
                  <span class="menu-item-label">
                    <Translate>Personal information</Translate>
                  </span>
                </div>
              </li>
              <li
                class={
                  reducer.currentReducerState.backup_state ===
                  BackupStates.AuthenticationsEditing
                    ? "is-active"
                    : ""
                }
              >
                <div class="ml-4">
                  <span class="menu-item-label">
                    <Translate>Authorization methods</Translate>
                  </span>
                </div>
              </li>
              <li
                class={
                  reducer.currentReducerState.backup_state ===
                  BackupStates.PoliciesReviewing
                    ? "is-active"
                    : ""
                }
              >
                <div class="ml-4">
                  <span class="menu-item-label">
                    <Translate>Policies</Translate>
                  </span>
                </div>
              </li>
              <li
                class={
                  reducer.currentReducerState.backup_state ===
                  BackupStates.SecretEditing
                    ? "is-active"
                    : ""
                }
              >
                <div class="ml-4">
                  <span class="menu-item-label">
                    <Translate>Secret input</Translate>
                  </span>
                </div>
              </li>
              {/* <li class={reducer.currentReducerState.backup_state === BackupStates.PoliciesPaying ? 'is-active' : ''}>
              <div class="ml-4">

                <span class="menu-item-label"><Translate>Payment (optional)</Translate></span>
              </div>
            </li> */}
              <li
                class={
                  reducer.currentReducerState.backup_state ===
                  BackupStates.BackupFinished
                    ? "is-active"
                    : ""
                }
              >
                <div class="ml-4">
                  <span class="menu-item-label">
                    <Translate>Backup completed</Translate>
                  </span>
                </div>
              </li>
              {/* <li class={reducer.currentReducerState.backup_state === BackupStates.TruthsPaying ? 'is-active' : ''}>
              <div class="ml-4">

                <span class="menu-item-label"><Translate>Truth Paying</Translate></span>
              </div>
            </li> */}
            </Fragment>
          ) : (
            reducer.currentReducerState &&
            reducer.currentReducerState?.recovery_state && (
              <Fragment>
                <li
                  class={
                    reducer.currentReducerState.recovery_state ===
                      RecoveryStates.ContinentSelecting ||
                    reducer.currentReducerState.recovery_state ===
                      RecoveryStates.CountrySelecting
                      ? "is-active"
                      : ""
                  }
                >
                  <div class="ml-4">
                    <span class="menu-item-label">
                      <Translate>Location</Translate>
                    </span>
                  </div>
                </li>
                <li
                  class={
                    reducer.currentReducerState.recovery_state ===
                    RecoveryStates.UserAttributesCollecting
                      ? "is-active"
                      : ""
                  }
                >
                  <div class="ml-4">
                    <span class="menu-item-label">
                      <Translate>Personal information</Translate>
                    </span>
                  </div>
                </li>
                <li
                  class={
                    reducer.currentReducerState.recovery_state ===
                    RecoveryStates.SecretSelecting
                      ? "is-active"
                      : ""
                  }
                >
                  <div class="ml-4">
                    <span class="menu-item-label">
                      <Translate>Secret selection</Translate>
                    </span>
                  </div>
                </li>
                <li
                  class={
                    reducer.currentReducerState.recovery_state ===
                      RecoveryStates.ChallengeSelecting ||
                    reducer.currentReducerState.recovery_state ===
                      RecoveryStates.ChallengeSolving
                      ? "is-active"
                      : ""
                  }
                >
                  <div class="ml-4">
                    <span class="menu-item-label">
                      <Translate>Solve Challenges</Translate>
                    </span>
                  </div>
                </li>
                <li
                  class={
                    reducer.currentReducerState.recovery_state ===
                    RecoveryStates.RecoveryFinished
                      ? "is-active"
                      : ""
                  }
                >
                  <div class="ml-4">
                    <span class="menu-item-label">
                      <Translate>Secret recovered</Translate>
                    </span>
                  </div>
                </li>
              </Fragment>
            )
          )}
          {reducer.currentReducerState && (
            <li>
              <div class="buttons ml-4">
                <button
                  class="button is-danger is-right"
                  onClick={() => reducer.reset()}
                >
                  Reset session
                </button>
              </div>
            </li>
          )}
          {/* <li>
              <div class="buttons ml-4">
                <button class="button is-info is-right" >Manage providers</button>
              </div>
            </li> */}
        </ul>
      </div>
    </aside>
  );
}
