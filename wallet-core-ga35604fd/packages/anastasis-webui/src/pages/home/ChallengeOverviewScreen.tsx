import { ChallengeFeedback, ChallengeFeedbackStatus } from "anastasis-core";
import { h, VNode } from "preact";
import { useAnastasisContext } from "../../context/anastasis";
import { AnastasisClientFrame } from "./index";
import { authMethods, KnownAuthMethods } from "./authMethod";
import { AsyncButton } from "../../components/AsyncButton";

function OverviewFeedbackDisplay(props: { feedback?: ChallengeFeedback }) {
  const { feedback } = props;
  if (!feedback) {
    return null;
  }
  switch (feedback.state) {
    case ChallengeFeedbackStatus.Message:
      return <div class="block has-text-danger">{feedback.message}</div>;
    case ChallengeFeedbackStatus.Solved:
      return <div />;
    case ChallengeFeedbackStatus.Pending:
    case ChallengeFeedbackStatus.AuthIban:
      return null;
    case ChallengeFeedbackStatus.ServerFailure:
      return <div class="block has-text-danger">Server error.</div>;
    case ChallengeFeedbackStatus.RateLimitExceeded:
      return (
        <div class="block has-text-danger">
          There were to many failed attempts.
        </div>
      );
    case ChallengeFeedbackStatus.Unsupported:
      return (
        <div class="block has-text-danger">
          This client doesn't support solving this type of challenge. Use
          another version or contact the provider.
        </div>
      );
    case ChallengeFeedbackStatus.TruthUnknown:
      return (
        <div class="block has-text-danger">
          Provider doesn't recognize the challenge of the policy. Contact the
          provider for further information.
        </div>
      );
    case ChallengeFeedbackStatus.Redirect:
    default:
      return <div />;
  }
}

