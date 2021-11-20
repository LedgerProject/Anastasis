import { encodeCrock, stringToBytes } from "@gnu-taler/taler-util";
import { Fragment, h, VNode } from "preact";
import { useState } from "preact/hooks";
import { AuthMethodSetupProps } from "./index";
import { AnastasisClientFrame } from "../index";
import { TextInput } from "../../../components/fields/TextInput";

export function AuthMethodQuestionSetup({
  cancel,
  addAuthMethod,
  configured,
}: AuthMethodSetupProps): VNode {
  const [questionText, setQuestionText] = useState("");
  const [answerText, setAnswerText] = useState("");
  const addQuestionAuth = (): void =>
    addAuthMethod({
      authentication_method: {
        type: "question",
        instructions: questionText,
        challenge: encodeCrock(stringToBytes(answerText)),
      },
    });

  const errors = !questionText
    ? "Add your security question"
    : !answerText
    ? "Add the answer to your question"
    : undefined;
  function goNextIfNoErrors(): void {
    if (!errors) addQuestionAuth();
  }
  return (
    <AnastasisClientFrame hideNav title="Add Security Question">
      <div>
        <p>
          For security question authentication, you need to provide a question
          and its answer. When recovering your secret, you will be shown the
          question and you will need to type the answer exactly as you typed it
          here.
        </p>
        <div>
          <TextInput
            label="Security question"
            grabFocus
            onConfirm={goNextIfNoErrors}
            placeholder="Your question"
            bind={[questionText, setQuestionText]}
          />
        </div>
        <div>
          <TextInput
            label="Answer"
            onConfirm={goNextIfNoErrors}
            placeholder="Your answer"
            bind={[answerText, setAnswerText]}
          />
        </div>

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
              onClick={addQuestionAuth}
            >
              Add
            </button>
          </span>
        </div>

        {configured.length > 0 && (
          <section class="section">
            <div class="block">Your security questions:</div>
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
      </div>
    </AnastasisClientFrame>
  );
}
