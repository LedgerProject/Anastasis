import { UserAttributeSpec, validators } from "anastasis-core";
import { isAfter, parse } from "date-fns";
import { h, VNode } from "preact";
import { useState } from "preact/hooks";
import { DateInput } from "../../components/fields/DateInput";
import { PhoneNumberInput } from "../../components/fields/NumberInput";
import { TextInput } from "../../components/fields/TextInput";
import { useAnastasisContext } from "../../context/anastasis";
import { ConfirmModal } from "./ConfirmModal";
import { AnastasisClientFrame, withProcessLabel } from "./index";

export function AttributeEntryScreen(): VNode {
  const reducer = useAnastasisContext();
  const state = reducer?.currentReducerState;
  const currentIdentityAttributes =
    state && "identity_attributes" in state
      ? state.identity_attributes || {}
      : {};
  const [attrs, setAttrs] = useState<Record<string, string>>(
    currentIdentityAttributes,
  );
  const isBackup = state && state.backup_state;
  const [askUserIfSure, setAskUserIfSure] = useState(false);

  if (!reducer) {
    return <div>no reducer in context</div>;
  }
  if (
    !reducer.currentReducerState ||
    !("required_attributes" in reducer.currentReducerState)
  ) {
    return <div>invalid state</div>;
  }
  const reqAttr = reducer.currentReducerState.required_attributes || [];
  let hasErrors = false;

  const fieldList: VNode[] = reqAttr.map((spec, i: number) => {
    const value = attrs[spec.name];
    const error = checkIfValid(value, spec);
    hasErrors = hasErrors || error !== undefined;
    return (
      <AttributeEntryField
        key={i}
        isFirst={i == 0}
        setValue={(v: string) => setAttrs({ ...attrs, [spec.name]: v })}
        spec={spec}
        errorMessage={error}
        onConfirm={() => {
          if (!hasErrors) {
            setAskUserIfSure(true)
          }
        }}
        value={value}
      />
    );
  });

  const doConfirm = async () => {
    await reducer.transition("enter_user_attributes", {
      identity_attributes: attrs,
    });
  };

  return (
    <AnastasisClientFrame
      title={withProcessLabel(reducer, "Who are you?")}
      hideNext={hasErrors ? "Complete the form." : undefined}
      onNext={async () => isBackup ? setAskUserIfSure(true) : doConfirm() }
    >
      {askUserIfSure ? (
        <ConfirmModal
          active
          onCancel={() => setAskUserIfSure(false)}
          description="The values in the form must be correct"
          label="I am sure"
          cancelLabel="Wait, I want to check"
          onConfirm={() => doConfirm().then(() => setAskUserIfSure(false) )}
        >
          You personal information is used to define the location where your 
          secret will be safely stored. If you forget what you have entered or 
          if there is a misspell you will be unable to recover your secret.
        </ConfirmModal>
      ) : null}

      <div class="columns" style={{ maxWidth: "unset" }}>
        <div class="column">{fieldList}</div>
        <div class="column">
          <p>This personal information will help to locate your secret.</p>
          <h1 class="title">This stays private</h1>
          <p>The information you have entered here:</p>
          <ul>
            <li>
              <span class="icon is-right">
                <i class="mdi mdi-circle-small" />
              </span>
              Will be hashed, and therefore unreadable
            </li>
            <li>
              <span class="icon is-right">
                <i class="mdi mdi-circle-small" />
              </span>
              The non-hashed version is not shared
            </li>
          </ul>
        </div>
      </div>
    </AnastasisClientFrame>
  );
}

interface AttributeEntryFieldProps {
  isFirst: boolean;
  value: string;
  setValue: (newValue: string) => void;
  spec: UserAttributeSpec;
  errorMessage: string | undefined;
  onConfirm: () => void;
}
const possibleBirthdayYear: Array<number> = [];
for (let i = 0; i < 100; i++) {
  possibleBirthdayYear.push(2020 - i);
}
function AttributeEntryField(props: AttributeEntryFieldProps): VNode {
  return (
    <div>
      {props.spec.type === "date" &&
        <DateInput
          grabFocus={props.isFirst}
          label={props.spec.label}
          years={possibleBirthdayYear}
          onConfirm={props.onConfirm}
          error={props.errorMessage}
          bind={[props.value, props.setValue]}
        />
      }
      {props.spec.type === 'number' &&
        <PhoneNumberInput
          grabFocus={props.isFirst}
          label={props.spec.label}
          onConfirm={props.onConfirm}
          error={props.errorMessage}
          bind={[props.value, props.setValue]}
        />
      }
      {props.spec.type === "string" && (
        <TextInput
          grabFocus={props.isFirst}
          label={props.spec.label}
          onConfirm={props.onConfirm}
          error={props.errorMessage}
          bind={[props.value, props.setValue]}
        />
      )}
      <div class="block">
        This stays private
        <span class="icon is-right">
          <i class="mdi mdi-eye-off" />
        </span>
      </div>
    </div>
  );
}
const YEAR_REGEX = /^[0-9]+-[0-9]+-[0-9]+$/;

function checkIfValid(
  value: string,
  spec: UserAttributeSpec,
): string | undefined {
  const pattern = spec["validation-regex"];
  if (pattern) {
    const re = new RegExp(pattern);
    if (!re.test(value)) return "The value is invalid";
  }
  const logic = spec["validation-logic"];
  if (logic) {
    const func = (validators as any)[logic];
    if (func && typeof func === "function" && !func(value))
      return "Please check the value";
  }
  const optional = spec.optional;
  if (!optional && !value) {
    return "This value is required";
  }
  if ("date" === spec.type) {
    if (!YEAR_REGEX.test(value)) {
      return "The date doesn't follow the format";
    }

    try {
      const v = parse(value, "yyyy-MM-dd", new Date());
      if (Number.isNaN(v.getTime())) {
        return "Some numeric values seems out of range for a date";
      }
      if ("birthdate" === spec.name && isAfter(v, new Date())) {
        return "A birthdate cannot be in the future";
      }
    } catch (e) {
      return "Could not parse the date";
    }
  }
  return undefined;
}