export function ChallengeOverviewScreen(): VNode {
  const reducer = useAnastasisContext();

  if (!reducer) {
    return <div>no reducer in context</div>;
  }
  if (
    !reducer.currentReducerState ||
    reducer.currentReducerState.recovery_state === undefined
  ) {
    return <div>invalid state</div>;
  }

  const policies =
    reducer.currentReducerState.recovery_information?.policies ?? [];
  const knownChallengesArray =
    reducer.currentReducerState.recovery_information?.challenges ?? [];
  const challengeFeedback =
    reducer.currentReducerState?.challenge_feedback ?? {};

  const knownChallengesMap: {
    [uuid: string]: {
      type: string;
      instructions: string;
      cost: string;
      feedback: ChallengeFeedback | undefined;
    };
  } = {};
  for (const ch of knownChallengesArray) {
    knownChallengesMap[ch.uuid] = {
      type: ch.type,
      cost: ch.cost,
      instructions: ch.instructions,
      feedback: challengeFeedback[ch.uuid],
    };
  }
  const policiesWithInfo = policies
    .map((row) => {
      let isPolicySolved = true;
      const challenges = row
        .map(({ uuid }) => {
          const info = knownChallengesMap[uuid];
          const isChallengeSolved = info?.feedback?.state === "solved";
          isPolicySolved = isPolicySolved && isChallengeSolved;
          return { info, uuid, isChallengeSolved };
        })
        .filter((ch) => ch.info !== undefined);

      return {
        isPolicySolved,
        challenges,
        corrupted: row.length > challenges.length,
      };
    })
    .filter((p) => !p.corrupted);

  const atLeastThereIsOnePolicySolved =
    policiesWithInfo.find((p) => p.isPolicySolved) !== undefined;

  const errors = !atLeastThereIsOnePolicySolved
    ? "Solve one policy before proceeding"
    : undefined;
  return (
    <AnastasisClientFrame hideNext={errors} title="Recovery: Solve challenges">
      {!policiesWithInfo.length ? (
        <p class="block">
          No policies found, try with another version of the secret
        </p>
      ) : policiesWithInfo.length === 1 ? (
        <p class="block">
          One policy found for this secret. You need to solve all the challenges
          in order to recover your secret.
        </p>
      ) : (
        <p class="block">
          We have found {policiesWithInfo.length} polices. You need to solve all
          the challenges from one policy in order to recover your secret.
        </p>
      )}
      {policiesWithInfo.map((policy, policy_index) => {
        const tableBody = policy.challenges.map(({ info, uuid }) => {
          const isFree = !info.cost || info.cost.endsWith(":0");
          const method = authMethods[info.type as KnownAuthMethods];

          if (!method) {
            return (
              <div
                key={uuid}
                class="block"
                style={{ display: "flex", justifyContent: "space-between" }}
              >
                <div style={{ display: "flex", alignItems: "center" }}>
                  <span>unknown challenge</span>
                </div>
              </div>
            );
          }

          function ChallengeButton({
            id,
            feedback,
          }: {
            id: string;
            feedback?: ChallengeFeedback;
          }): VNode {
            async function selectChallenge(): Promise<void> {
              if (reducer) {
                return reducer.transition("select_challenge", { uuid: id });
              }
            }
            if (!feedback) {
              return (
                <div>
                  <AsyncButton
                    class="button"
                    disabled={
                      atLeastThereIsOnePolicySolved && !policy.isPolicySolved
                    }
                    onClick={selectChallenge}
                  >
                    Solve
                  </AsyncButton>
                </div>
              );
            }
            switch (feedback.state) {
              case ChallengeFeedbackStatus.ServerFailure:
              case ChallengeFeedbackStatus.Unsupported:
              case ChallengeFeedbackStatus.TruthUnknown:
              case ChallengeFeedbackStatus.RateLimitExceeded:
                return <div />;
              case ChallengeFeedbackStatus.AuthIban:
              case ChallengeFeedbackStatus.Payment:
                return (
                  <div>
                    <AsyncButton
                      class="button"
                      disabled={
                        atLeastThereIsOnePolicySolved && !policy.isPolicySolved
                      }
                      onClick={selectChallenge}
                    >
                      Pay
                    </AsyncButton>
                  </div>
                );
              case ChallengeFeedbackStatus.Redirect:
                return (
                  <div>
                    <AsyncButton
                      class="button"
                      disabled={
                        atLeastThereIsOnePolicySolved && !policy.isPolicySolved
                      }
                      onClick={selectChallenge}
                    >
                      Go to {feedback.redirect_url}
                    </AsyncButton>
                  </div>
                );
              case ChallengeFeedbackStatus.Solved:
                return (
                  <div>
                    <div class="tag is-success is-large">Solved</div>
                  </div>
                );
              default:
                return (
                  <div>
                    <AsyncButton
                      class="button"
                      disabled={
                        atLeastThereIsOnePolicySolved && !policy.isPolicySolved
                      }
                      onClick={selectChallenge}
                    >
                      Solve
                    </AsyncButton>
                  </div>
                );
            }
          }
          return (
            <div
              key={uuid}
              class="block"
              style={{ display: "flex", justifyContent: "space-between" }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <div style={{ display: "flex", alignItems: "center" }}>
                  <span class="icon">{method?.icon}</span>
                  <span>{info.instructions}</span>
                </div>
                <OverviewFeedbackDisplay feedback={info.feedback} />
              </div>

              <ChallengeButton id={uuid} feedback={info.feedback} />
            </div>
          );
        });

        const policyName = policy.challenges
          .map((x) => x.info.type)
          .join(" + ");

        const opa = !atLeastThereIsOnePolicySolved
          ? undefined
          : policy.isPolicySolved
          ? undefined
          : "0.6";

        return (
          <div
            key={policy_index}
            class="box"
            style={{
              opacity: opa,
            }}
          >
            <h3 class="subtitle">
              Policy #{policy_index + 1}: {policyName}
            </h3>
            {policy.challenges.length === 0 && (
              <p>This policy doesn't have challenges.</p>
            )}
            {policy.challenges.length === 1 && (
              <p>This policy just have one challenge.</p>
            )}
            {policy.challenges.length > 1 && (
              <p>This policy have {policy.challenges.length} challenges.</p>
            )}
            {tableBody}
          </div>
        );
      })}
    </AnastasisClientFrame>
  );
}
