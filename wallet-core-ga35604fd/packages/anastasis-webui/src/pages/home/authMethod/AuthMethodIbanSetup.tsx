import {
  canonicalJson,
  encodeCrock,
  stringToBytes,
} from "@gnu-taler/taler-util";
import { h, VNode } from "preact";
import { useState } from "preact/hooks";
import { AuthMethodSetupProps } from ".";
import { TextInput } from "../../../components/fields/TextInput";
import { AnastasisClientFrame } from "../index";

export function AuthMethodIbanSetup({
  addAuthMethod,
  cancel,
  configured,
}: AuthMethodSetupProps): VNode {
  const [name, setName] = useState("");
  const [account, setAccount] = useState("");
  const addIbanAuth = (): void =>
    addAuthMethod({
      authentication_method: {
        type: "iban",
        instructions: `Wire transfer from ${account} with holder ${name}`,
        challenge: encodeCrock(
          stringToBytes(
            canonicalJson({
              name,
              account,
            }),
          ),
        ),
      },
    });
  const errors = !name
    ? "Add an account name"
    : !account
    ? "Add an account IBAN number"
    : undefined;
  function goNextIfNoErrors(): void {
    if (!errors) addIbanAuth();
  }
  return (
    <AnastasisClientFrame hideNav title="Add bank transfer authentication">
      <p>
        For bank transfer authentication, you need to provide a bank account
        (account holder name and IBAN). When recovering your secret, you will be
        asked to pay the recovery fee via bank transfer from the account you
        provided here.
      </p>
      <div>
        <TextInput
          label="Bank account holder name"
          grabFocus
          placeholder="John Smith"
          onConfirm={goNextIfNoErrors}
          bind={[name, setName]}
        />
        <TextInput
          label="IBAN"
          placeholder="DE91100000000123456789"
          onConfirm={goNextIfNoErrors}
          bind={[account, setAccount]}
        />
      </div>
      {configured.length > 0 && (
        <section class="section">
          <div class="block">Your bank accounts:</div>
          <div class="block">
            {configured.map((c, i) => {
              return (
                <div
                  key={i}
                  class="box"
                  style={{ display: "flex", justifyContent: "space-between" }}
                >
                  <p style={{ marginBottom: "auto", marginTop: "auto" }}>
                    {c.instructions}
                  </p>
                  <div>
                    <button class="button is-danger" onClick={c.remove}>
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}
      <div>
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
          <span data-tooltip={errors}>
            <button
              class="button is-info"
              disabled={errors !== undefined}
              onClick={addIbanAuth}
            >
              Add
            </button>
          </span>
        </div>
      </div>
    </AnastasisClientFrame>
  );
}
