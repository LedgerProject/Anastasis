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

import { createExample, reducerStatesExample } from "../../../utils";
import { authMethods as TestedComponent, KnownAuthMethods } from "./index";

export default {
  title: "Pages/backup/AuthorizationMethod/AuthMethods/IBAN",
  component: TestedComponent,
  args: {
    order: 5,
  },
  argTypes: {
    onUpdate: { action: "onUpdate" },
    onBack: { action: "onBack" },
  },
};

const type: KnownAuthMethods = "iban";

export const Empty = createExample(
  TestedComponent[type].setup,
  reducerStatesExample.authEditing,
  {
    configured: [],
  },
);

export const WithOneExample = createExample(
  TestedComponent[type].setup,
  reducerStatesExample.authEditing,
  {
    configured: [
      {
        challenge: "qwe",
        type,
        instructions: "Wire transfer from QWEASD123123 with holder Sebastian",
        remove: () => null,
      },
    ],
  },
);
export const WithMoreExamples = createExample(
  TestedComponent[type].setup,
  reducerStatesExample.authEditing,
  {
    configured: [
      {
        challenge: "qwe",
        type,
        instructions: "Wire transfer from QWEASD123123 with holder Javier",
        remove: () => null,
      },
      {
        challenge: "qwe",
        type,
        instructions: "Wire transfer from QWEASD123123 with holder Sebastian",
        remove: () => null,
      },
    ],
  },
);
