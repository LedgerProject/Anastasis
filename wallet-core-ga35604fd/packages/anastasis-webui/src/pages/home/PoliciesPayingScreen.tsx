import { h, VNode } from "preact";
import { useAnastasisContext } from "../../context/anastasis";
import { AnastasisClientFrame } from "./index";

export function PoliciesPayingScreen(): VNode {
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
  const payments = reducer.currentReducerState.policy_payment_requests ?? [];

  return (
    <AnastasisClientFrame hideNav title="Backup: Recovery Document Payments">
      <p>
        Some of the providers require a payment to store the encrypted recovery
        document.
      </p>
      <ul>
        {payments.map((x, i) => {
          return (
            <li key={i}>
              {x.provider}: {x.payto}
            </li>
          );
        })}
      </ul>
      <button onClick={() => reducer.transition("pay", {})}>
        Check payment status now
      </button>
    </AnastasisClientFrame>
  );
}
