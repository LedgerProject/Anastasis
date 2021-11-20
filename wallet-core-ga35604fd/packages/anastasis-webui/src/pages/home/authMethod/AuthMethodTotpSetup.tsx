import { encodeCrock, stringToBytes } from "@gnu-taler/taler-util";
import { h, VNode } from "preact";
import { useMemo, useState } from "preact/hooks";
import { AuthMethodSetupProps } from "./index";
import { AnastasisClientFrame } from "../index";
import { TextInput } from "../../../components/fields/TextInput";
import { QR } from "../../../components/QR";
import { base32enc, computeTOTPandCheck } from "./totp";

export function AuthMethodTotpSetup({
  addAuthMethod,
  cancel,
  configured,
}: AuthMethodSetupProps): VNode {
  const [name, setName] = useState("anastasis");
  const [test, setTest] = useState("");
  const digits = 8;
  const secretKey = useMemo(() => {
    const array = new Uint8Array(32);
    return window.crypto.getRandomValues(array);
  }, []);
  const secret32 = base32enc(secretKey);
  const totpURL = `otpauth://totp/${name}?digits=${digits}&secret=${secret32}`;

  const addTotpAuth = (): void =>
    addAuthMethod({
      authentication_method: {
        type: "totp",
        instructions: `Enter ${digits} digits code for "${name}"`,
        challenge: encodeCrock(stringToBytes(totpURL)),
      },
    });

  const testCodeMatches = computeTOTPandCheck(secretKey, 8, parseInt(test, 10));

  const errors = !name
    ? "The TOTP name is missing"
    : !testCodeMatches
    ? "The test code doesnt match"
    : undefined;
  function goNextIfNoErrors(): void {
    if (!errors) addTotpAuth();
  }
  return (
    <AnastasisClientFrame hideNav title="Add TOTP authentication">
      <p>
        For Time-based One-Time Password (TOTP) authentication, you need to set
        a name for the TOTP secret. Then, you must scan the generated QR code
        with your TOTP App to import the TOTP secret into your TOTP App.
      </p>
      <div class="block">
        <TextInput label="TOTP Name" grabFocus bind={[name, setName]} />
      </div>
      <div style={{ height: 300 }}>
        <QR text={totpURL} />
      </div>
      <p>
        After scanning the code with your TOTP App, test it in the input below.
      </p>
      <TextInput
        label="Test code"
        onConfirm={goNextIfNoErrors}
        bind={[test, setTest]}
      />
      {configured.length > 0 && (
        <section class="section">
          <div class="block">Your TOTP numbers:</div>
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
              onClick={addTotpAuth}
            >
              Add
            </button>
          </span>
        </div>
      </div>
    </AnastasisClientFrame>
  );
}
