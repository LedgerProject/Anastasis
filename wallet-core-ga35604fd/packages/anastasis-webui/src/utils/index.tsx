/* eslint-disable @typescript-eslint/camelcase */
import { BackupStates, RecoveryStates, ReducerState } from "anastasis-core";
import { FunctionalComponent, h, VNode } from "preact";
import { AnastasisProvider } from "../context/anastasis";

export function createExample<Props>(
  Component: FunctionalComponent<Props>,
  currentReducerState?: ReducerState,
  props?: Partial<Props>,
): { (args: Props): VNode } {
  const r = (args: Props): VNode => {
    return (
      <AnastasisProvider
        value={{
          currentReducerState,
          currentError: undefined,
          back: async () => {
            null;
          },
          dismissError: async () => {
            null;
          },
          reset: () => {
            null;
          },
          runTransaction: async () => {
            null;
          },
          startBackup: () => {
            null;
          },
          startRecover: () => {
            null;
          },
          transition: async () => {
            null;
          },
        }}
      >
        <Component {...args} />
      </AnastasisProvider>
    );
  };
  r.args = props;
  return r;
}

const base = {
  continents: [
    {
      name: "Europe",
    },
    {
      name: "India",
    },
    {
      name: "Asia",
    },
    {
      name: "North America",
    },
    {
      name: "Testcontinent",
    },
  ],
  countries: [
    {
      code: "xx",
      name: "Testland",
      continent: "Testcontinent",
      continent_i18n: {
        de_DE: "Testkontinent",
      },
      name_i18n: {
        de_DE: "Testlandt",
        de_CH: "Testlandi",
        fr_FR: "Testpais",
        en_UK: "Testland",
      },
      currency: "TESTKUDOS",
      call_code: "+00",
    },
    {
      code: "xy",
      name: "Demoland",
      continent: "Testcontinent",
      continent_i18n: {
        de_DE: "Testkontinent",
      },
      name_i18n: {
        de_DE: "Demolandt",
        de_CH: "Demolandi",
        fr_FR: "Demopais",
        en_UK: "Demoland",
      },
      currency: "KUDOS",
      call_code: "+01",
    },
  ],
  authentication_providers: {
    "http://localhost:8086/": {
      http_status: 200,
      annual_fee: "COL:0",
      business_name: "Anastasis Local",
      currency: "COL",
      liability_limit: "COL:10",
      methods: [
        {
          type: "question",
          usage_fee: "COL:0",
        },
        {
          type: "sms",
          usage_fee: "COL:0",
        },
        {
          type: "email",
          usage_fee: "COL:0",
        },
      ],
      salt: "WBMDD76BR1E90YQ5AHBMKPH7GW",
      storage_limit_in_megabytes: 16,
      truth_upload_fee: "COL:0",
    },
    "https://kudos.demo.anastasis.lu/": {
      http_status: 200,
      annual_fee: "COL:0",
      business_name: "Anastasis Kudo",
      currency: "COL",
      liability_limit: "COL:10",
      methods: [
        {
          type: "question",
          usage_fee: "COL:0",
        },
        {
          type: "email",
          usage_fee: "COL:0",
        },
      ],
      salt: "WBMDD76BR1E90YQ5AHBMKPH7GW",
      storage_limit_in_megabytes: 16,
      truth_upload_fee: "COL:0",
    },
    "https://anastasis.demo.taler.net/": {
      http_status: 200,
      annual_fee: "COL:0",
      business_name: "Anastasis Demo",
      currency: "COL",
      liability_limit: "COL:10",
      methods: [
        {
          type: "question",
          usage_fee: "COL:0",
        },
        {
          type: "sms",
          usage_fee: "COL:0",
        },
        {
          type: "totp",
          usage_fee: "COL:0",
        },
      ],
      salt: "WBMDD76BR1E90YQ5AHBMKPH7GW",
      storage_limit_in_megabytes: 16,
      truth_upload_fee: "COL:0",
    },

    "http://localhost:8087/": {
      code: 8414,
      hint: "request to provider failed",
    },
    "http://localhost:8088/": {
      code: 8414,
      hint: "request to provider failed",
    },
    "http://localhost:8089/": {
      code: 8414,
      hint: "request to provider failed",
    },
  },
} as Partial<ReducerState>;

export const reducerStatesExample = {
  initial: undefined,
  recoverySelectCountry: {
    ...base,
    recovery_state: RecoveryStates.CountrySelecting,
  } as ReducerState,
  recoverySelectContinent: {
    ...base,
    recovery_state: RecoveryStates.ContinentSelecting,
  } as ReducerState,
  secretSelection: {
    ...base,
    recovery_state: RecoveryStates.SecretSelecting,
  } as ReducerState,
  recoveryFinished: {
    ...base,
    recovery_state: RecoveryStates.RecoveryFinished,
  } as ReducerState,
  challengeSelecting: {
    ...base,
    recovery_state: RecoveryStates.ChallengeSelecting,
  } as ReducerState,
  challengeSolving: {
    ...base,
    recovery_state: RecoveryStates.ChallengeSolving,
  } as ReducerState,
  challengePaying: {
    ...base,
    recovery_state: RecoveryStates.ChallengePaying,
  } as ReducerState,
  recoveryAttributeEditing: {
    ...base,
    recovery_state: RecoveryStates.UserAttributesCollecting,
  } as ReducerState,
  backupSelectCountry: {
    ...base,
    backup_state: BackupStates.CountrySelecting,
  } as ReducerState,
  backupSelectContinent: {
    ...base,
    backup_state: BackupStates.ContinentSelecting,
  } as ReducerState,
  secretEdition: {
    ...base,
    backup_state: BackupStates.SecretEditing,
  } as ReducerState,
  policyReview: {
    ...base,
    backup_state: BackupStates.PoliciesReviewing,
  } as ReducerState,
  policyPay: {
    ...base,
    backup_state: BackupStates.PoliciesPaying,
  } as ReducerState,
  backupFinished: {
    ...base,
    backup_state: BackupStates.BackupFinished,
  } as ReducerState,
  authEditing: {
    ...base,
    backup_state: BackupStates.AuthenticationsEditing,
  } as ReducerState,
  backupAttributeEditing: {
    ...base,
    backup_state: BackupStates.UserAttributesCollecting,
  } as ReducerState,
  truthsPaying: {
    ...base,
    backup_state: BackupStates.TruthsPaying,
  } as ReducerState,
};
