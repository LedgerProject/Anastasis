import { j2s } from "@gnu-taler/taler-util";
import test from "ava";
import { ProviderInfo, suggestPolicies } from "./policy-suggestion.js";

test("policy suggestion", async (t) => {
  const methods = [
    {
      challenge: "XXX",
      instructions: "SMS to 123",
      type: "sms",
    },
    {
      challenge: "XXX",
      instructions: "What is the meaning of life?",
      type: "question",
    },
    {
      challenge: "XXX",
      instructions: "email to foo@bar.com",
      type: "email",
    },
  ];
  const providers: ProviderInfo[] = [
    {
      methodCost: {
        sms: "KUDOS:1",
      },
      url: "prov1",
    },
    {
      methodCost: {
        question: "KUDOS:1",
      },
      url: "prov2",
    },
  ];
  const res1 = suggestPolicies(methods, providers);
  t.assert(res1.policies.length === 1);
  const res2 = suggestPolicies([...methods].reverse(), providers);
  t.assert(res2.policies.length === 1);

  const res3 = suggestPolicies(methods, [...providers].reverse());
  t.assert(res3.policies.length === 1);
});
