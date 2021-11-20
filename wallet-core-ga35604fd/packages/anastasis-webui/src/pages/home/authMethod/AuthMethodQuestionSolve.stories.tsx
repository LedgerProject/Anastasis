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
  title: "Pages/recovery/SolveChallenge/AuthMethods/question",
  component: TestedComponent,
  args: {
    order: 5,
  },
  argTypes: {
    onUpdate: { action: "onUpdate" },
    onBack: { action: "onBack" },
  },
};

const type: KnownAuthMethods = "question";

export const WithoutFeedback = createExample(
  TestedComponent[type].solve,
  {
    ...reducerStatesExample.challengeSolving,
    recovery_information: {
      challenges: [
        {
          cost: "USD:1",
          instructions: "does P equals NP?",
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

export const MessageFeedback = createExample(TestedComponent[type].solve, {
  ...reducerStatesExample.challengeSolving,
  recovery_information: {
    challenges: [
      {
        cost: "USD:1",
        instructions: "does P equals NP?",
        type: "question",
        uuid: "ASDASDSAD!1",
      },
    ],
    policies: [],
  },
  selected_challenge_uuid: "ASDASDSAD!1",
  challenge_feedback: {
    "ASDASDSAD!1": {
      state: ChallengeFeedbackStatus.Message,
      message: "Challenge should be solved",
    },
  },
} as ReducerState);

export const ServerFailureFeedback = createExample(
  TestedComponent[type].solve,
  {
    ...reducerStatesExample.challengeSolving,
    recovery_information: {
      challenges: [
        {
          cost: "USD:1",
          instructions: "does P equals NP?",
          type: "question",
          uuid: "ASDASDSAD!1",
        },
      ],
      policies: [],
    },
    selected_challenge_uuid: "ASDASDSAD!1",
    challenge_feedback: {
      "ASDASDSAD!1": {
        state: ChallengeFeedbackStatus.ServerFailure,
        http_status: 500,
        error_response: "Couldn't connect to mysql",
      },
    },
  } as ReducerState,
);

export const RedirectFeedback = createExample(TestedComponent[type].solve, {
  ...reducerStatesExample.challengeSolving,
  recovery_information: {
    challenges: [
      {
        cost: "USD:1",
        instructions: "does P equals NP?",
        type: "question",
        uuid: "ASDASDSAD!1",
      },
    ],
    policies: [],
  },
  selected_challenge_uuid: "ASDASDSAD!1",
  challenge_feedback: {
    "ASDASDSAD!1": {
      state: ChallengeFeedbackStatus.Redirect,
      http_status: 302,
      redirect_url: "http://video.taler.net",
    },
  },
} as ReducerState);

export const MessageRateLimitExceededFeedback = createExample(
  TestedComponent[type].solve,
  {
    ...reducerStatesExample.challengeSolving,
    recovery_information: {
      challenges: [
        {
          cost: "USD:1",
          instructions: "does P equals NP?",
          type: "question",
          uuid: "ASDASDSAD!1",
        },
      ],
      policies: [],
    },
    selected_challenge_uuid: "ASDASDSAD!1",
    challenge_feedback: {
      "ASDASDSAD!1": {
        state: ChallengeFeedbackStatus.RateLimitExceeded,
      },
    },
  } as ReducerState,
);

export const UnsupportedFeedback = createExample(TestedComponent[type].solve, {
  ...reducerStatesExample.challengeSolving,
  recovery_information: {
    challenges: [
      {
        cost: "USD:1",
        instructions: "does P equals NP?",
        type: "question",
        uuid: "ASDASDSAD!1",
      },
    ],
    policies: [],
  },
  selected_challenge_uuid: "ASDASDSAD!1",
  challenge_feedback: {
    "ASDASDSAD!1": {
      state: ChallengeFeedbackStatus.Unsupported,
      http_status: 500,
      unsupported_method: "Question",
    },
  },
} as ReducerState);

export const TruthUnknownFeedback = createExample(TestedComponent[type].solve, {
  ...reducerStatesExample.challengeSolving,
  recovery_information: {
    challenges: [
      {
        cost: "USD:1",
        instructions: "does P equals NP?",
        type: "question",
        uuid: "ASDASDSAD!1",
      },
    ],
    policies: [],
  },
  selected_challenge_uuid: "ASDASDSAD!1",
  challenge_feedback: {
    "ASDASDSAD!1": {
      state: ChallengeFeedbackStatus.TruthUnknown,
    },
  },
} as ReducerState);

export const AuthIbanFeedback = createExample(TestedComponent[type].solve, {
  ...reducerStatesExample.challengeSolving,
  recovery_information: {
    challenges: [
      {
        cost: "USD:1",
        instructions: "does P equals NP?",
        type: "question",
        uuid: "ASDASDSAD!1",
      },
    ],
    policies: [],
  },
  selected_challenge_uuid: "ASDASDSAD!1",
  challenge_feedback: {
    "ASDASDSAD!1": {
      state: ChallengeFeedbackStatus.AuthIban,
      challenge_amount: "EUR:1",
      credit_iban: "DE12345789000",
      business_name: "Data Loss Incorporated",
      wire_transfer_subject: "Anastasis 987654321",
      answer_code: 987654321,
      // Fields that follow are only for compatibility with C reducer,
      // will be removed eventually,
      details: {
        business_name: "foo",
        challenge_amount: "foo",
        credit_iban: "foo",
        wire_transfer_subject: "foo",
      },
      method: "iban",
    },
  },
} as ReducerState);

export const PaymentFeedback = createExample(TestedComponent[type].solve, {
  ...reducerStatesExample.challengeSolving,
  recovery_information: {
    challenges: [
      {
        cost: "USD:1",
        instructions: "does P equals NP?",
        type: "question",
        uuid: "ASDASDSAD!1",
      },
    ],
    policies: [],
  },
  selected_challenge_uuid: "ASDASDSAD!1",
  challenge_feedback: {
    "ASDASDSAD!1": {
      state: ChallengeFeedbackStatus.Payment,
      taler_pay_uri: "taler://pay/...",
      provider: "https://localhost:8080/",
      payment_secret: "3P4561HAMHRRYEYD6CM6J7TS5VTD5SR2K2EXJDZEFSX92XKHR4KG",
    },
  },
} as ReducerState);
