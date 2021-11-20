import {
  AmountJson,
  AmountLike,
  Amounts,
  AmountString,
  buildSigPS,
  bytesToString,
  Codec,
  codecForAny,
  decodeCrock,
  Duration,
  eddsaSign,
  encodeCrock,
  getRandomBytes,
  hash,
  HttpStatusCode,
  j2s,
  Logger,
  parsePayUri,
  stringToBytes,
  TalerErrorCode,
  TalerSignaturePurpose,
  Timestamp,
} from "@gnu-taler/taler-util";
import { anastasisData } from "./anastasis-data.js";
import {
  EscrowConfigurationResponse,
  IbanExternalAuthResponse,
  TruthUploadRequest,
} from "./provider-types.js";
import {
  ActionArgsAddAuthentication,
  ActionArgsDeleteAuthentication,
  ActionArgsDeletePolicy,
  ActionArgsEnterSecret,
  ActionArgsEnterSecretName,
  ActionArgsEnterUserAttributes,
  ActionArgsAddPolicy,
  ActionArgsSelectContinent,
  ActionArgsSelectCountry,
  ActionArgsSelectChallenge,
  ActionArgsSolveChallengeRequest,
  ActionArgsUpdateExpiration,
  AuthenticationProviderStatus,
  AuthenticationProviderStatusOk,
  AuthMethod,
  BackupStates,
  codecForActionArgsEnterUserAttributes,
  codecForActionArgsAddPolicy,
  codecForActionArgsSelectChallenge,
  codecForActionArgSelectContinent,
  codecForActionArgSelectCountry,
  codecForActionArgsUpdateExpiration,
  ContinentInfo,
  CountryInfo,
  RecoveryInformation,
  RecoveryInternalData,
  RecoveryStates,
  ReducerState,
  ReducerStateBackup,
  ReducerStateError,
  ReducerStateRecovery,
  SuccessDetails,
  codecForActionArgsChangeVersion,
  ActionArgsChangeVersion,
  TruthMetaData,
  ActionArgsUpdatePolicy,
  ActionArgsAddProvider,
  ActionArgsDeleteProvider,
} from "./reducer-types.js";
import fetchPonyfill from "fetch-ponyfill";
import {
  accountKeypairDerive,
  asOpaque,
  coreSecretEncrypt,
  encryptKeyshare,
  encryptRecoveryDocument,
  encryptTruth,
  OpaqueData,
  PolicyKey,
  policyKeyDerive,
  PolicySalt,
  TruthSalt,
  secureAnswerHash,
  UserIdentifier,
  userIdentifierDerive,
  typedArrayConcat,
  decryptRecoveryDocument,
  decryptKeyShare,
  KeyShare,
  coreSecretRecover,
  pinAnswerHash,
} from "./crypto.js";
import { unzlibSync, zlibSync } from "fflate";
import {
  ChallengeType,
  EscrowMethod,
  RecoveryDocument,
} from "./recovery-document-types.js";
import { ProviderInfo, suggestPolicies } from "./policy-suggestion.js";
import {
  ChallengeFeedback,
  ChallengeFeedbackStatus,
} from "./challenge-feedback-types.js";

const { fetch } = fetchPonyfill({});

export * from "./reducer-types.js";
export * as validators from "./validators.js";
export * from "./challenge-feedback-types.js";

const logger = new Logger("anastasis-core:index.ts");

function getContinents(
  opts: { requireProvider?: boolean } = {},
): ContinentInfo[] {
  const currenciesWithProvider = new Set<string>();
  anastasisData.providersList.anastasis_provider.forEach((x) => {
    currenciesWithProvider.add(x.currency);
  });
  const continentSet = new Set<string>();
  const continents: ContinentInfo[] = [];
  for (const country of anastasisData.countriesList.countries) {
    if (continentSet.has(country.continent)) {
      continue;
    }
    if (opts.requireProvider && !currenciesWithProvider.has(country.currency)) {
      // Country's currency doesn't have any providers => skip
      continue;
    }
    continentSet.add(country.continent);
    continents.push({
      ...{ name_i18n: country.continent_i18n },
      name: country.continent,
    });
  }
  return continents;
}

interface ErrorDetails {
  code: TalerErrorCode;
  message?: string;
  hint?: string;
}

export class ReducerError extends Error {
  constructor(public errorJson: ErrorDetails) {
    super(
      errorJson.message ??
        errorJson.hint ??
        `${TalerErrorCode[errorJson.code]}`,
    );

    // Set the prototype explicitly.
    Object.setPrototypeOf(this, ReducerError.prototype);
  }
}

/**
 * Get countries for a continent, abort with ReducerError
 * exception when continent doesn't exist.
 */
function getCountries(
  continent: string,
  opts: { requireProvider?: boolean } = {},
): CountryInfo[] {
  const currenciesWithProvider = new Set<string>();
  anastasisData.providersList.anastasis_provider.forEach((x) => {
    currenciesWithProvider.add(x.currency);
  });
  const countries = anastasisData.countriesList.countries.filter(
    (x) =>
      x.continent === continent &&
      (!opts.requireProvider || currenciesWithProvider.has(x.currency)),
  );
  if (countries.length <= 0) {
    throw new ReducerError({
      code: TalerErrorCode.ANASTASIS_REDUCER_INPUT_INVALID,
      hint: "continent not found",
    });
  }
  return countries;
}

export async function getBackupStartState(): Promise<ReducerStateBackup> {
  return {
    backup_state: BackupStates.ContinentSelecting,
    continents: getContinents({
      requireProvider: true,
    }),
  };
}

export async function getRecoveryStartState(): Promise<ReducerStateRecovery> {
  return {
    recovery_state: RecoveryStates.ContinentSelecting,
    continents: getContinents({
      requireProvider: true,
    }),
  };
}

