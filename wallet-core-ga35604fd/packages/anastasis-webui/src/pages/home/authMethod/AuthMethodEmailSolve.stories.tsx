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

import { ChallengeFeedbackStatus, ReducerState } from "anastasis-core";
import { createExample, reducerStatesExample } from "../../../utils";
import { authMethods as TestedComponent, KnownAuthMethods } from "./index";

export default {
  title: "Pages/recovery/SolveChallenge/AuthMethods/email",
  component: TestedComponent,
  args: {
    order: 5,
  },
  argTypes: {
    onUpdate: { action: "onUpdate" },
    onBack: { action: "onBack" },
  },
};

const type: KnownAuthMethods = "email";

export const WithoutFeedback = createExample(
  TestedComponent[type].solve,
  {
    ...reducerStatesExample.challengeSolving,
    recovery_information: {
      challenges: [
        {
          cost: "USD:1",
          instructions: "Email to me@domain.com",
          type: "question",
          uuid: "uuid-1",
        },
      ],
      policies: [],
    },
    selected_challenge_uuid: "uuid-1",
  } as ReducerState,
  {
    id: "uuid-1",
  },
);

export const PaymentFeedback = createExample(
  TestedComponent[type].solve,
  {
    ...reducerStatesExample.challengeSolving,
    recovery_information: {
      challenges: [
        {
          cost: "USD:1",
          instructions: "Email to me@domain.com",
          type: "question",
          uuid: "uuid-1",
        },
      ],
      policies: [],
    },
    selected_challenge_uuid: "uuid-1",
    challenge_feedback: {
      "uuid-1": {
        state: ChallengeFeedbackStatus.Payment,
        taler_pay_uri: "taler://pay/...",
        provider: "https://localhost:8080/",
        payment_secret: "3P4561HAMHRRYEYD6CM6J7TS5VTD5SR2K2EXJDZEFSX92XKHR4KG",
      },
    },
  } as ReducerState,
  {
    id: "uuid-1",
  },
);
