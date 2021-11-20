import { BackupStates, RecoveryStates } from "anastasis-core";
import {
  ComponentChildren,
  Fragment,
  FunctionalComponent,
  h,
  VNode,
} from "preact";
import { useErrorBoundary } from "preact/hooks";
import { AsyncButton } from "../../components/AsyncButton";
import { Menu } from "../../components/menu";
import { Notifications } from "../../components/Notifications";
import {
  AnastasisProvider,
  useAnastasisContext,
} from "../../context/anastasis";
import {
  AnastasisReducerApi,
  useAnastasisReducer,
} from "../../hooks/use-anastasis-reducer";
import { AttributeEntryScreen } from "./AttributeEntryScreen";
import { AuthenticationEditorScreen } from "./AuthenticationEditorScreen";
import { BackupFinishedScreen } from "./BackupFinishedScreen";
import { ChallengeOverviewScreen } from "./ChallengeOverviewScreen";
import { ChallengePayingScreen } from "./ChallengePayingScreen";
import { ContinentSelectionScreen } from "./ContinentSelectionScreen";
import { PoliciesPayingScreen } from "./PoliciesPayingScreen";
import { RecoveryFinishedScreen } from "./RecoveryFinishedScreen";
import { ReviewPoliciesScreen } from "./ReviewPoliciesScreen";
import { SecretEditorScreen } from "./SecretEditorScreen";
import { SecretSelectionScreen } from "./SecretSelectionScreen";
import { SolveScreen } from "./SolveScreen";
import { StartScreen } from "./StartScreen";
import { TruthsPayingScreen } from "./TruthsPayingScreen";

function isBackup(reducer: AnastasisReducerApi): boolean {
  return !!reducer.currentReducerState?.backup_state;
}

export function withProcessLabel(
  reducer: AnastasisReducerApi,
  text: string,
): string {
  if (isBackup(reducer)) {
    return `Backup: ${text}`;
  }
  return `Recovery: ${text}`;
}

interface AnastasisClientFrameProps {
  onNext?(): Promise<void>;
  /**
   * Override for the "back" functionality.
   */
  onBack?(): Promise<void>;
  title: string;
  children: ComponentChildren;
  /**
   * Should back/next buttons be provided?
   */
  hideNav?: boolean;
  /**
   * Hide only the "next" button.
   */
  hideNext?: string;
}

function ErrorBoundary(props: {
  reducer: AnastasisReducerApi;
  children: ComponentChildren;
}): VNode {
  const [error, resetError] = useErrorBoundary((error) =>
    console.log("got error", error),
  );
  if (error) {
    return (
      <div>
        <button
          onClick={() => {
            props.reducer.reset();
            resetError();
          }}
        >
          Reset
        </button>
        <p>
          Error: <pre>{error.stack}</pre>
        </p>
      </div>
    );
  }
  return <div>{props.children}</div>;
}

export function AnastasisClientFrame(props: AnastasisClientFrameProps): VNode {
  const reducer = useAnastasisContext();
  if (!reducer) {
    return <p>Fatal: Reducer must be in context.</p>;
  }
  const next = async (): Promise<void> => {
    if (props.onNext) {
      await props.onNext();
    } else {
      await reducer.transition("next", {});
    }
  };
  const handleKeyPress = (
    e: h.JSX.TargetedKeyboardEvent<HTMLDivElement>,
  ): void => {
    console.log("Got key press", e.key);
    // FIXME: By default, "next" action should be executed here
  };
  return (
    <Fragment>
      <Menu title="Anastasis" />
      <div class="home" onKeyPress={(e) => handleKeyPress(e)}>
        <h1 class="title">{props.title}</h1>
        <ErrorBanner />
        <section class="section is-main-section">
          {props.children}
          {!props.hideNav ? (
            <div
              style={{
                marginTop: "2em",
                display: "flex",
                justifyContent: "space-between",
              }}
            >
              <button
                class="button"
                onClick={() => (props.onBack ?? reducer.back)()}
              >
                Back
              </button>
              <AsyncButton
                class="button is-info"
                data-tooltip={props.hideNext}
                onClick={next}
                disabled={props.hideNext !== undefined}
              >
                Next
              </AsyncButton>
            </div>
          ) : null}
        </section>
      </div>
    </Fragment>
  );
}

const AnastasisClient: FunctionalComponent = () => {
  const reducer = useAnastasisReducer();
  return (
    <AnastasisProvider value={reducer}>
      <ErrorBoundary reducer={reducer}>
        <AnastasisClientImpl />
      </ErrorBoundary>
    </AnastasisProvider>
  );
};

function AnastasisClientImpl(): VNode {
  const reducer = useAnastasisContext();
  if (!reducer) {
    return <p>Fatal: Reducer must be in context.</p>;
  }
  const state = reducer.currentReducerState;
  if (!state) {
    return <StartScreen />;
  }
  console.log("state", reducer.currentReducerState);

  if (
    state.backup_state === BackupStates.ContinentSelecting ||
    state.recovery_state === RecoveryStates.ContinentSelecting ||
    state.backup_state === BackupStates.CountrySelecting ||
    state.recovery_state === RecoveryStates.CountrySelecting
  ) {
    return <ContinentSelectionScreen />;
  }
  if (
    state.backup_state === BackupStates.UserAttributesCollecting ||
    state.recovery_state === RecoveryStates.UserAttributesCollecting
  ) {
    return <AttributeEntryScreen />;
  }
  if (state.backup_state === BackupStates.AuthenticationsEditing) {
    return <AuthenticationEditorScreen />;
  }
  if (state.backup_state === BackupStates.PoliciesReviewing) {
    return <ReviewPoliciesScreen />;
  }
  if (state.backup_state === BackupStates.SecretEditing) {
    return <SecretEditorScreen />;
  }

  if (state.backup_state === BackupStates.BackupFinished) {
    return <BackupFinishedScreen />;
  }

  if (state.backup_state === BackupStates.TruthsPaying) {
    return <TruthsPayingScreen />;
  }

  if (state.backup_state === BackupStates.PoliciesPaying) {
    return <PoliciesPayingScreen />;
  }

  if (state.recovery_state === RecoveryStates.SecretSelecting) {
    return <SecretSelectionScreen />;
  }

  if (state.recovery_state === RecoveryStates.ChallengeSelecting) {
    return <ChallengeOverviewScreen />;
  }

  if (state.recovery_state === RecoveryStates.ChallengeSolving) {
    return <SolveScreen />;
  }

  if (state.recovery_state === RecoveryStates.RecoveryFinished) {
    return <RecoveryFinishedScreen />;
  }
  if (state.recovery_state === RecoveryStates.ChallengePaying) {
    return <ChallengePayingScreen />;
  }
  console.log("unknown state", reducer.currentReducerState);
  return (
    <AnastasisClientFrame hideNav title="Bug">
      <p>Bug: Unknown state.</p>
      <div class="buttons is-right">
        <button class="button" onClick={() => reducer.reset()}>
          Reset
        </button>
      </div>
    </AnastasisClientFrame>
  );
}

/**
 * Show a dismissible error banner if there is a current error.
 */
function ErrorBanner(): VNode | null {
  const reducer = useAnastasisContext();
  if (!reducer || !reducer.currentError) return null;
  return (
    <Notifications
      removeNotification={reducer.dismissError}
      notifications={[
        {
          type: "ERROR",
          message: `Error code: ${reducer.currentError.code}`,
          description: reducer.currentError.hint,
        },
      ]}
    />
  );
}

export default AnastasisClient;