async function selectCountry(
  selectedContinent: string,
  args: ActionArgsSelectCountry,
): Promise<Partial<ReducerStateBackup> & Partial<ReducerStateRecovery>> {
  const countryCode = args.country_code;
  const currencies = args.currencies;
  const country = anastasisData.countriesList.countries.find(
    (x) => x.code === countryCode,
  );
  if (!country) {
    throw new ReducerError({
      code: TalerErrorCode.ANASTASIS_REDUCER_ACTION_INVALID,
      hint: "invalid country selected",
    });
  }

  if (country.continent !== selectedContinent) {
    throw new ReducerError({
      code: TalerErrorCode.ANASTASIS_REDUCER_ACTION_INVALID,
      hint: "selected country is not in selected continent",
    });
  }

  const providers: { [x: string]: {} } = {};
  for (const prov of anastasisData.providersList.anastasis_provider) {
    if (currencies.includes(prov.currency)) {
      providers[prov.url] = {};
    }
  }

  const ra = (anastasisData.countryDetails as any)[countryCode]
    .required_attributes;

  return {
    selected_country: countryCode,
    currencies,
    required_attributes: ra,
    authentication_providers: providers,
  };
}

async function backupSelectCountry(
  state: ReducerStateBackup,
  args: ActionArgsSelectCountry,
): Promise<ReducerStateError | ReducerStateBackup> {
  return {
    ...state,
    ...(await selectCountry(state.selected_continent!, args)),
    backup_state: BackupStates.UserAttributesCollecting,
  };
}

async function recoverySelectCountry(
  state: ReducerStateRecovery,
  args: ActionArgsSelectCountry,
): Promise<ReducerStateError | ReducerStateRecovery> {
  return {
    ...state,
    recovery_state: RecoveryStates.UserAttributesCollecting,
    ...(await selectCountry(state.selected_continent!, args)),
  };
}

async function getProviderInfo(
  providerBaseUrl: string,
): Promise<AuthenticationProviderStatus> {
  // FIXME: Use a reasonable timeout here.
  let resp: Response;
  try {
    resp = await fetch(new URL("config", providerBaseUrl).href);
  } catch (e) {
    return {
      code: TalerErrorCode.ANASTASIS_REDUCER_NETWORK_FAILED,
      hint: "request to provider failed",
    };
  }
  if (resp.status !== 200) {
    return {
      code: TalerErrorCode.ANASTASIS_REDUCER_NETWORK_FAILED,
      hint: "unexpected status",
      http_status: resp.status,
    };
  }
  try {
    const jsonResp: EscrowConfigurationResponse = await resp.json();
    return {
      http_status: 200,
      annual_fee: jsonResp.annual_fee,
      business_name: jsonResp.business_name,
      currency: jsonResp.currency,
      liability_limit: jsonResp.liability_limit,
      methods: jsonResp.methods.map((x) => ({
        type: x.type,
        usage_fee: x.cost,
      })),
      salt: jsonResp.server_salt,
      storage_limit_in_megabytes: jsonResp.storage_limit_in_megabytes,
      truth_upload_fee: jsonResp.truth_upload_fee,
    } as AuthenticationProviderStatusOk;
  } catch (e) {
    return {
      code: TalerErrorCode.ANASTASIS_REDUCER_NETWORK_FAILED,
      hint: "provider did not return JSON",
    };
  }
}

async function backupEnterUserAttributes(
  state: ReducerStateBackup,
  args: ActionArgsEnterUserAttributes,
): Promise<ReducerStateBackup> {
  const attributes = args.identity_attributes;
  const providerUrls = Object.keys(state.authentication_providers ?? {});
  const newProviders = state.authentication_providers ?? {};
  for (const url of providerUrls) {
    newProviders[url] = await getProviderInfo(url);
  }
  const newState = {
    ...state,
    backup_state: BackupStates.AuthenticationsEditing,
    authentication_providers: newProviders,
    identity_attributes: attributes,
  };
  return newState;
}

async function getTruthValue(
  authMethod: AuthMethod,
  truthUuid: string,
  questionSalt: TruthSalt,
): Promise<OpaqueData> {
  switch (authMethod.type) {
    case "question": {
      return asOpaque(
        await secureAnswerHash(
          bytesToString(decodeCrock(authMethod.challenge)),
          truthUuid,
          questionSalt,
        ),
      );
    }
    case "sms":
    case "email":
    case "totp":
    case "iban":
      return authMethod.challenge;
    default:
      throw Error("unknown auth type");
  }
}

/**
 * Compress the recovery document and add a size header.
 */
async function compressRecoveryDoc(rd: any): Promise<Uint8Array> {
  const docBytes = stringToBytes(JSON.stringify(rd));
  const sizeHeaderBuf = new ArrayBuffer(4);
  const dvbuf = new DataView(sizeHeaderBuf);
  dvbuf.setUint32(0, docBytes.length, false);
  const zippedDoc = zlibSync(docBytes);
  return typedArrayConcat([new Uint8Array(sizeHeaderBuf), zippedDoc]);
}

async function uncompressRecoveryDoc(zippedRd: Uint8Array): Promise<any> {
  const header = zippedRd.slice(0, 4);
  const data = zippedRd.slice(4);
  const res = unzlibSync(data);
  return JSON.parse(bytesToString(res));
}

/**
 * Prepare the recovery document and truth metadata based
 * on the selected policies.
 */
