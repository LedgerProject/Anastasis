import { encodeCrock, stringToBytes } from "@gnu-taler/taler-util";
import { Fragment, h, VNode } from "preact";
import { useLayoutEffect, useRef, useState } from "preact/hooks";
import { AuthMethodSetupProps } from ".";
import { PhoneNumberInput } from "../../../components/fields/NumberInput";
import { AnastasisClientFrame } from "../index";

export function AuthMethodSmsSetup({
  addAuthMethod,
  cancel,
  configured,
}: AuthMethodSetupProps): VNode {
  const [mobileNumber, setMobileNumber] = useState("");
  const addSmsAuth = (): void => {
    addAuthMethod({
      authentication_method: {
        type: "sms",
        instructions: `SMS to ${mobileNumber}`,
        challenge: encodeCrock(stringToBytes(mobileNumber)),
      },
    });
  };
  const inputRef = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    inputRef.current?.focus();
  }, []);
  const errors = !mobileNumber ? "Add a mobile number" : undefined;
  function goNextIfNoErrors(): void {
    if (!errors) addSmsAuth();
  }
  return (
    <AnastasisClientFrame hideNav title="Add SMS authentication">
      <div>
        <p>
          For SMS authentication, you need to provide a mobile number. When
          recovering your secret, you will be asked to enter the code you
          receive via SMS.
        </p>
        <div class="container">
          <PhoneNumberInput
            label="Mobile number"
            placeholder="Your mobile number"
            onConfirm={goNextIfNoErrors}
            grabFocus
            bind={[mobileNumber, setMobileNumber]}
          />
        </div>
        {configured.length > 0 && (
          <section class="section">
            <div class="block">Your mobile numbers:</div>
            <div class="block">
              {configured.map((c, i) => {
                return (
                  <div
                    key={i}
                    class="box"
                    style={{ display: "flex", justifyContent: "space-between" }}
                  >
                    <p style={{ marginTop: "auto", marginBottom: "auto" }}>
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
              onClick={addSmsAuth}
            >
              Add
            </button>
          </span>
        </div>
      </div>
    </AnastasisClientFrame>
  );
}
