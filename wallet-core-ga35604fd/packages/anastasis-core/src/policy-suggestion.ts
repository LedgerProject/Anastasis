import { AmountString, j2s, Logger } from "@gnu-taler/taler-util";
import { AuthMethod, Policy, PolicyProvider } from "./reducer-types.js";

const logger = new Logger("anastasis-core:policy-suggestion.ts");

const maxMethodSelections = 200;
const maxPolicyEvaluations = 10000;

/**
 * Provider information used during provider/method mapping.
 */
export interface ProviderInfo {
  url: string;
  methodCost: Record<string, AmountString>;
}

export function suggestPolicies(
  methods: AuthMethod[],
  providers: ProviderInfo[],
): PolicySelectionResult {
  const numMethods = methods.length;
  if (numMethods === 0) {
    throw Error("no methods");
  }
  let numSel: number;
  if (numMethods <= 2) {
    numSel = numMethods;
  } else if (numMethods <= 4) {
    numSel = numMethods - 1;
  } else if (numMethods <= 6) {
    numSel = numMethods - 2;
  } else if (numMethods == 7) {
    numSel = numMethods - 3;
  } else {
    numSel = 4;
  }
  const policies: Policy[] = [];
  const selections = enumerateMethodSelections(
    numSel,
    numMethods,
    maxMethodSelections,
  );
  logger.info(`selections: ${j2s(selections)}`);
  for (const sel of selections) {
    const p = assignProviders(policies, methods, providers, sel);
    if (p) {
      policies.push(p);
    }
  }
  logger.info(`suggesting policies ${j2s(policies)}`);
  return {
    policies,
    policy_providers: providers.map((x) => ({
      provider_url: x.url,
    })),
  };
}

/**
 * Assign providers to a method selection.
 *
 * The evaluation of the assignment is made with respect to
 * previously generated policies.
 */
function assignProviders(
  existingPolicies: Policy[],
  methods: AuthMethod[],
  providers: ProviderInfo[],
  methodSelection: number[],
): Policy | undefined {
  const providerSelections = enumerateProviderMappings(
    methodSelection.length,
    providers.length,
    maxPolicyEvaluations,
  );

  let bestProvSel: ProviderSelection | undefined;
  // Number of different providers selected, larger is better
  let bestDiversity = 0;
  // Number of identical challenges duplicated at different providers,
  // smaller is better
  let bestDuplication = Number.MAX_SAFE_INTEGER;

  for (const provSel of providerSelections) {
    // First, check if selection is even possible with the methods offered
    let possible = true;
    for (const methSelIndex in provSel) {
      const provIndex = provSel[methSelIndex];
      if (typeof provIndex !== "number") {
        throw Error("invariant failed");
      }
      const methIndex = methodSelection[methSelIndex];
      const meth = methods[methIndex];
      if (!meth) {
        throw Error("invariant failed");
      }
      const prov = providers[provIndex];
      if (!prov.methodCost[meth.type]) {
        possible = false;
        break;
      }
    }
    if (!possible) {
      continue;
    }
    // Evaluate diversity, always prefer policies
    // that increase diversity.
    const providerSet = new Set<string>();
    // The C reducer evaluates diversity only per policy
    // for (const pol of existingPolicies) {
    //   for (const m of pol.methods) {
    //     providerSet.add(m.provider);
    //   }
    // }
    for (const provIndex of provSel) {
      const prov = providers[provIndex];
      providerSet.add(prov.url);
    }

    const diversity = providerSet.size;

    // Number of providers that each method shows up at.
    const provPerMethod: Set<string>[] = [];
    for (let i = 0; i < methods.length; i++) {
      provPerMethod[i] = new Set<string>();
    }
    for (const pol of existingPolicies) {
      for (const m of pol.methods) {
        provPerMethod[m.authentication_method].add(m.provider);
      }
    }
    for (const methSelIndex in provSel) {
      const prov = providers[provSel[methSelIndex]];
      provPerMethod[methodSelection[methSelIndex]].add(prov.url);
    }

    let duplication = 0;
    for (const provSet of provPerMethod) {
      duplication += provSet.size;
    }

    logger.info(`diversity ${diversity}, duplication ${duplication}`);

    if (!bestProvSel || diversity > bestDiversity) {
      bestProvSel = provSel;
      bestDiversity = diversity;
      bestDuplication = duplication;
      logger.info(`taking based on diversity`);
    } else if (diversity == bestDiversity && duplication < bestDuplication) {
      bestProvSel = provSel;
      bestDiversity = diversity;
      bestDuplication = duplication;
      logger.info(`taking based on duplication`);
    }
    // TODO: also evaluate costs
  }

  if (!bestProvSel) {
    return undefined;
  }

  return {
    methods: bestProvSel.map((x, i) => ({
      authentication_method: methodSelection[i],
      provider: providers[x].url,
    })),
  };
}

/**
 * A provider selection maps a method selection index to a provider index.
 *
 * I.e. "PSEL[i] = x" means that provider with index "x" should be used
 * for method with index "MSEL[i]"
 */
type ProviderSelection = number[];

/**
 * A method selection "MSEL[j] = y" means that policy method j
 * should use method y.
 */
type MethodSelection = number[];

/**
 * Compute provider mappings.
 * Enumerates all n-combinations with repetition of m providers.
 */
function enumerateProviderMappings(
  n: number,
  m: number,
  limit?: number,
): ProviderSelection[] {
  const selections: ProviderSelection[] = [];
  const a = new Array(n);
  const sel = (i: number, start: number = 0) => {
    if (i === n) {
      selections.push([...a]);
      return;
    }
    for (let j = start; j < m; j++) {
      a[i] = j;
      sel(i + 1, 0);
      if (limit && selections.length >= limit) {
        break;
      }
    }
  };
  sel(0);
  return selections;
}

interface PolicySelectionResult {
  policies: Policy[];
  policy_providers: PolicyProvider[];
}

/**
 * Compute method selections.
 * Enumerates all n-combinations without repetition of m methods.
 */
function enumerateMethodSelections(
  n: number,
  m: number,
  limit?: number,
): MethodSelection[] {
  const selections: MethodSelection[] = [];
  const a = new Array(n);
  const sel = (i: number, start: number = 0) => {
    if (i === n) {
      selections.push([...a]);
      return;
    }
    for (let j = start; j < m; j++) {
      a[i] = j;
      sel(i + 1, j + 1);
      if (limit && selections.length >= limit) {
        break;
      }
    }
  };
  sel(0);
  return selections;
}