async function prepareRecoveryData(
  state: ReducerStateBackup,
): Promise<ReducerStateBackup> {
  const policies = state.policies!;
  const secretName = state.secret_name!;
  const coreSecret: OpaqueData = encodeCrock(
    stringToBytes(JSON.stringify(state.core_secret!)),
  );

  // Truth key is `${methodIndex}/${providerUrl}`
  const truthMetadataMap: Record<string, TruthMetaData> = {};

  const policyKeys: PolicyKey[] = [];
  const policySalts: PolicySalt[] = [];
  // truth UUIDs for every policy.
  const policyUuids: string[][] = [];

  for (let policyIndex = 0; policyIndex < policies.length; policyIndex++) {
    const pol = policies[policyIndex];
    const policySalt = encodeCrock(getRandomBytes(64));
    const keyShares: string[] = [];
    const methUuids: string[] = [];
    for (let methIndex = 0; methIndex < pol.methods.length; methIndex++) {
      const meth = pol.methods[methIndex];
      const truthReference = `${meth.authentication_method}:${meth.provider}`;
      let tm = truthMetadataMap[truthReference];
      if (!tm) {
        tm = {
          key_share: encodeCrock(getRandomBytes(32)),
          nonce: encodeCrock(getRandomBytes(24)),
          truth_salt: encodeCrock(getRandomBytes(16)),
          truth_key: encodeCrock(getRandomBytes(64)),
          uuid: encodeCrock(getRandomBytes(32)),
          pol_method_index: methIndex,
          policy_index: policyIndex,
        };
        truthMetadataMap[truthReference] = tm;
      }
      keyShares.push(tm.key_share);
      methUuids.push(tm.uuid);
    }
    const policyKey = await policyKeyDerive(keyShares, policySalt);
    policyUuids.push(methUuids);
    policyKeys.push(policyKey);
    policySalts.push(policySalt);
  }

  const csr = await coreSecretEncrypt(policyKeys, coreSecret);

  const escrowMethods: EscrowMethod[] = [];

  for (const truthKey of Object.keys(truthMetadataMap)) {
    const tm = truthMetadataMap[truthKey];
    const pol = state.policies![tm.policy_index];
    const meth = pol.methods[tm.pol_method_index];
    const authMethod =
      state.authentication_methods![meth.authentication_method];
    const provider = state.authentication_providers![
      meth.provider
    ] as AuthenticationProviderStatusOk;
    escrowMethods.push({
      escrow_type: authMethod.type as any,
      instructions: authMethod.instructions,
      provider_salt: provider.salt,
      truth_salt: tm.truth_salt,
      truth_key: tm.truth_key,
      url: meth.provider,
      uuid: tm.uuid,
    });
  }

  const rd: RecoveryDocument = {
    secret_name: secretName,
    encrypted_core_secret: csr.encCoreSecret,
    escrow_methods: escrowMethods,
    policies: policies.map((x, i) => {
      return {
        master_key: csr.encMasterKeys[i],
        uuids: policyUuids[i],
        salt: policySalts[i],
      };
    }),
  };

  return {
    ...state,
    recovery_data: {
      recovery_document: rd,
      truth_metadata: truthMetadataMap,
    },
  };
}

async function uploadSecret(
  state: ReducerStateBackup,
): Promise<ReducerStateBackup | ReducerStateError> {
  if (!state.recovery_data) {
    state = await prepareRecoveryData(state);
  }

  const recoveryData = state.recovery_data;
  if (!recoveryData) {
    throw Error("invariant failed");
  }

  const truthMetadataMap = recoveryData.truth_metadata;
  const rd = recoveryData.recovery_document;

  const truthPayUris: string[] = [];
  const truthPaySecrets: Record<string, string> = {};

  const userIdCache: Record<string, UserIdentifier> = {};
  const getUserIdCaching = async (providerUrl: string) => {
    let userId = userIdCache[providerUrl];
    if (!userId) {
      const provider = state.authentication_providers![
        providerUrl
      ] as AuthenticationProviderStatusOk;
      userId = userIdCache[providerUrl] = await userIdentifierDerive(
        state.identity_attributes!,
        provider.salt,
      );
    }
    return userId;
  };
  for (const truthKey of Object.keys(truthMetadataMap)) {
    const tm = truthMetadataMap[truthKey];
    const pol = state.policies![tm.policy_index];
    const meth = pol.methods[tm.pol_method_index];
    const authMethod =
      state.authentication_methods![meth.authentication_method];
    const truthValue = await getTruthValue(authMethod, tm.uuid, tm.truth_salt);
    const encryptedTruth = await encryptTruth(
      tm.nonce,
      tm.truth_key,
      truthValue,
    );
    logger.info(`uploading truth to ${meth.provider}`);
    const userId = await getUserIdCaching(meth.provider);
    const encryptedKeyShare = await encryptKeyshare(
      tm.key_share,
      userId,
      authMethod.type === "question"
        ? bytesToString(decodeCrock(authMethod.challenge))
        : undefined,
    );
    const tur: TruthUploadRequest = {
      encrypted_truth: encryptedTruth,
      key_share_data: encryptedKeyShare,
      storage_duration_years: 5 /* FIXME */,
      type: authMethod.type,
      truth_mime: authMethod.mime_type,
    };
    const reqUrl = new URL(`truth/${tm.uuid}`, meth.provider);
    const paySecret = (state.truth_upload_payment_secrets ?? {})[meth.provider];
    if (paySecret) {
      // FIXME: Get this from the params
      reqUrl.searchParams.set("timeout_ms", "500");
    }
    const resp = await fetch(reqUrl.href, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(paySecret
          ? {
              "Anastasis-Payment-Identifier": paySecret,
            }
          : {}),
      },
      body: JSON.stringify(tur),
    });

    if (resp.status === HttpStatusCode.NoContent) {
      continue;
    }
    if (resp.status === HttpStatusCode.PaymentRequired) {
      const talerPayUri = resp.headers.get("Taler");
      if (!talerPayUri) {
        return {
          code: TalerErrorCode.ANASTASIS_REDUCER_BACKEND_FAILURE,
          hint: `payment requested, but no taler://pay URI given`,
        };
      }
      truthPayUris.push(talerPayUri);
      const parsedUri = parsePayUri(talerPayUri);
      if (!parsedUri) {
        return {
          code: TalerErrorCode.ANASTASIS_REDUCER_BACKEND_FAILURE,
          hint: `payment requested, but no taler://pay URI given`,
        };
      }
      truthPaySecrets[meth.provider] = parsedUri.orderId;
      continue;
    }
    return {
      code: TalerErrorCode.ANASTASIS_REDUCER_NETWORK_FAILED,
      hint: `could not upload truth (HTTP status ${resp.status})`,
    };
  }

  if (truthPayUris.length > 0) {
    return {
      ...state,
      backup_state: BackupStates.TruthsPaying,
      truth_upload_payment_secrets: truthPaySecrets,
      payments: truthPayUris,
    };
  }

  const successDetails: SuccessDetails = {};

  const policyPayUris: string[] = [];
  const policyPayUriMap: Record<string, string> = {};
  //const policyPaySecrets: Record<string, string> = {};

  for (const prov of state.policy_providers!) {
    const userId = await getUserIdCaching(prov.provider_url);
    const acctKeypair = accountKeypairDerive(userId);
    const zippedDoc = await compressRecoveryDoc(rd);
    const encRecoveryDoc = await encryptRecoveryDocument(
      userId,
      encodeCrock(zippedDoc),
    );
    const bodyHash = hash(decodeCrock(encRecoveryDoc));
    const sigPS = buildSigPS(TalerSignaturePurpose.ANASTASIS_POLICY_UPLOAD)
      .put(bodyHash)
      .build();
    const sig = eddsaSign(sigPS, decodeCrock(acctKeypair.priv));
    const talerPayUri = state.policy_payment_requests?.find(
      (x) => x.provider === prov.provider_url,
    )?.payto;
    let paySecret: string | undefined;
    if (talerPayUri) {
      paySecret = parsePayUri(talerPayUri)!.orderId;
    }
    const reqUrl = new URL(`policy/${acctKeypair.pub}`, prov.provider_url);
    if (paySecret) {
      // FIXME: Get this from the params
      reqUrl.searchParams.set("timeout_ms", "500");
    }
    logger.info(`uploading policy to ${prov.provider_url}`);
    const resp = await fetch(reqUrl.href, {
      method: "POST",
      headers: {
        "Anastasis-Policy-Signature": encodeCrock(sig),
        "If-None-Match": encodeCrock(bodyHash),
        ...(paySecret
          ? {
              "Anastasis-Payment-Identifier": paySecret,
            }
          : {}),
      },
      body: decodeCrock(encRecoveryDoc),
    });
    logger.info(`got response for policy upload (http status ${resp.status})`);
    if (resp.status === HttpStatusCode.NoContent) {
      let policyVersion = 0;
      let policyExpiration: Timestamp = { t_ms: 0 };
      try {
        policyVersion = Number(resp.headers.get("Anastasis-Version") ?? "0");
      } catch (e) {}
      try {
        policyExpiration = {
          t_ms:
            1000 *
            Number(resp.headers.get("Anastasis-Policy-Expiration") ?? "0"),
        };
      } catch (e) {}
      successDetails[prov.provider_url] = {
        policy_version: policyVersion,
        policy_expiration: policyExpiration,
      };
      continue;
    }
    if (resp.status === HttpStatusCode.PaymentRequired) {
      const talerPayUri = resp.headers.get("Taler");
      if (!talerPayUri) {
        return {
          code: TalerErrorCode.ANASTASIS_REDUCER_BACKEND_FAILURE,
          hint: `payment requested, but no taler://pay URI given`,
        };
      }
      policyPayUris.push(talerPayUri);
      const parsedUri = parsePayUri(talerPayUri);
      if (!parsedUri) {
        return {
          code: TalerErrorCode.ANASTASIS_REDUCER_BACKEND_FAILURE,
          hint: `payment requested, but no taler://pay URI given`,
        };
      }
      policyPayUriMap[prov.provider_url] = talerPayUri;
      continue;
    }
    return {
      code: TalerErrorCode.ANASTASIS_REDUCER_NETWORK_FAILED,
      hint: `could not upload policy (http status ${resp.status})`,
    };
  }

  if (policyPayUris.length > 0) {
    return {
      ...state,
      backup_state: BackupStates.PoliciesPaying,
      payments: policyPayUris,
      policy_payment_requests: Object.keys(policyPayUriMap).map((x) => {
        return {
          payto: policyPayUriMap[x],
          provider: x,
        };
      }),
    };
  }

  logger.info("backup finished");

  return {
    ...state,
    core_secret: undefined,
    backup_state: BackupStates.BackupFinished,
    success_details: successDetails,
    payments: undefined,
  };
}

