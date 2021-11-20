import { AuthMethod, ReducerStateBackup } from "anastasis-core";
import { ComponentChildren, Fragment, h, VNode } from "preact";
import { useState } from "preact/hooks";
import { useAnastasisContext } from "../../context/anastasis";
import { AddingProviderScreen } from "./AddingProviderScreen";
import {
  authMethods,
  AuthMethodSetupProps,
  AuthMethodWithRemove,
  isKnownAuthMethods,
  KnownAuthMethods,
} from "./authMethod";
import { ConfirmModal } from "./ConfirmModal";
import { AnastasisClientFrame } from "./index";

const getKeys = Object.keys as <T extends object>(obj: T) => Array<keyof T>;

export function AuthenticationEditorScreen(): VNode {
  const [noProvidersAck, setNoProvidersAck] = useState(false);
  const [selectedMethod, setSelectedMethod] = useState<
    KnownAuthMethods | undefined
  >(undefined);
  const [tooFewAuths, setTooFewAuths] = useState(false);
  const [manageProvider, setManageProvider] = useState<string | undefined>(
    undefined,
  );

  // const [addingProvider, setAddingProvider] = useState<string | undefined>(undefined)
  const reducer = useAnastasisContext();
  if (!reducer) {
    return <div>no reducer in context</div>;
  }
  if (
    !reducer.currentReducerState ||
    reducer.currentReducerState.backup_state === undefined
  ) {
    return <div>invalid state</div>;
  }
  const configuredAuthMethods: AuthMethod[] =
    reducer.currentReducerState.authentication_methods ?? [];

  function removeByIndex(index: number): void {
    if (reducer)
      reducer.transition("delete_authentication", {
        authentication_method: index,
      });
  }

  const camByType: { [s: string]: AuthMethodWithRemove[] } = {};
  for (let index = 0; index < configuredAuthMethods.length; index++) {
    const cam = {
      ...configuredAuthMethods[index],
      remove: () => removeByIndex(index),
    };
    const prevValue = camByType[cam.type] || [];
    prevValue.push(cam);
    camByType[cam.type] = prevValue;
  }

  const providers = reducer.currentReducerState.authentication_providers!;

  const authAvailableSet = new Set<string>();
  for (const provKey of Object.keys(providers)) {
    const p = providers[provKey];
    if ("http_status" in p && !("error_code" in p) && p.methods) {
      for (const meth of p.methods) {
        authAvailableSet.add(meth.type);
      }
    }
  }

  if (manageProvider !== undefined) {
    return (
      <AddingProviderScreen
        onCancel={() => setManageProvider(undefined)}
        providerType={
          isKnownAuthMethods(manageProvider) ? manageProvider : undefined
        }
      />
    );
  }

  if (selectedMethod) {
    const cancel = (): void => setSelectedMethod(undefined);
    const addMethod = (args: any): void => {
      reducer.transition("add_authentication", args);
      setSelectedMethod(undefined);
    };

    const AuthSetup =
      authMethods[selectedMethod].setup ?? AuthMethodNotImplemented;
    return (
      <Fragment>
        <AuthSetup
          cancel={cancel}
          configured={camByType[selectedMethod] || []}
          addAuthMethod={addMethod}
          method={selectedMethod}
        />

        {!authAvailableSet.has(selectedMethod) && (
          <ConfirmModal
            active
            onCancel={cancel}
            description="No providers founds"
            label="Add a provider manually"
            onConfirm={async () => {
              setManageProvider(selectedMethod);
            }}
          >
            <p>
              We have found no Anastasis providers that support this
              authentication method. You can add a provider manually. To add a
              provider you must know the provider URL (e.g.
              https://provider.com)
            </p>
            <p>
              <a>Learn more about Anastasis providers</a>
            </p>
          </ConfirmModal>
        )}
      </Fragment>
    );
  }

  function MethodButton(props: { method: KnownAuthMethods }): VNode {
    if (authMethods[props.method].skip) return <div />;

    return (
      <div class="block">
        <button
          style={{ justifyContent: "space-between" }}
          class="button is-fullwidth"
          onClick={() => {
            setSelectedMethod(props.method);
          }}
        >
          <div style={{ display: "flex" }}>
            <span class="icon ">{authMethods[props.method].icon}</span>
            {authAvailableSet.has(props.method) ? (
              <span>Add a {authMethods[props.method].label} challenge</span>
            ) : (
              <span>Add a {authMethods[props.method].label} provider</span>
            )}
          </div>
          {!authAvailableSet.has(props.method) && (
            <span class="icon has-text-danger">
              <i class="mdi mdi-exclamation-thick" />
            </span>
          )}
          {camByType[props.method] && (
            <span class="tag is-info">{camByType[props.method].length}</span>
          )}
        </button>
      </div>
    );
  }
  const errors = configuredAuthMethods.length < 2 ? "There is not enough authentication methods." : undefined;
  const handleNext = async () => {
    const st = reducer.currentReducerState as ReducerStateBackup;
    if ((st.authentication_methods ?? []).length <= 2) {
      setTooFewAuths(true);
    } else {
      await reducer.transition("next", {});
    }
  };
  return (
    <AnastasisClientFrame
      title="Backup: Configure Authentication Methods"
      hideNext={errors}
      onNext={handleNext}
    >
      <div class="columns">
        <div class="column">
          <div>
            {getKeys(authMethods).map((method) => (
              <MethodButton key={method} method={method} />
            ))}
          </div>
          {tooFewAuths ? (
            <ConfirmModal
              active={tooFewAuths}
              onCancel={() => setTooFewAuths(false)}
              description="Too few auth methods configured"
              label="Proceed anyway"
              onConfirm={() => reducer.transition("next", {})}
            >
              You have selected fewer than 3 authentication methods. We
              recommend that you add at least 3.
            </ConfirmModal>
          ) : null}
          {authAvailableSet.size === 0 && (
            <ConfirmModal
              active={!noProvidersAck}
              onCancel={() => setNoProvidersAck(true)}
              description="No providers founds"
              label="Add a provider manually"
              onConfirm={async () => {
                setManageProvider("");
              }}
            >
              <p>
                We have found no Anastasis providers for your chosen country /
                currency. You can add a providers manually. To add a provider
                you must know the provider URL (e.g. https://provider.com)
              </p>
              <p>
                <a>Learn more about Anastasis providers</a>
              </p>
            </ConfirmModal>
          )}
        </div>
        <div class="column">
          <p class="block">
            When recovering your secret data, you will be asked to verify your
            identity via the methods you configure here. The list of
            authentication method is defined by the backup provider list.
          </p>
          <p class="block">
            <button
              class="button is-info"
              onClick={() => setManageProvider("")}
            >
              Manage backup providers
            </button>
          </p>
          {authAvailableSet.size > 0 && (
            <p class="block">
              We couldn't find provider for some of the authentication methods.
            </p>
          )}
        </div>
      </div>
    </AnastasisClientFrame>
  );
}

function AuthMethodNotImplemented(props: AuthMethodSetupProps): VNode {
  return (
    <AnastasisClientFrame hideNav title={`Add ${props.method} authentication`}>
      <p>This auth method is not implemented yet, please choose another one.</p>
      <button onClick={() => props.cancel()}>Cancel</button>
    </AnastasisClientFrame>
  );
}

