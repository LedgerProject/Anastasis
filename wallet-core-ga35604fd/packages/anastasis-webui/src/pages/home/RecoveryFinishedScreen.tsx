import { bytesToString, decodeCrock, encodeCrock } from "@gnu-taler/taler-util";
import { h, VNode } from "preact";
import { useEffect, useState } from "preact/hooks";
import { stringToBytes } from "qrcode-generator";
import { QR } from "../../components/QR";
import { useAnastasisContext } from "../../context/anastasis";
import { AnastasisClientFrame } from "./index";

export function RecoveryFinishedScreen(): VNode {
  const reducer = useAnastasisContext();
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    setTimeout(() => {
      setCopied(false);
    }, 1000);
  }, [copied]);

  if (!reducer) {
    return <div>no reducer in context</div>;
  }
  if (
    !reducer.currentReducerState ||
    reducer.currentReducerState.recovery_state === undefined
  ) {
    return <div>invalid state</div>;
  }
  const secretName = reducer.currentReducerState.recovery_document?.secret_name;
  const encodedSecret = reducer.currentReducerState.core_secret;
  if (!encodedSecret) {
    return (
      <AnastasisClientFrame title="Recovery Problem" hideNav>
        <p>Secret not found</p>
        <div
          style={{
            marginTop: "2em",
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <button class="button" onClick={() => reducer.back()}>
            Back
          </button>
        </div>
      </AnastasisClientFrame>
    );
  }
  const secret = bytesToString(decodeCrock(encodedSecret.value));
  const contentURI = `data:${encodedSecret.mime},${secret}`;
  // const fileName = encodedSecret['filename']
  // data:plain/text;base64,asdasd
  return (
    <AnastasisClientFrame title="Recovery Success" hideNav>
      <h2 class="subtitle">Your secret was recovered</h2>
      {secretName && (
        <p class="block">
          <b>Secret name:</b> {secretName}
        </p>
      )}
      <div class="block buttons" disabled={copied}>
        <button
          class="button"
          onClick={() => {
            navigator.clipboard.writeText(secret);
            setCopied(true);
          }}
        >
          {!copied ? "Copy" : "Copied"}
        </button>
        <a class="button is-info" download="secret.txt" href={contentURI}>
          <div class="icon is-small ">
            <i class="mdi mdi-download" />
          </div>
          <span>Save as</span>
        </a>
      </div>
      <div class="block">
        <QR text={secret} />
      </div>
    </AnastasisClientFrame>
  );
}
