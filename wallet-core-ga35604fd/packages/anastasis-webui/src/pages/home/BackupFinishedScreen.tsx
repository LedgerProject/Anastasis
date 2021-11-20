import { AuthenticationProviderStatusOk } from "anastasis-core";
import { format } from "date-fns";
import { h, VNode } from "preact";
import { useAnastasisContext } from "../../context/anastasis";
import { AnastasisClientFrame } from "./index";

export function BackupFinishedScreen(): VNode {
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
  const details = reducer.currentReducerState.success_details;
  const providers = reducer.currentReducerState.authentication_providers ?? {}

  return (
    <AnastasisClientFrame hideNav title="Backup success!">
      <p>Your backup is complete.</p>

      {details && (
        <div class="block">
          <p>The backup is stored by the following providers:</p>
          {Object.keys(details).map((url, i) => {
            const sd = details[url];
            const p = providers[url] as AuthenticationProviderStatusOk
            return (
              <div key={i} class="box">
                <a href={url} target="_blank" rel="noreferrer">{p.business_name}</a>
                <p>
                  version {sd.policy_version}
                  {sd.policy_expiration.t_ms !== "never"
                    ? ` expires at: ${format(
                      new Date(sd.policy_expiration.t_ms),
                      "dd-MM-yyyy",
                    )}`
                    : " without expiration date"}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </AnastasisClientFrame>
  );
}
