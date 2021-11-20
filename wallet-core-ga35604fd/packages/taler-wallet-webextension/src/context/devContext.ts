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
import { useContext, useState } from "preact/hooks";
import { useLocalStorage } from "../hooks/useLocalStorage";

interface Type {
  devMode: boolean;
  toggleDevMode: () => void;
}
const Context = createContext<Type>({
  devMode: false,
  toggleDevMode: () => null,
});

export const useDevContext = (): Type => useContext(Context);

export const DevContextProvider = ({ children }: { children: any }): VNode => {
  const [value, setter] = useLocalStorage("devMode");
  const devMode = value === "true";
  const toggleDevMode = () => setter((v) => (!v ? "true" : undefined));
  return h(Context.Provider, { value: { devMode, toggleDevMode }, children });
};