/**
 * Download policy based on current user attributes and selected
 * version in the state.
 */
async function downloadPolicy(
  state: ReducerStateRecovery,
): Promise<ReducerStateRecovery | ReducerStateError> {
  const providerUrls = Object.keys(state.authentication_providers ?? {});
  let foundRecoveryInfo: RecoveryInternalData | undefined = undefined;
  let recoveryDoc: RecoveryDocument | undefined = undefined;
  const newProviderStatus: { [url: string]: AuthenticationProviderStatusOk } =
    {};
  const userAttributes = state.identity_attributes!;
  const restrictProvider = state.selected_provider_url;
  // FIXME:  Shouldn't we also store the status of bad providers?
  for (const url of providerUrls) {
    const pi = await getProviderInfo(url);
    if ("error_code" in pi || !("http_status" in pi)) {
      // Could not even get /config of the provider
      continue;
    }
    newProviderStatus[url] = pi;
  }
  for (const url of providerUrls) {
    const pi = newProviderStatus[url];
    if (!pi) {
      continue;
    }
    if (restrictProvider && url !== state.selected_provider_url) {
      // User wants specific provider.
      continue;
    }
    const userId = await userIdentifierDerive(userAttributes, pi.salt);
    const acctKeypair = accountKeypairDerive(userId);
    const reqUrl = new URL(`policy/${acctKeypair.pub}`, url);
    if (state.selected_version) {
      reqUrl.searchParams.set("version", `${state.selected_version}`);
    }
    const resp = await fetch(reqUrl.href);
    if (resp.status !== 200) {
      continue;
    }
    const body = await resp.arrayBuffer();
    const bodyDecrypted = await decryptRecoveryDocument(
      userId,
      encodeCrock(body),
    );
    const rd: RecoveryDocument = await uncompressRecoveryDoc(
      decodeCrock(bodyDecrypted),
    );
    let policyVersion = 0;
    try {
      policyVersion = Number(resp.headers.get("Anastasis-Version") ?? "0");
    } catch (e) {}
    foundRecoveryInfo = {
      provider_url: url,
      secret_name: rd.secret_name ?? "<unknown>",
      version: policyVersion,
    };
    recoveryDoc = rd;
    break;
  }
  if (!foundRecoveryInfo || !recoveryDoc) {
    return {
      code: TalerErrorCode.ANASTASIS_REDUCER_POLICY_LOOKUP_FAILED,
      hint: "No backups found at any provider for your identity information.",
    };
  }
  const recoveryInfo: RecoveryInformation = {
    challenges: recoveryDoc.escrow_methods.map((x) => {
      const prov = newProviderStatus[x.url] as AuthenticationProviderStatusOk;
      return {
        cost: prov.methods.find((m) => m.type === x.escrow_type)?.usage_fee!,
        instructions: x.instructions,
        type: x.escrow_type,
        uuid: x.uuid,
      };
    }),
    policies: recoveryDoc.policies.map((x) => {
      return x.uuids.map((m) => {
        return {
          uuid: m,
        };
      });
    }),
  };
  return {
    ...state,
    recovery_state: RecoveryStates.SecretSelecting,
    recovery_document: foundRecoveryInfo,
    recovery_information: recoveryInfo,
    verbatim_recovery_document: recoveryDoc,
  };
}

