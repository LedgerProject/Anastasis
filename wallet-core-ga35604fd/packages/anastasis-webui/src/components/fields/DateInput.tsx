import { format, subYears } from "date-fns";
import { h, VNode } from "preact";
import { useLayoutEffect, useRef, useState } from "preact/hooks";
import { DatePicker } from "../picker/DatePicker";

export interface DateInputProps {
  label: string;
  grabFocus?: boolean;
  tooltip?: string;
  error?: string;
  years?: Array<number>;
  onConfirm?: () => void;
  bind: [string, (x: string) => void];
}

export function DateInput(props: DateInputProps): VNode {
  const inputRef = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    if (props.grabFocus) {
      inputRef.current?.focus();
    }
  }, [props.grabFocus]);
  const [opened, setOpened] = useState(false);

  const value = props.bind[0] || "";
  const [dirty, setDirty] = useState(false);
  const showError = dirty && props.error;

  const calendar = subYears(new Date(), 30);

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
      <div class="control">
        <div class="field has-addons">
          <p class="control">
            <input
              type="text"
              class={showError ? "input is-danger" : "input"}
              value={value}
              onKeyPress={(e) => {
                if (e.key === 'Enter' && props.onConfirm) {
                  props.onConfirm()
                }
              }}
                  onInput={(e) => {
                const text = e.currentTarget.value;
                setDirty(true);
                props.bind[1](text);
              }}
              ref={inputRef}
            />
          </p>
          <p class="control">
            <a
              class="button"
              onClick={() => {
                setOpened(true);
              }}
            >
              <span class="icon">
                <i class="mdi mdi-calendar" />
              </span>
            </a>
          </p>
        </div>
      </div>
      <p class="help">Using the format yyyy-mm-dd</p>
      {showError && <p class="help is-danger">{props.error}</p>}
      <DatePicker
        opened={opened}
        initialDate={calendar}
        years={props.years}
        closeFunction={() => setOpened(false)}
        dateReceiver={(d) => {
          setDirty(true);
          const v = format(d, "yyyy-MM-dd");
          props.bind[1](v);
        }}
      />
    </div>
  );
}
