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

import { createContext, h, VNode } from "preact";
import { useContext, useEffect } from "preact/hooks";
import { useLang } from "../hooks/useLang";
//@ts-ignore: type declaration
import * as jedLib from "jed";
import { strings } from "../i18n/strings";
import { setupI18n } from "@gnu-taler/taler-util";

interface Type {
  lang: string;
  changeLanguage: (l: string) => void;
}
const initial = {
  lang: "en",
  changeLanguage: () => {
    // do not change anything
  },
};
const Context = createContext<Type>(initial);

interface Props {
  initial?: string;
  children: any;
  forceLang?: string;
}

//we use forceLang when we don't want to use the saved state, but sone forced
//runtime lang predefined lang
export const TranslationProvider = ({
  initial,
  children,
  forceLang,
}: Props): VNode => {
  const [lang, changeLanguage] = useLang(initial);
  useEffect(() => {
    if (forceLang) {
      changeLanguage(forceLang);
    }
  });
  useEffect(() => {
    setupI18n(lang, strings);
  }, [lang]);
  if (forceLang) {
    setupI18n(forceLang, strings);
  } else {
    setupI18n(lang, strings);
  }
  return h(Context.Provider, { value: { lang, changeLanguage }, children });
};

export const useTranslationContext = (): Type => useContext(Context);