/**
 * Try to reconstruct the secret from the available shares.
 *
 * Returns the state unmodified if not enough key shares are available yet.
 */
async function tryRecoverSecret(
  state: ReducerStateRecovery,
): Promise<ReducerStateRecovery | ReducerStateError> {
  const rd = state.verbatim_recovery_document!;
  for (const p of rd.policies) {
    const keyShares: KeyShare[] = [];
    let missing = false;
    for (const truthUuid of p.uuids) {
      const ks = (state.recovered_key_shares ?? {})[truthUuid];
      if (!ks) {
        missing = true;
        break;
      }
      keyShares.push(ks);
    }

    if (missing) {
      continue;
    }

    const policyKey = await policyKeyDerive(keyShares, p.salt);
    const coreSecretBytes = await coreSecretRecover({
      encryptedCoreSecret: rd.encrypted_core_secret,
      encryptedMasterKey: p.master_key,
      policyKey,
    });

    return {
      ...state,
      recovery_state: RecoveryStates.RecoveryFinished,
      selected_challenge_uuid: undefined,
      core_secret: JSON.parse(bytesToString(decodeCrock(coreSecretBytes))),
    };
  }
  return { ...state };
}

/**
 * Re-check the status of challenges that are solved asynchronously.
 */
async function pollChallenges(
  state: ReducerStateRecovery,
  args: void,
): Promise<ReducerStateRecovery | ReducerStateError> {
  for (const truthUuid in state.challenge_feedback) {
    if (state.recovery_state === RecoveryStates.RecoveryFinished) {
      break;
    }
    const feedback = state.challenge_feedback[truthUuid];
    const truth = state.verbatim_recovery_document!.escrow_methods.find(
      (x) => x.uuid === truthUuid,
    );
    if (!truth) {
      logger.warn(
        "truth for challenge feedback entry not found in recovery document",
      );
      continue;
    }
    if (feedback.state === ChallengeFeedbackStatus.AuthIban) {
      const s2 = await requestTruth(state, truth, {
        pin: feedback.answer_code,
      });
      if (s2.recovery_state) {
        state = s2;
      }
    }
  }
  return state;
}

/**
 * Request a truth, optionally with a challenge solution
 * provided by the user.
 */
async function requestTruth(
  state: ReducerStateRecovery,
  truth: EscrowMethod,
  solveRequest?: ActionArgsSolveChallengeRequest,
): Promise<ReducerStateRecovery | ReducerStateError> {
  const url = new URL(`/truth/${truth.uuid}`, truth.url);

  if (solveRequest) {
    logger.info(`handling solve request ${j2s(solveRequest)}`);
    let respHash: string;
    switch (truth.escrow_type) {
      case ChallengeType.Question: {
        if ("answer" in solveRequest) {
          respHash = await secureAnswerHash(
            solveRequest.answer,
            truth.uuid,
            truth.truth_salt,
          );
        } else {
          throw Error("unsupported answer request");
        }
        break;
      }
      case ChallengeType.Email:
      case ChallengeType.Sms:
      case ChallengeType.Post:
      case ChallengeType.Iban:
      case ChallengeType.Totp: {
        if ("answer" in solveRequest) {
          const s = solveRequest.answer.trim().replace(/^A-/, "");
          let pin: number;
          try {
            pin = Number.parseInt(s);
          } catch (e) {
            throw Error("invalid pin format");
          }
          respHash = await pinAnswerHash(pin);
        } else if ("pin" in solveRequest) {
          respHash = await pinAnswerHash(solveRequest.pin);
        } else {
          throw Error("unsupported answer request");
        }
        break;
      }
      default:
        throw Error(`unsupported challenge type "${truth.escrow_type}""`);
    }
    url.searchParams.set("response", respHash);
  }

  const resp = await fetch(url.href, {
    headers: {
      "Anastasis-Truth-Decryption-Key": truth.truth_key,
    },
  });

  logger.info(
    `got GET /truth response from ${truth.url}, http status ${resp.status}`,
  );

  if (resp.status === HttpStatusCode.Ok) {
    let answerSalt: string | undefined = undefined;
    if (
      solveRequest &&
      truth.escrow_type === "question" &&
      "answer" in solveRequest
    ) {
      answerSalt = solveRequest.answer;
    }

    const userId = await userIdentifierDerive(
      state.identity_attributes,
      truth.provider_salt,
    );

    const respBody = new Uint8Array(await resp.arrayBuffer());
    const keyShare = await decryptKeyShare(
      encodeCrock(respBody),
      userId,
      answerSalt,
    );

    const recoveredKeyShares = {
      ...(state.recovered_key_shares ?? {}),
      [truth.uuid]: keyShare,
    };

    const challengeFeedback: { [x: string]: ChallengeFeedback } = {
      ...state.challenge_feedback,
      [truth.uuid]: {
        state: ChallengeFeedbackStatus.Solved,
      },
    };

    const newState: ReducerStateRecovery = {
      ...state,
      recovery_state: RecoveryStates.ChallengeSelecting,
      challenge_feedback: challengeFeedback,
      recovered_key_shares: recoveredKeyShares,
    };

    return tryRecoverSecret(newState);
  }

  if (resp.status === HttpStatusCode.Forbidden) {
    const body = await resp.json();
    if (
      body.code === TalerErrorCode.ANASTASIS_TRUTH_CHALLENGE_RESPONSE_REQUIRED
    ) {
      return {
        ...state,
        recovery_state: RecoveryStates.ChallengeSolving,
        challenge_feedback: {
          ...state.challenge_feedback,
          [truth.uuid]: {
            state: ChallengeFeedbackStatus.Pending,
          },
        },
      };
    }
    return {
      ...state,
      recovery_state: RecoveryStates.ChallengeSolving,
      challenge_feedback: {
        ...state.challenge_feedback,
        [truth.uuid]: {
          state: ChallengeFeedbackStatus.Message,
          message: body.hint ?? "Challenge should be solved",
        },
      },
    };
  }

  if (resp.status === HttpStatusCode.Accepted) {
    const body = await resp.json();
    logger.info(`got body ${j2s(body)}`);
    if (body.method === "iban") {
      const b = body as IbanExternalAuthResponse;
      return {
        ...state,
        recovery_state: RecoveryStates.ChallengeSolving,
        challenge_feedback: {
          ...state.challenge_feedback,
          [truth.uuid]: {
            state: ChallengeFeedbackStatus.AuthIban,
            answer_code: b.answer_code,
            business_name: b.details.business_name,
            challenge_amount: b.details.challenge_amount,
            credit_iban: b.details.credit_iban,
            wire_transfer_subject: b.details.wire_transfer_subject,
            details: b.details,
            method: "iban",
          },
        },
      };
    } else {
      return {
        code: TalerErrorCode.ANASTASIS_TRUTH_CHALLENGE_FAILED,
        hint: "unknown external authentication method",
        http_status: resp.status,
      } as ReducerStateError;
    }
  }

  return {
    code: TalerErrorCode.ANASTASIS_TRUTH_CHALLENGE_FAILED,
    hint: "got unexpected /truth/ response status",
    http_status: resp.status,
  } as ReducerStateError;
}

