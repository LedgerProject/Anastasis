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

import { encodeCrock, stringToBytes } from "@gnu-taler/taler-util";
import { ReducerState } from "anastasis-core";
import { createExample, reducerStatesExample } from "../../utils";
import { RecoveryFinishedScreen as TestedComponent } from "./RecoveryFinishedScreen";

export default {
  title: "Pages/recovery/Finished",
  args: {
    order: 7,
  },
  component: TestedComponent,
  argTypes: {
    onUpdate: { action: "onUpdate" },
    onBack: { action: "onBack" },
  },
};

export const GoodEnding = createExample(TestedComponent, {
  ...reducerStatesExample.recoveryFinished,
  recovery_document: {
    secret_name: "the_name_of_the_secret",
  },
  core_secret: {
    mime: "text/plain",
    value: encodeCrock(
      stringToBytes("hello this is my secret, don't tell anybody"),
    ),
  },
} as ReducerState);

export const BadEnding = createExample(
  TestedComponent,
  reducerStatesExample.recoveryFinished,
);
