import { encodeCrock, stringToBytes } from "@gnu-taler/taler-util";
import { h, VNode } from "preact";
import { useState } from "preact/hooks";
import { ImageInput } from "../../../components/fields/ImageInput";
import { AuthMethodSetupProps } from "./index";
import { AnastasisClientFrame } from "../index";

export function AuthMethodVideoSetup({
  cancel,
  addAuthMethod,
  configured,
}: AuthMethodSetupProps): VNode {
  const [image, setImage] = useState("");
  const addVideoAuth = (): void => {
    addAuthMethod({
      authentication_method: {
        type: "video",
        instructions: "Join a video call",
        challenge: encodeCrock(stringToBytes(image)),
      },
    });
  };
  function goNextIfNoErrors(): void {
    addVideoAuth();
  }
  return (
    <AnastasisClientFrame hideNav title="Add video authentication">
      <p>
        For video identification, you need to provide a passport-style
        photograph. When recovering your secret, you will be asked to join a
        video call. During that call, a human will use the photograph to verify
        your identity.
      </p>
      <div style={{ textAlign: "center" }}>
        <ImageInput
          label="Choose photograph"
          grabFocus
          onConfirm={goNextIfNoErrors}
          bind={[image, setImage]}
        />
      </div>
      {configured.length > 0 && (
        <section class="section">
          <div class="block">Your photographs:</div>
          <div class="block">
            {configured.map((c, i) => {
              return (
                <div
                  key={i}
                  class="box"
                  style={{ display: "flex", justifyContent: "space-between" }}
                >
                  <img
                    style={{
                      marginTop: "auto",
                      marginBottom: "auto",
                      width: 100,
                      height: 100,
                      border: "solid 1px black",
                    }}
                    src={c.instructions}
                  />
                  <div style={{ marginTop: "auto", marginBottom: "auto" }}>
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
          <button class="button is-info" onClick={addVideoAuth}>
            Add
          </button>
        </div>
      </div>
    </AnastasisClientFrame>
  );
}