async function solveChallenge(
  state: ReducerStateRecovery,
  ta: ActionArgsSolveChallengeRequest,
): Promise<ReducerStateRecovery | ReducerStateError> {
  const recDoc: RecoveryDocument = state.verbatim_recovery_document!;
  const truth = recDoc.escrow_methods.find(
    (x) => x.uuid === state.selected_challenge_uuid,
  );
  if (!truth) {
    throw Error("truth for challenge not found");
  }
  return requestTruth(state, truth, ta);
}

async function recoveryEnterUserAttributes(
  state: ReducerStateRecovery,
  args: ActionArgsEnterUserAttributes,
): Promise<ReducerStateRecovery | ReducerStateError> {
  // FIXME: validate attributes
  const providerUrls = Object.keys(state.authentication_providers ?? {});
  const newProviders = state.authentication_providers ?? {};
  for (const url of providerUrls) {
    newProviders[url] = await getProviderInfo(url);
  }
  const st: ReducerStateRecovery = {
    ...state,
    identity_attributes: args.identity_attributes,
    authentication_providers: newProviders,
  };
  return downloadPolicy(st);
}

async function changeVersion(
  state: ReducerStateRecovery,
  args: ActionArgsChangeVersion,
): Promise<ReducerStateRecovery | ReducerStateError> {
  const st: ReducerStateRecovery = {
    ...state,
    selected_version: args.version,
    selected_provider_url: args.provider_url,
  };
  return downloadPolicy(st);
}

async function selectChallenge(
  state: ReducerStateRecovery,
  ta: ActionArgsSelectChallenge,
): Promise<ReducerStateRecovery | ReducerStateError> {
  const recDoc: RecoveryDocument = state.verbatim_recovery_document!;
  const truth = recDoc.escrow_methods.find((x) => x.uuid === ta.uuid);
  if (!truth) {
    throw "truth for challenge not found";
  }

  return requestTruth({ ...state, selected_challenge_uuid: ta.uuid }, truth);
}

async function backupSelectContinent(
  state: ReducerStateBackup,
  args: ActionArgsSelectContinent,
): Promise<ReducerStateBackup | ReducerStateError> {
  const countries = getCountries(args.continent, {
    requireProvider: true,
  });
  if (countries.length <= 0) {
    return {
      code: TalerErrorCode.ANASTASIS_REDUCER_INPUT_INVALID,
      hint: "continent not found",
    };
  }
  return {
    ...state,
    backup_state: BackupStates.CountrySelecting,
    countries,
    selected_continent: args.continent,
  };
}

async function recoverySelectContinent(
  state: ReducerStateRecovery,
  args: ActionArgsSelectContinent,
): Promise<ReducerStateRecovery | ReducerStateError> {
  const countries = getCountries(args.continent, {
    requireProvider: true,
  });
  return {
    ...state,
    recovery_state: RecoveryStates.CountrySelecting,
    countries,
    selected_continent: args.continent,
  };
}

interface TransitionImpl<S, T> {
  argCodec: Codec<T>;
  handler: (s: S, args: T) => Promise<S | ReducerStateError>;
}

interface Transition<S, T> {
  [x: string]: TransitionImpl<S, T>;
}

function transition<S, T>(
  action: string,
  argCodec: Codec<T>,
  handler: (s: S, args: T) => Promise<S | ReducerStateError>,
): Transition<S, T> {
  return {
    [action]: {
      argCodec,
      handler,
    },
  };
}

function transitionBackupJump(
  action: string,
  st: BackupStates,
): Transition<ReducerStateBackup, void> {
  return {
    [action]: {
      argCodec: codecForAny(),
      handler: async (s, a) => ({ ...s, backup_state: st }),
    },
  };
}

function transitionRecoveryJump(
  action: string,
  st: RecoveryStates,
): Transition<ReducerStateRecovery, void> {
  return {
    [action]: {
      argCodec: codecForAny(),
      handler: async (s, a) => ({ ...s, recovery_state: st }),
    },
  };
}

//FIXME: doest the same that addProviderRecovery, but type are not generic enough
async function addProviderBackup(
  state: ReducerStateBackup,
  args: ActionArgsAddProvider,
): Promise<ReducerStateBackup> {
  const info = await getProviderInfo(args.provider_url)
  return {
    ...state,
    authentication_providers: {
      ...(state.authentication_providers ?? {}),
      [args.provider_url]: info,
    },
  };
}

//FIXME: doest the same that deleteProviderRecovery, but type are not generic enough
async function deleteProviderBackup(
  state: ReducerStateBackup,
  args: ActionArgsDeleteProvider,
): Promise<ReducerStateBackup> {
  const authentication_providers = {... state.authentication_providers ?? {} }
  delete authentication_providers[args.provider_url]
  return {
    ...state,
    authentication_providers,
  };
}

async function addProviderRecovery(
  state: ReducerStateRecovery,
  args: ActionArgsAddProvider,
): Promise<ReducerStateRecovery> {
  const info = await getProviderInfo(args.provider_url)
  return {
    ...state,
    authentication_providers: {
      ...(state.authentication_providers ?? {}),
      [args.provider_url]: info,
    },
  };
}

