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

import { useState, useEffect } from "preact/hooks";
import * as wxApi from "../wxApi";
import { getPermissionsApi } from "../compat";
import { extendedPermissions } from "../permissions";

export function useExtendedPermissions(): [boolean, () => void] {
  const [enabled, setEnabled] = useState(false);

  const toggle = () => {
    setEnabled((v) => !v);
    handleExtendedPerm(enabled).then((result) => {
      setEnabled(result);
    });
  };

  useEffect(() => {
    async function getExtendedPermValue(): Promise<void> {
      const res = await wxApi.getExtendedPermissions();
      setEnabled(res.newValue);
    }
    getExtendedPermValue();
  }, []);
  return [enabled, toggle];
}

async function handleExtendedPerm(isEnabled: boolean): Promise<boolean> {
  let nextVal: boolean | undefined;

  if (!isEnabled) {
    const granted = await new Promise<boolean>((resolve, reject) => {
      // We set permissions here, since apparently FF wants this to be done
      // as the result of an input event ...
      getPermissionsApi().request(extendedPermissions, (granted: boolean) => {
        if (chrome.runtime.lastError) {
          console.error("error requesting permissions");
          console.error(chrome.runtime.lastError);
          reject(chrome.runtime.lastError);
          return;
        }
        console.log("permissions granted:", granted);
        resolve(granted);
      });
    });
    const res = await wxApi.setExtendedPermissions(granted);
    nextVal = res.newValue;
  } else {
    const res = await wxApi.setExtendedPermissions(false);
    nextVal = res.newValue;
  }
  console.log("new permissions applied:", nextVal ?? false);
  return nextVal ?? false;
}
