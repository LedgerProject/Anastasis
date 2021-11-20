/* eslint-disable @typescript-eslint/camelcase */
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
import { EditPoliciesScreen as TestedComponent } from "./EditPoliciesScreen";

export default {
  title: "Pages/backup/ReviewPolicies/EditPolicies",
  args: {
    order: 6,
  },
  component: TestedComponent,
  argTypes: {
    onUpdate: { action: "onUpdate" },
    onBack: { action: "onBack" },
  },
};

export const EditingAPolicy = createExample(
  TestedComponent,
  {
    ...reducerStatesExample.policyReview,
    policies: [
      {
        methods: [
          {
            authentication_method: 1,
            provider: "https://anastasis.demo.taler.net/",
          },
          {
            authentication_method: 2,
            provider: "http://localhost:8086/",
          },
        ],
      },
      {
        methods: [
          {
            authentication_method: 1,
            provider: "http://localhost:8086/",
          },
        ],
      },
    ],
    authentication_methods: [
      {
        type: "email",
        instructions: "Email to qwe@asd.com",
        challenge: "E5VPA",
      },
      {
        type: "totp",
        instructions: "Response code for 'Anastasis'",
        challenge: "E5VPA",
      },
      {
        type: "sms",
        instructions: "SMS to 6666-6666",
        challenge: "",
      },
      {
        type: "question",
        instructions: "How did the chicken cross the road?",
        challenge: "C5SP8",
      },
    ],
  } as ReducerState,
  { index: 0 },
);

export const CreatingAPolicy = createExample(
  TestedComponent,
  {
    ...reducerStatesExample.policyReview,
    policies: [
      {
        methods: [
          {
            authentication_method: 1,
            provider: "https://anastasis.demo.taler.net/",
          },
          {
            authentication_method: 2,
            provider: "http://localhost:8086/",
          },
        ],
      },
      {
        methods: [
          {
            authentication_method: 1,
            provider: "http://localhost:8086/",
          },
        ],
      },
    ],
    authentication_methods: [
      {
        type: "email",
        instructions: "Email to qwe@asd.com",
        challenge: "E5VPA",
      },
      {
        type: "totp",
        instructions: "Response code for 'Anastasis'",
        challenge: "E5VPA",
      },
      {
        type: "sms",
        instructions: "SMS to 6666-6666",
        challenge: "",
      },
      {
        type: "question",
        instructions: "How did the chicken cross the road?",
        challenge: "C5SP8",
      },
    ],
  } as ReducerState,
  { index: 3 },
);