async function deleteProviderRecovery(
  state: ReducerStateRecovery,
  args: ActionArgsDeleteProvider,
): Promise<ReducerStateRecovery> {
  const authentication_providers = {... state.authentication_providers ?? {} }
  delete authentication_providers[args.provider_url]
  return {
    ...state,
    authentication_providers,
  };
}

async function addAuthentication(
  state: ReducerStateBackup,
  args: ActionArgsAddAuthentication,
): Promise<ReducerStateBackup> {
  return {
    ...state,
    authentication_methods: [
      ...(state.authentication_methods ?? []),
      args.authentication_method,
    ],
  };
}

async function deleteAuthentication(
  state: ReducerStateBackup,
  args: ActionArgsDeleteAuthentication,
): Promise<ReducerStateBackup> {
  const m = state.authentication_methods ?? [];
  m.splice(args.authentication_method, 1);
  return {
    ...state,
    authentication_methods: m,
  };
}

async function deletePolicy(
  state: ReducerStateBackup,
  args: ActionArgsDeletePolicy,
): Promise<ReducerStateBackup> {
  const policies = [...(state.policies ?? [])];
  policies.splice(args.policy_index, 1);
  return {
    ...state,
    policies,
  };
}

async function updatePolicy(
  state: ReducerStateBackup,
  args: ActionArgsUpdatePolicy,
): Promise<ReducerStateBackup> {
  const policies = [...(state.policies ?? [])];
  policies[args.policy_index] = { methods: args.policy };
  return {
    ...state,
    policies,
  };
}

async function addPolicy(
  state: ReducerStateBackup,
  args: ActionArgsAddPolicy,
): Promise<ReducerStateBackup> {
  return {
    ...state,
    policies: [
      ...(state.policies ?? []),
      {
        methods: args.policy,
      },
    ],
  };
}

async function nextFromAuthenticationsEditing(
  state: ReducerStateBackup,
  args: {},
): Promise<ReducerStateBackup | ReducerStateError> {
  const methods = state.authentication_methods ?? [];
  const providers: ProviderInfo[] = [];
  for (const provUrl of Object.keys(state.authentication_providers ?? {})) {
    const prov = state.authentication_providers![provUrl];
    if ("error_code" in prov) {
      continue;
    }
    if (!("http_status" in prov && prov.http_status === 200)) {
      continue;
    }
    const methodCost: Record<string, AmountString> = {};
    for (const meth of prov.methods) {
      methodCost[meth.type] = meth.usage_fee;
    }
    providers.push({
      methodCost,
      url: provUrl,
    });
  }
  const pol = suggestPolicies(methods, providers);
  return {
    ...state,
    backup_state: BackupStates.PoliciesReviewing,
    ...pol,
  };
}

async function updateUploadFees(
  state: ReducerStateBackup,
): Promise<ReducerStateBackup | ReducerStateError> {
  const expiration = state.expiration;
  if (!expiration) {
    return { ...state };
  }
  logger.info("updating upload fees");
  const feePerCurrency: Record<string, AmountJson> = {};
  const addFee = (x: AmountLike) => {
    x = Amounts.jsonifyAmount(x);
    feePerCurrency[x.currency] = Amounts.add(
      feePerCurrency[x.currency] ?? Amounts.getZero(x.currency),
      x,
    ).amount;
  };
  const years = Duration.toIntegerYears(Duration.getRemaining(expiration));
  logger.info(`computing fees for ${years} years`);
  // For now, we compute fees for *all* available providers.
  for (const provUrl in state.authentication_providers ?? {}) {
    const prov = state.authentication_providers![provUrl];
    if ("annual_fee" in prov) {
      const annualFee = Amounts.mult(prov.annual_fee, years).amount;
      logger.info(`adding annual fee ${Amounts.stringify(annualFee)}`);
      addFee(annualFee);
    }
  }
  const coveredProvTruth = new Set<string>();
  for (const x of state.policies ?? []) {
    for (const m of x.methods) {
      const prov = state.authentication_providers![
        m.provider
      ] as AuthenticationProviderStatusOk;
      const authMethod = state.authentication_methods![m.authentication_method];
      const key = `${m.authentication_method}@${m.provider}`;
      if (coveredProvTruth.has(key)) {
        continue;
      }
      logger.info(
        `adding cost for auth method ${authMethod.challenge} / "${authMethod.instructions}" at ${m.provider}`,
      );
      coveredProvTruth.add(key);
      addFee(prov.truth_upload_fee);
    }
  }
  return {
    ...state,
    upload_fees: Object.values(feePerCurrency).map((x) => ({
      fee: Amounts.stringify(x),
    })),
  };
}

async function enterSecret(
  state: ReducerStateBackup,
  args: ActionArgsEnterSecret,
): Promise<ReducerStateBackup | ReducerStateError> {
  return updateUploadFees({
    ...state,
    expiration: args.expiration,
    core_secret: {
      mime: args.secret.mime ?? "text/plain",
      value: args.secret.value,
    },
    // A new secret invalidates the existing recovery data.
    recovery_data: undefined,
  });
}

async function nextFromChallengeSelecting(
  state: ReducerStateRecovery,
  args: void,
): Promise<ReducerStateRecovery | ReducerStateError> {
  const s2 = await tryRecoverSecret(state);
  if (s2.recovery_state === RecoveryStates.RecoveryFinished) {
    return s2;
  }
  return {
    code: TalerErrorCode.ANASTASIS_REDUCER_ACTION_INVALID,
    hint: "Not enough challenges solved",
  };
}

async function enterSecretName(
  state: ReducerStateBackup,
  args: ActionArgsEnterSecretName,
): Promise<ReducerStateBackup | ReducerStateError> {
  return {
    ...state,
    secret_name: args.name,
  };
}

async function updateSecretExpiration(
  state: ReducerStateBackup,
  args: ActionArgsUpdateExpiration,
): Promise<ReducerStateBackup | ReducerStateError> {
  return updateUploadFees({
    ...state,
    expiration: args.expiration,
  });
}

const backupTransitions: Record<
  BackupStates,
  Transition<ReducerStateBackup, any>
