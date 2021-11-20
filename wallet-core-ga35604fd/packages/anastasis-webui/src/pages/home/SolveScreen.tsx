import { h, VNode } from "preact";
import { AnastasisClientFrame } from ".";
import {
  ChallengeFeedback,
  ChallengeFeedbackStatus,
} from "../../../../anastasis-core/lib";
import { Notifications } from "../../components/Notifications";
import { useAnastasisContext } from "../../context/anastasis";
import { authMethods, KnownAuthMethods } from "./authMethod";

export function SolveOverviewFeedbackDisplay(props: {
  feedback?: ChallengeFeedback;
}): VNode {
  const { feedback } = props;
  if (!feedback) {
    return <div />;
  }
  switch (feedback.state) {
    case ChallengeFeedbackStatus.Message:
      return (
        <Notifications
          notifications={[
            {
              type: "INFO",
              message: `Message from provider`,
              description: feedback.message,
            },
          ]}
        />
      );
    case ChallengeFeedbackStatus.Payment:
      return (
        <Notifications
          notifications={[
            {
              type: "INFO",
              message: `Message from provider`,
              description: (
                <span>
                  To pay you can <a href={feedback.taler_pay_uri}>click here</a>
                </span>
              ),
            },
          ]}
        />
      );
    case ChallengeFeedbackStatus.AuthIban:
      return (
        <Notifications
          notifications={[
            {
              type: "INFO",
              message: `Message from provider`,
              description: `Need to send a wire transfer to "${feedback.business_name}"`,
            },
          ]}
        />
      );
    case ChallengeFeedbackStatus.ServerFailure:
      return (
        <Notifications
          notifications={[
            {
              type: "ERROR",
              message: `Server error: Code ${feedback.http_status}`,
              description: feedback.error_response,
            },
          ]}
        />
      );
    case ChallengeFeedbackStatus.RateLimitExceeded:
      return (
        <Notifications
          notifications={[
            {
              type: "ERROR",
              message: `Message from provider`,
              description: "There were to many failed attempts.",
            },
          ]}
        />
      );
    case ChallengeFeedbackStatus.Redirect:
      return (
        <Notifications
          notifications={[
            {
              type: "INFO",
              message: `Message from provider`,
              description: (
                <span>
                  Please visit this link: <a>{feedback.redirect_url}</a>
                </span>
              ),
            },
          ]}
        />
      );
    case ChallengeFeedbackStatus.Unsupported:
      return (
        <Notifications
          notifications={[
            {
              type: "ERROR",
              message: `This client doesn't support solving this type of challenge`,
              description: `Use another version or contact the provider. Type of challenge "${feedback.unsupported_method}"`,
            },
          ]}
        />
      );
    case ChallengeFeedbackStatus.TruthUnknown:
      return (
        <Notifications
          notifications={[
            {
              type: "ERROR",
              message: `Provider doesn't recognize the type of challenge`,
              description: "Contact the provider for further information",
            },
          ]}
        />
      );
    default:
      return <div />;
  }
}

export function SolveScreen(): VNode {
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
  function SolveNotImplemented(): VNode {
    return (
      <AnastasisClientFrame hideNav title="Not implemented">
        <p>
          The challenge selected is not supported for this UI. Please update
          this version or try using another policy.
        </p>
        {reducer && (
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
        )}
      </AnastasisClientFrame>
    );
  }

  const chArr = reducer.currentReducerState.recovery_information.challenges;
  const selectedUuid = reducer.currentReducerState.selected_challenge_uuid;
  const selectedChallenge = chArr.find((ch) => ch.uuid === selectedUuid);

  const SolveDialog =
    !selectedChallenge ||
    !authMethods[selectedChallenge.type as KnownAuthMethods]
      ? SolveNotImplemented
      : authMethods[selectedChallenge.type as KnownAuthMethods].solve ??
        SolveNotImplemented;

  return <SolveDialog id={selectedUuid} />;
}
