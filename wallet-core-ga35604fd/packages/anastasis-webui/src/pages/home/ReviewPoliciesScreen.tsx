import { AuthenticationProviderStatusOk } from "anastasis-core";
import { h, VNode } from "preact";
import { useState } from "preact/hooks";
import { AsyncButton } from "../../components/AsyncButton";
import { useAnastasisContext } from "../../context/anastasis";
import { authMethods, KnownAuthMethods } from "./authMethod";
import { ConfirmModal } from "./ConfirmModal";
import { EditPoliciesScreen } from "./EditPoliciesScreen";
import { AnastasisClientFrame } from "./index";

export function ReviewPoliciesScreen(): VNode {
  const [editingPolicy, setEditingPolicy] = useState<number | undefined>();
  const [confirmReset, setConfirmReset] = useState(false);
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

  const configuredAuthMethods =
    reducer.currentReducerState.authentication_methods ?? [];
  const policies = reducer.currentReducerState.policies ?? [];

  const providers = reducer.currentReducerState.authentication_providers ?? {};

  if (editingPolicy !== undefined) {
    return (
      <EditPoliciesScreen
        index={editingPolicy}
        cancel={() => setEditingPolicy(undefined)}
        confirm={async (newMethods) => {
          await reducer.transition("update_policy", {
            policy_index: editingPolicy,
            policy: newMethods,
          });
          setEditingPolicy(undefined);
        }}
      />
    );
  }
  async function resetPolicies(): Promise<void> {
    if (!reducer) return Promise.resolve();
    return reducer.runTransaction(async (tx) => {
      await tx.transition("back", {});
      await tx.transition("next", {});
      setConfirmReset(false);
    });
  }

  const errors = policies.length < 1 ? "Need more policies" : undefined;
  return (
    <AnastasisClientFrame
      hideNext={errors}
      title="Backup: Review Recovery Policies"
    >
      {policies.length > 0 && (
        <p class="block">
          Based on your configured authentication method you have created, some
          policies have been configured. In order to recover your secret you
          have to solve all the challenges of at least one policy.
        </p>
      )}
      {policies.length < 1 && (
        <p class="block">
          No policies had been created. Go back and add more authentication
          methods.
        </p>
      )}
      <div class="block">
        <AsyncButton class="button" onClick={async () => setConfirmReset(true)}>
          Reset policies
        </AsyncButton>
        <button
          class="button is-success"
          style={{ marginLeft: 10 }}
          onClick={() => setEditingPolicy(policies.length)}
        >
          Add new policy
        </button>
      </div>
      {policies.map((p, policy_index) => {
        const methods = p.methods
          .map(
            (x) =>
              configuredAuthMethods[x.authentication_method] && {
                ...configuredAuthMethods[x.authentication_method],
                provider: x.provider,
              },
          )
          .filter((x) => !!x);

        const policyName = methods.map((x) => x.type).join(" + ");

        if (p.methods.length > methods.length) {
          //there is at least one authentication method that is corrupted
          return null;
        }

        return (
          <div
            key={policy_index}
            class="box"
            style={{ display: "flex", justifyContent: "space-between" }}
          >
            <div>
              <h3 class="subtitle">
                Policy #{policy_index + 1}: {policyName}
              </h3>
              {!methods.length && <p>No auth method found</p>}
              {methods.map((m, i) => {
                const p = providers[
                  m.provider
                ] as AuthenticationProviderStatusOk;
                return (
                  <p
                    key={i}
                    class="block"
                    style={{ display: "flex", alignItems: "center" }}
                  >
                    <span class="icon">
                      {authMethods[m.type as KnownAuthMethods]?.icon}
                    </span>
                    <span>
                      {m.instructions} recovery provided by{" "}
                      <a href={m.provider} target="_blank" rel="noreferrer">
                        {p.business_name}
                      </a>
                    </span>
                  </p>
                );
              })}
            </div>
            <div
              style={{
                marginTop: "auto",
                marginBottom: "auto",
                display: "flex",
                justifyContent: "space-between",
                flexDirection: "column",
              }}
            >
              <button
                class="button is-info block"
                onClick={() => setEditingPolicy(policy_index)}
              >
                Edit
              </button>
              <button
                class="button is-danger block"
                onClick={() =>
                  reducer.transition("delete_policy", { policy_index })
                }
              >
                Delete
              </button>
            </div>
          </div>
        );
      })}
      {confirmReset && (
        <ConfirmModal
          active
          onCancel={() => setConfirmReset(false)}
          description="Do you want to reset the policies to default state?"
          label="Reset policies"
          cancelLabel="Cancel"
          onConfirm={resetPolicies}
        >
          <p>
            All policies will be recalculated based on the authentication
            providers configured and any change that you did will be lost
          </p>
        </ConfirmModal>
      )}
    </AnastasisClientFrame>
  );
}
