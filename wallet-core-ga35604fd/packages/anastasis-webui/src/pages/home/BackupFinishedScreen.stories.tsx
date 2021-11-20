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

import { ReducerState } from "anastasis-core";
import { createExample, reducerStatesExample } from "../../utils";
import { BackupFinishedScreen as TestedComponent } from "./BackupFinishedScreen";

export default {
  title: "Pages/backup/Finished",
  component: TestedComponent,
  args: {
    order: 8,
  },
  argTypes: {
    onUpdate: { action: "onUpdate" },
    onBack: { action: "onBack" },
  },
};

export const WithoutName = createExample(
  TestedComponent,
  reducerStatesExample.backupFinished,
);

export const WithName = createExample(TestedComponent, {
  ...reducerStatesExample.backupFinished,
  secret_name: "super_secret",
} as ReducerState);

export const WithDetails = createExample(TestedComponent, {
  ...reducerStatesExample.backupFinished,
  secret_name: "super_secret",
  success_details: {
    "https://anastasis.demo.taler.net/": {
      policy_expiration: {
        t_ms: "never",
      },
      policy_version: 0,
    },
    "https://kudos.demo.anastasis.lu/": {
      policy_expiration: {
        t_ms: new Date().getTime() + 60 * 60 * 24 * 1000,
      },
      policy_version: 1,
    },
  },
} as ReducerState);
