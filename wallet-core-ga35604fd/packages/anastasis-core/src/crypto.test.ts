import test from "ava";
import {
  accountKeypairDerive,
  decryptTruth,
  encryptKeyshare,
  encryptTruth,
  policyKeyDerive,
  secureAnswerHash,
  userIdentifierDerive,
} from "./crypto.js";

// Vector generated with taler-anastasis-tvg
const userIdVector = {
  input_id_data: {
    name: "Fleabag",
    ssn: "AB123",
  },
  input_server_salt: "FZ48EFS7WS3R2ZR4V53A3GFFY4",
  output_id:
    "YS45R6CGJV84K1NN7T14ZBCPVTZ6H15XJSM1FV0R748MHPV82SM0126EBZKBAAGCR34Q9AFKPEW1HRT2Q9GQ5JRA3642AB571DKZS18",
};

test("user ID derivation", async (t) => {
  const res = await userIdentifierDerive(
    userIdVector.input_id_data,
    userIdVector.input_server_salt,
  );
  t.is(res, userIdVector.output_id);
});

test("account key pair derive", async (t) => {
  const tv = {
    operation: "account_keypair_derive",
    input_id:
      "3E9H5G4K645J6QWZGFZTWZQR54TQ5Y53CJFBZAQCC85QNP0C989Y113QWKC2CTTHP1NQFXMK3APS243WQ3N9BNMK6AMK6NP0ERM73HR",
    output_priv_key: "7Y3DH7533MBERGESBE9296D0A503W6PWCK1AK6QNTD7ZCFCWC2G0",
    output_pub_key: "QXJ3SJQCB0WGVY61B8R6PBEWCMZGYH07EW4JKBGNVZHN1745JYQ0",
  };

  const res = accountKeypairDerive(tv.input_id);
  t.is(res.priv, tv.output_priv_key);
  t.is(res.pub, tv.output_pub_key);
});

test("policy key derive", async (t) => {
  const tv = {
    operation: "policy_key_derive",
    input_key_shares: [
      "MJ1XCJNJKD0JVDBD2QSYZRE5MS93R9XCA6J10DV7DFYA8NQMT5Z0",
      "QPRQRQTC015C80M8DS95Y6H1MKF5DG7ZW7HST6V9MKJHHH5VYX8G",
    ],
    input_salt:
      "EQFPNJVRCV1EABQMVFYSG7T45PW59QDXR7MYRY2Q90ZPB547WJ6C5DCR1B27VM69SXKF3T65EPCAP8KNP7AVMAH1Q5161TA8310RNR0",
    output_policy_key:
      "431NKRGWG43P4THPFQT7C1NPKJKM1FA8X6163CNMEGXN51Y2MCNEVN5154G8FM8TXMZ5FVSXAX26WV8M5HJYGZA0R8YFH3V8PKK9PX0",
  };

  const res = await policyKeyDerive(tv.input_key_shares, tv.input_salt);
  t.is(res, tv.output_policy_key);
});

test("secure answer hash", async (t) => {
  const tv = {
    operation: "secure_answer_hash",
    input_answer: "Blah",
    input_uuid: "7PMDS95CVS1MGA29KN05SDJ6353TMYRW00P78D0WSQ16QTRQM090",
    input_salt: "71BYXM8VCEQ976FA2KXGJ096RW",
    output_hash:
      "Z0CDC1ZYE15AZ7BR9F8PYTBHY5A0MEVNQEFPTEBKD31NSS4PAXTH7MZRT6HFX7H6F9KE8Y6A72ETSCWA1GCXGNAB1MVTV3R4XYCA908",
  };

  const out = await secureAnswerHash(
    tv.input_answer,
    tv.input_uuid,
    tv.input_salt,
  );
  t.is(out, tv.output_hash);
});

test("truth encryption", async (t) => {
  const tv = {
    operation: "truth_encryption",
    input_nonce: "G94DP8YHN4V9M2HNYRFB4QQAKJGPH5H817NPANR",
    input_truth_enc_key:
      "9ZGP521EXMC6PE052HZJWCDR4PCM2PDHVFAGQXSB3S487FGNRYYVMN8NQQ43VGT2A1N9KYW2JRH0GPXYQ9GJ1F3D5PTN3CCJEXW64JG",
    input_truth:
      "R2AKJNZCAYTC81J0TQW4EZ69GFVMBSKJ6T5KXW2445D44XV5KZYG1QA0D43ZJRWBN1NFTYW60YFX6VDEZKH7G4BCN5Q8VARZ9Y95AK2D2FZG4RA5ESKX84JVZHWSWQ56TX3128KZ01YKWGXT99HX8YQFR7KBZBJJSBEX91KZPG0X4F0GKWQ69R30V14P58NES75K9D83PHZE1BN69QX9EE0CMENN4ND9Y5PPB34AVREV1GTSP5D0F48D07CKP8TCZ9K2BPTNQ8HFRZVRYW9GWER9JMHNMN1TT8FB3GNJH8G3CAD0GDPTMFG587C7PWKSPGCEXB929T4MT1NEPE47VEVE63V98RGFJMT8FR3C6EVYDAR4Q7R61CT50JM1AQ22D5962RHXP27R3M5MQWDQ2VNP38",
    output_encrypted_truth:
      "G94DP8YHN4V9M2HNYRFB4QQAKJGPH5H817NPANSN3ZN3GG8SS76ZFXNBPRN8G50J6PAVQN63EZXPF343BBCH3CX55C6EY1Y8YJAQZB1PE6VKBWR0G3VCSPSMFYX7TYQRPWQC79SGZC1GTVMMQDNBRANYJHDMZ40V7JCM5BDYVBVSFGVR17EXG1H41G2MSEJC3ZDK1829B9VWSMWNZQQN21YAXRPGQXM1NGY78ZFKRGMCRS6QEHAVMTY6VER9QG35K2SQ400WJATPAM530P15Z8RVEB5TTESKHA2EHM0CYA51JKHMFX02H94Y66PETYEJX5314C7H563K3KK7T71S369GKXTNW9TNFPVVFDH2N1VS57J77772N1ME72VPYNCC3YHXMN2JVQ665NWRNYHSZ68DGGG3X9Y4P8HGAK229ARWQKR29KSZXXAKJFH2BXVW7W88SSETJFTZ3GHVC421682M5R",
  };

  const enc = await encryptTruth(
    tv.input_nonce,
    tv.input_truth_enc_key,
    tv.input_truth,
  );
  t.is(enc, tv.output_encrypted_truth);

  const dec = await decryptTruth(tv.input_truth_enc_key, enc);

  t.is(dec, tv.input_truth);
});
