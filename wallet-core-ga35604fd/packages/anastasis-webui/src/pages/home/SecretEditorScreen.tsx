import { encodeCrock, stringToBytes } from "@gnu-taler/taler-util";
import { h, VNode } from "preact";
import { useState } from "preact/hooks";
import { useAnastasisContext } from "../../context/anastasis";
import { AnastasisClientFrame } from "./index";
import { TextInput } from "../../components/fields/TextInput";
import { FileInput, FileTypeContent } from "../../components/fields/FileInput";

export function SecretEditorScreen(): VNode {
  const reducer = useAnastasisContext();
  const [secretValue, setSecretValue] = useState("");
  const [secretFile, _setSecretFile] = useState<FileTypeContent | undefined>(
    undefined,
  );
  function setSecretFile(v: FileTypeContent | undefined): void {
    setSecretValue(""); // reset secret value when uploading a file
    _setSecretFile(v);
  }

  const currentSecretName =
    reducer?.currentReducerState &&
    "secret_name" in reducer.currentReducerState &&
    reducer.currentReducerState.secret_name;

  const [secretName, setSecretName] = useState(currentSecretName || "");

  if (!reducer) {
    return <div>no reducer in context</div>;
  }
  if (
    !reducer.currentReducerState ||
    reducer.currentReducerState.backup_state === undefined
  ) {
    return <div>invalid state</div>;
  }

  const secretNext = async (): Promise<void> => {
    const secret = secretFile
      ? {
          value: encodeCrock(stringToBytes(secretValue)),
          filename: secretFile.name,
          mime: secretFile.type,
        }
      : {
          value: encodeCrock(stringToBytes(secretValue)),
          mime: "text/plain",
        };
    return reducer.runTransaction(async (tx) => {
      await tx.transition("enter_secret_name", {
        name: secretName,
      });
      await tx.transition("enter_secret", {
        secret,
        expiration: {
          t_ms: new Date().getTime() + 1000 * 60 * 60 * 24 * 365 * 5,
        },
      });
      await tx.transition("next", {});
    });
  };
  const errors = !secretName
    ? "Add a secret name"
    : !secretValue && !secretFile
    ? "Add a secret value or a choose a file to upload"
    : undefined;
  function goNextIfNoErrors(): void {
    if (!errors) secretNext();
  }
  return (
    <AnastasisClientFrame
      hideNext={errors}
      title="Backup: Provide secret to backup"
      onNext={() => secretNext()}
    >
      <div class="block">
        <TextInput
          label="Secret name:"
          tooltip="The secret name allows you to identify your secret when restoring it. It is a label that you can choose freely."
          grabFocus
          onConfirm={goNextIfNoErrors}
          bind={[secretName, setSecretName]}
        />
      </div>
      <div class="block">
        <TextInput
          disabled={!!secretFile}
          onConfirm={goNextIfNoErrors}
          label="Enter the secret as text:"
          bind={[secretValue, setSecretValue]}
        />
      </div>
      <div class="block">
        Or upload a secret file
        <FileInput label="Choose file" onChange={setSecretFile} />
        {secretFile && (
          <div>
            Uploading secret file <b>{secretFile.name}</b>{" "}
            <a onClick={() => setSecretFile(undefined)}>cancel</a>
          </div>
        )}
      </div>
    </AnastasisClientFrame>
  );
}