> = {
  [BackupStates.ContinentSelecting]: {
    ...transition(
      "select_continent",
      codecForActionArgSelectContinent(),
      backupSelectContinent,
    ),
  },
  [BackupStates.CountrySelecting]: {
    ...transitionBackupJump("back", BackupStates.ContinentSelecting),
    ...transition(
      "select_country",
      codecForActionArgSelectCountry(),
      backupSelectCountry,
    ),
    ...transition(
      "select_continent",
      codecForActionArgSelectContinent(),
      backupSelectContinent,
    ),
  },
  [BackupStates.UserAttributesCollecting]: {
    ...transitionBackupJump("back", BackupStates.CountrySelecting),
    ...transition(
      "enter_user_attributes",
      codecForActionArgsEnterUserAttributes(),
      backupEnterUserAttributes,
    ),
  },
  [BackupStates.AuthenticationsEditing]: {
    ...transitionBackupJump("back", BackupStates.UserAttributesCollecting),
    ...transition("add_authentication", codecForAny(), addAuthentication),
    ...transition("delete_authentication", codecForAny(), deleteAuthentication),
    ...transition("add_provider", codecForAny(), addProviderBackup),
    ...transition("delete_provider", codecForAny(), deleteProviderBackup),
    ...transition("next", codecForAny(), nextFromAuthenticationsEditing),
  },
  [BackupStates.PoliciesReviewing]: {
    ...transitionBackupJump("back", BackupStates.AuthenticationsEditing),
    ...transitionBackupJump("next", BackupStates.SecretEditing),
    ...transition("add_policy", codecForActionArgsAddPolicy(), addPolicy),
    ...transition("delete_policy", codecForAny(), deletePolicy),
    ...transition("update_policy", codecForAny(), updatePolicy),
  },
  [BackupStates.SecretEditing]: {
    ...transitionBackupJump("back", BackupStates.PoliciesReviewing),
    ...transition("next", codecForAny(), uploadSecret),
    ...transition("enter_secret", codecForAny(), enterSecret),
    ...transition(
      "update_expiration",
      codecForActionArgsUpdateExpiration(),
      updateSecretExpiration,
    ),
    ...transition("enter_secret_name", codecForAny(), enterSecretName),
  },
  [BackupStates.PoliciesPaying]: {
    ...transitionBackupJump("back", BackupStates.SecretEditing),
    ...transition("pay", codecForAny(), uploadSecret),
  },
  [BackupStates.TruthsPaying]: {
    ...transitionBackupJump("back", BackupStates.SecretEditing),
    ...transition("pay", codecForAny(), uploadSecret),
  },
  [BackupStates.BackupFinished]: {
    ...transitionBackupJump("back", BackupStates.SecretEditing),
  },
};

const recoveryTransitions: Record<
  RecoveryStates,
  Transition<ReducerStateRecovery, any>
> = {
  [RecoveryStates.ContinentSelecting]: {
    ...transition(
      "select_continent",
      codecForActionArgSelectContinent(),
      recoverySelectContinent,
    ),
  },
  [RecoveryStates.CountrySelecting]: {
    ...transitionRecoveryJump("back", RecoveryStates.ContinentSelecting),
    ...transition(
      "select_country",
      codecForActionArgSelectCountry(),
      recoverySelectCountry,
    ),
    ...transition(
      "select_continent",
      codecForActionArgSelectContinent(),
      recoverySelectContinent,
    ),
  },
  [RecoveryStates.UserAttributesCollecting]: {
    ...transitionRecoveryJump("back", RecoveryStates.CountrySelecting),
    ...transition(
      "enter_user_attributes",
      codecForActionArgsEnterUserAttributes(),
      recoveryEnterUserAttributes,
    ),
  },
  [RecoveryStates.SecretSelecting]: {
    ...transitionRecoveryJump("back", RecoveryStates.UserAttributesCollecting),
    ...transitionRecoveryJump("next", RecoveryStates.ChallengeSelecting),
    ...transition("add_provider", codecForAny(), addProviderRecovery),
    ...transition("delete_provider", codecForAny(), deleteProviderRecovery),
    ...transition(
      "change_version",
      codecForActionArgsChangeVersion(),
      changeVersion,
    ),
  },
  [RecoveryStates.ChallengeSelecting]: {
    ...transitionRecoveryJump("back", RecoveryStates.SecretSelecting),
    ...transition(
      "select_challenge",
      codecForActionArgsSelectChallenge(),
      selectChallenge,
    ),
    ...transition("poll", codecForAny(), pollChallenges),
    ...transition("next", codecForAny(), nextFromChallengeSelecting),
  },
  [RecoveryStates.ChallengeSolving]: {
    ...transitionRecoveryJump("back", RecoveryStates.ChallengeSelecting),
    ...transition("solve_challenge", codecForAny(), solveChallenge),
  },
  [RecoveryStates.ChallengePaying]: {},
  [RecoveryStates.RecoveryFinished]: {
    ...transitionRecoveryJump("back", RecoveryStates.ChallengeSelecting),
  },
};

export async function reduceAction(
  state: ReducerState,
  action: string,
  args: any,
): Promise<ReducerState> {
  let h: TransitionImpl<any, any>;
  let stateName: string;
  if ("backup_state" in state && state.backup_state) {
    stateName = state.backup_state;
    h = backupTransitions[state.backup_state][action];
  } else if ("recovery_state" in state && state.recovery_state) {
    stateName = state.recovery_state;
    h = recoveryTransitions[state.recovery_state][action];
  } else {
    return {
      code: TalerErrorCode.ANASTASIS_REDUCER_ACTION_INVALID,
      hint: `Invalid state (needs backup_state or recovery_state)`,
    };
  }
  if (!h) {
    return {
      code: TalerErrorCode.ANASTASIS_REDUCER_ACTION_INVALID,
      hint: `Unsupported action '${action}' in state '${stateName}'`,
    };
  }
  let parsedArgs: any;
  try {
    parsedArgs = h.argCodec.decode(args);
  } catch (e: any) {
    return {
      code: TalerErrorCode.ANASTASIS_REDUCER_INPUT_INVALID,
      hint: "argument validation failed",
      message: e.toString(),
    };
  }
  try {
    return await h.handler(state, parsedArgs);
  } catch (e) {
    logger.error("action handler failed");
    if (e instanceof ReducerError) {
      return e.errorJson;
    }
    throw e;
  }
}
