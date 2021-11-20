import { h, VNode } from "preact";
import { useLayoutEffect, useRef, useState } from "preact/hooks";

export interface TextInputProps {
  label: string;
  grabFocus?: boolean;
  error?: string;
  placeholder?: string;
  tooltip?: string;
  onConfirm?: () => void;
  bind: [string, (x: string) => void];
}

export function PhoneNumberInput(props: TextInputProps): VNode {
  const inputRef = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    if (props.grabFocus) {
      inputRef.current?.focus();
    }
  }, [props.grabFocus]);
  const value = props.bind[0];
  const [dirty, setDirty] = useState(false);
  const showError = dirty && props.error;
  return (
    <div class="field">
      <label class="label">
        {props.label}
        {props.tooltip && (
          <span class="icon has-tooltip-right" data-tooltip={props.tooltip}>
            <i class="mdi mdi-information" />
          </span>
        )}
      </label>
      <div class="control has-icons-right">
        <input
          value={value}
          type="tel"
          placeholder={props.placeholder}
          class={showError ? "input is-danger" : "input"}
          onKeyPress={(e) => {
            if (e.key === 'Enter' && props.onConfirm) {
              props.onConfirm()
            }
          }}
          onInput={(e) => {
            setDirty(true);
            props.bind[1]((e.target as HTMLInputElement).value);
          }}
          ref={inputRef}
          style={{ display: "block" }}
        />
      </div>
      {showError && <p class="help is-danger">{props.error}</p>}
    </div>
  );
}
