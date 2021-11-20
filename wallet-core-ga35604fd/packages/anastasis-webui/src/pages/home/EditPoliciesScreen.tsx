/* eslint-disable @typescript-eslint/camelcase */
import { AuthMethod, Policy } from "anastasis-core";
import { h, VNode } from "preact";
import { useState } from "preact/hooks";
import { useAnastasisContext } from "../../context/anastasis";
import { authMethods, KnownAuthMethods } from "./authMethod";
import { AnastasisClientFrame } from "./index";

export interface ProviderInfo {
  url: string;
  cost: string;
  isFree: boolean;
}

export type ProviderInfoByType = {
  [type in KnownAuthMethods]?: ProviderInfo[];
};

interface Props {
  index: number;
  cancel: () => void;
  confirm: (changes: MethodProvider[]) => void;
}

export interface MethodProvider {
  authentication_method: number;
  provider: string;
}

export function EditPoliciesScreen({
  index: policy_index,
  cancel,
  confirm,
}: Props): VNode {
  const [changedProvider, setChangedProvider] = useState<Array<string>>([]);

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

  const selectableProviders: ProviderInfoByType = {};
  const allProviders = Object.entries(
    reducer.currentReducerState.authentication_providers || {},
  );
  for (let index = 0; index < allProviders.length; index++) {
    const [url, status] = allProviders[index];
    if ("methods" in status) {
      status.methods.map((m) => {
        const type: KnownAuthMethods = m.type as KnownAuthMethods;
        const values = selectableProviders[type] || [];
        const isFree = !m.usage_fee || m.usage_fee.endsWith(":0");
        values.push({ url, cost: m.usage_fee, isFree });
        selectableProviders[type] = values;
      });
    }
  }

  const allAuthMethods =
    reducer.currentReducerState.authentication_methods ?? [];
  const policies = reducer.currentReducerState.policies ?? [];
  const policy = policies[policy_index];

  for (
    let method_index = 0;
    method_index < allAuthMethods.length;
    method_index++
  ) {
    policy?.methods.find((m) => m.authentication_method === method_index)
      ?.provider;
  }

  function sendChanges(): void {
    const newMethods: MethodProvider[] = [];
    allAuthMethods.forEach((method, index) => {
      const oldValue = policy?.methods.find(
        (m) => m.authentication_method === index,
      );
      if (changedProvider[index] === undefined && oldValue !== undefined) {
        newMethods.push(oldValue);
      }
      if (
        changedProvider[index] !== undefined &&
        changedProvider[index] !== ""
      ) {
        newMethods.push({
          authentication_method: index,
          provider: changedProvider[index],
        });
      }
    });
    confirm(newMethods);
  }

  return (
    <AnastasisClientFrame
      hideNav
      title={!policy ? "Backup: New Policy" : "Backup: Edit Policy"}
    >
      <section class="section">
        {!policy ? (
          <p>Creating a new policy #{policy_index}</p>
        ) : (
          <p>Editing policy #{policy_index}</p>
        )}
        {allAuthMethods.map((method, index) => {
          //take the url from the updated change or from the policy
          const providerURL =
            changedProvider[index] === undefined
              ? policy?.methods.find((m) => m.authentication_method === index)
                  ?.provider
              : changedProvider[index];

          const type: KnownAuthMethods = method.type as KnownAuthMethods;
          function changeProviderTo(url: string): void {
            const copy = [...changedProvider];
            copy[index] = url;
            setChangedProvider(copy);
          }
          return (
            <div
              key={index}
              class="block"
              style={{ display: "flex", alignItems: "center" }}
            >
              <span class="icon">{authMethods[type]?.icon}</span>
              <span>{method.instructions}</span>
              <span>
                <span class="select ">
                  <select
                    onChange={(e) => changeProviderTo(e.currentTarget.value)}
                    value={providerURL ?? ""}
                  >
                    <option key="none" value="">
                      {" "}
                      &lt;&lt; off &gt;&gt;{" "}
                    </option>
                    {selectableProviders[type]?.map((prov) => (
                      <option key={prov.url} value={prov.url}>
                        {prov.url}
                      </option>
                    ))}
                  </select>
                </span>
              </span>
            </div>
          );
        })}
        <div
          style={{
            marginTop: "2em",
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <button class="button" onClick={cancel}>
            Cancel
          </button>
          <span class="buttons">
            <button class="button" onClick={() => setChangedProvider([])}>
              Reset
            </button>
            <button class="button is-info" onClick={sendChanges}>
              Confirm
            </button>
          </span>
        </div>
      </section>
    </AnastasisClientFrame>
  );
}
