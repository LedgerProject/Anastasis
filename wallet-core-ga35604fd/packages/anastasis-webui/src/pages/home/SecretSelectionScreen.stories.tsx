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
import { SecretSelectionScreen as TestedComponent } from "./SecretSelectionScreen";

export default {
  title: "Pages/recovery/SecretSelection",
  component: TestedComponent,
  args: {
    order: 4,
  },
  argTypes: {
    onUpdate: { action: "onUpdate" },
    onBack: { action: "onBack" },
  },
};

export const Example = createExample(TestedComponent, {
  ...reducerStatesExample.secretSelection,
  recovery_document: {
    provider_url: "https://kudos.demo.anastasis.lu/",
    secret_name: "secretName",
    version: 1,
  },
} as ReducerState);

export const NoRecoveryDocumentFound = createExample(TestedComponent, {
  ...reducerStatesExample.secretSelection,
  recovery_document: undefined,
} as ReducerState);
