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

import { h, VNode } from "preact";
import { useState } from "preact/hooks";
import langIcon from "../../assets/icons/languageicon.svg";
import { useTranslationContext } from "../../context/translation";
import { strings as messages } from "../../i18n/strings";

type LangsNames = {
  [P in keyof typeof messages]: string;
};

const names: LangsNames = {
  es: "Español [es]",
  en: "English [en]",
  fr: "Français [fr]",
  de: "Deutsch [de]",
  sv: "Svenska [sv]",
  it: "Italiano [it]",
};

function getLangName(s: keyof LangsNames | string): string {
  if (names[s]) return names[s];
  return String(s);
}

export function LangSelector(): VNode {
  const [updatingLang, setUpdatingLang] = useState(false);
  const { lang, changeLanguage } = useTranslationContext();

  return (
    <div class="dropdown is-active ">
      <div class="dropdown-trigger">
        <button
          class="button has-tooltip-left"
          data-tooltip="change language selection"
          aria-haspopup="true"
          aria-controls="dropdown-menu"
          onClick={() => setUpdatingLang(!updatingLang)}
        >
          <div class="icon is-small is-left">
            <img src={langIcon} />
          </div>
          <span>{getLangName(lang)}</span>
          <div class="icon is-right">
            <i class="mdi mdi-chevron-down" />
          </div>
        </button>
      </div>
      {updatingLang && (
        <div class="dropdown-menu" id="dropdown-menu" role="menu">
          <div class="dropdown-content">
            {Object.keys(messages)
              .filter((l) => l !== lang)
              .map((l) => (
                <a
                  key={l}
                  class="dropdown-item"
                  value={l}
                  onClick={() => {
                    changeLanguage(l);
                    setUpdatingLang(false);
                  }}
                >
                  {getLangName(l)}
                </a>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
