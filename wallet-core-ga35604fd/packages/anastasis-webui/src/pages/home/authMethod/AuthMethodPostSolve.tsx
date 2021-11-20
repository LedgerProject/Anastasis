import { ChallengeFeedbackStatus, ChallengeInfo } from "anastasis-core";
import { h, VNode } from "preact";
import { useState } from "preact/hooks";
import { AsyncButton } from "../../../components/AsyncButton";
import { TextInput } from "../../../components/fields/TextInput";
import { useAnastasisContext } from "../../../context/anastasis";
import { AnastasisClientFrame } from "../index";
import { SolveOverviewFeedbackDisplay } from "../SolveScreen";
import { AuthMethodSolveProps } from "./index";

export function AuthMethodPostSolve({ id }: AuthMethodSolveProps): VNode {
  const [answer, setAnswer] = useState("A-");

  const reducer = useAnastasisContext();
  if (!reducer) {
    return (
      <AnastasisClientFrame hideNav title="Recovery problem">
        <div>no reducer in context</div>
      </AnastasisClientFrame>
    );
  }
  if (
    !reducer.currentReducerState ||
    reducer.currentReducerState.recovery_state === undefined
  ) {
    return (
      <AnastasisClientFrame hideNav title="Recovery problem">
        <div>invalid state</div>
      </AnastasisClientFrame>
    );
  }

  if (!reducer.currentReducerState.recovery_information) {
    return (
      <AnastasisClientFrame
        hideNext="Recovery document not found"
        title="Recovery problem"
      >
        <div>no recovery information found</div>
      </AnastasisClientFrame>
    );
  }
  if (!reducer.currentReducerState.selected_challenge_uuid) {
    return (
      <AnastasisClientFrame hideNav title="Recovery problem">
        <div>invalid state</div>
        <div
          style={{
            marginTop: "2em",
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <button class="button" onClick={() => reducer.back()}>
            Back
          </button>
        </div>
      </AnastasisClientFrame>
    );
  }

  const chArr = reducer.currentReducerState.recovery_information.challenges;
  const challengeFeedback =
    reducer.currentReducerState.challenge_feedback ?? {};
  const selectedUuid = reducer.currentReducerState.selected_challenge_uuid;
  const challenges: {
    [uuid: string]: ChallengeInfo;
  } = {};
  for (const ch of chArr) {
    challenges[ch.uuid] = ch;
  }
  const selectedChallenge = challenges[selectedUuid];
  const feedback = challengeFeedback[selectedUuid];

  async function onNext(): Promise<void> {
    return reducer?.transition("solve_challenge", { answer });
  }
  function onCancel(): void {
    reducer?.back();
  }

  const shouldHideConfirm =
    feedback?.state === ChallengeFeedbackStatus.RateLimitExceeded ||
    feedback?.state === ChallengeFeedbackStatus.Redirect ||
    feedback?.state === ChallengeFeedbackStatus.Unsupported ||
    feedback?.state === ChallengeFeedbackStatus.TruthUnknown;

  return (
    <AnastasisClientFrame hideNav title="Postal Challenge">
      <SolveOverviewFeedbackDisplay feedback={feedback} />
      <p>Wait for the answer</p>
      <TextInput
        onConfirm={onNext}
        label="Answer"
        grabFocus
        bind={[answer, setAnswer]}
      />

      <div
        style={{
          marginTop: "2em",
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        <button class="button" onClick={onCancel}>
          Cancel
        </button>
        {!shouldHideConfirm && (
          <AsyncButton class="button is-info" onClick={onNext}>
            Confirm
          </AsyncButton>
        )}
      </div>
    </AnastasisClientFrame>
  );
}
