/*
 This file is part of GNU Taler
 (C) 2020 Taler Systems S.A.

 GNU Taler is free software; you can redistribute it and/or modify it under the
 terms of the GNU General Public License as published by the Free Software
 Foundation; either version 3, or (at your option) any later version.

 GNU Taler is distributed in the hope that it will be useful, but WITHOUT ANY
 WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR
 A PARTICULAR PURPOSE.  See the GNU General Public License for more details.

 You should have received a copy of the GNU General Public License along with
 GNU Taler; see the file COPYING.  If not, see <http://www.gnu.org/licenses/>
 */

import { Amounts } from "@gnu-taler/taler-util";
import test from "ava";
import { DenominationRecord, DenominationVerificationStatus } from "../db.js";
import { selectWithdrawalDenominations } from "./withdraw.js";

test("withdrawal selection bug repro", (t) => {
  const amount = {
    currency: "KUDOS",
    fraction: 43000000,
    value: 23,
  };

  const denoms: DenominationRecord[] = [
    {
      denomPub: {
        cipher: 1,
        rsa_public_key:
          "040000XT67C8KBD6B75TTQ3SK8FWXMNQW4372T3BDDGPAMB9RFCA03638W8T3F71WFEFK9NP32VKYVNFXPYRWQ1N1HDKV5J0DFEKHBPJCYSWCBJDRNWD7G8BN8PT97FA9AMV75MYEK4X54D1HGJ207JSVJBGFCATSPNTEYNHEQF1F220W00TBZR1HNPDQFD56FG0DJQ9KGHM8EC33H6AY9YN9CNX5R3Z4TZ4Q23W47SBHB13H6W74FQJG1F50X38VRSC4SR8RWBAFB7S4K8D2H4NMRFSQT892A3T0BTBW7HM5C0H2CK6FRKG31F7W9WP1S29013K5CXYE55CT8TH6N8J9B780R42Y5S3ZB6J6E9H76XBPSGH4TGYSR2VZRB98J417KCQMZKX1BB67E7W5KVE37TC9SJ904002",
      },
      denomPubHash:
        "Q21FQSSG4FXNT96Z14CHXM8N1RZAG9GPHAV8PRWS0PZAAVWH7PBW6R97M2CH19KKP65NNSWXY7B6S53PT3CBM342E357ZXDDJ8RDVW8",
      exchangeBaseUrl: "https://exchange.demo.taler.net/",
      exchangeMasterPub: "",
      feeDeposit: {
        currency: "KUDOS",
        fraction: 1000000,
        value: 0,
      },
      feeRefresh: {
        currency: "KUDOS",
        fraction: 1000000,
        value: 0,
      },
      feeRefund: {
        currency: "KUDOS",
        fraction: 1000000,
        value: 0,
      },
      feeWithdraw: {
        currency: "KUDOS",
        fraction: 1000000,
        value: 0,
      },
      isOffered: true,
      isRevoked: false,
      masterSig:
        "4F0P456CNNTTWK8BFJHGM3JTD6FVVNZY8EP077GYAHDJ5Y81S5RQ3SMS925NXMDVG9A88JAAP0E2GDZBC21PP5NHFFVWHAW3AVT8J3R",
      stampExpireDeposit: {
        t_ms: 1742909388000,
      },
      stampExpireLegal: {
        t_ms: 1900589388000,
      },
      stampExpireWithdraw: {
        t_ms: 1679837388000,
      },
      stampStart: {
        t_ms: 1585229388000,
      },
      verificationStatus: DenominationVerificationStatus.Unverified,
      value: {
        currency: "KUDOS",
        fraction: 0,
        value: 1000,
      },
      listIssueDate: { t_ms: 0 },
    },
    {
      denomPub: {
        cipher: 1,
        rsa_public_key:
          "040000Y63CF78QFPKRY77BRK9P557Q1GQWX3NCZ3HSYSK0Z7TT0KGRA7N4SKBKEHSTVHX1Z9DNXMJR4EXSY1TXCKV0GJ3T3YYC6Z0JNMJFVYQAV4FX5J90NZH1N33MZTV8HS9SMNAA9S6K73G4P99GYBB01B0P6M1KXZ5JRDR7VWBR3MEJHHGJ6QBMCJR3NWJRE3WJW9PRY8QPQ2S7KFWTWRESH2DBXCXWBD2SRN6P9YX8GRAEMFEGXC9V5GVJTEMH6ZDGNXFPWZE3JVJ2Q4N9GDYKBCHZCJ7M7M2RJ9ZV4Y64NAN9BT6XDC68215GKKRHTW1BBF1MYY6AR3JCTT9HYAM923RMVQR3TAEB7SDX8J76XRZWYH3AGJCZAQGMN5C8SSH9AHQ9RNQJQ15CN45R37X4YNFJV904002",
      },

      denomPubHash:
        "447WA23SCBATMABHA0793F92MYTBYVPYMMQHCPKMKVY5P7RZRFMQ6VRW0Y8HRA7177GTBT0TBT08R21DZD129AJ995H9G09XBFE55G8",
      exchangeBaseUrl: "https://exchange.demo.taler.net/",
      exchangeMasterPub: "",
      feeDeposit: {
        currency: "KUDOS",
        fraction: 1000000,
        value: 0,
      },
      feeRefresh: {
        currency: "KUDOS",
        fraction: 1000000,
        value: 0,
      },
      feeRefund: {
        currency: "KUDOS",
        fraction: 1000000,
        value: 0,
      },
      feeWithdraw: {
        currency: "KUDOS",
        fraction: 1000000,
        value: 0,
      },
      isOffered: true,
      isRevoked: false,
      masterSig:
        "P99AW82W46MZ0AKW7Z58VQPXFNTJQM9DVTYPBDF6KVYF38PPVDAZTV7JQ8TY7HGEC7JJJAY4E7AY7J3W1WV10DAZZQHHKTAVTSRAC20",
      stampExpireDeposit: {
        t_ms: 1742909388000,
      },
      stampExpireLegal: {
        t_ms: 1900589388000,
      },
      stampExpireWithdraw: {
        t_ms: 1679837388000,
      },
      stampStart: {
        t_ms: 1585229388000,
      },
      verificationStatus: DenominationVerificationStatus.Unverified,
      value: {
        currency: "KUDOS",
        fraction: 0,
        value: 10,
      },
      listIssueDate: { t_ms: 0 },
    },
    {
      denomPub: {
        cipher: 1,
        rsa_public_key:
          "040000YDESWC2B962DA4WK356SC50MA3N9KV0ZSGY3RC48JCTY258W909C7EEMT5BTC5KZ5T4CERCZ141P9QF87EK2BD1XEEM5GB07MB3H19WE4CQGAS8X84JBWN83PQGQXVMWE5HFA992KMGHC566GT9ZS2QPHZB6X89C4A80Z663PYAAPXP728VHAKATGNNBQ01ZZ2XD1CH9Y38YZBSPJ4K7GB2J76GBCYAVD9ENHDVWXJAXYRPBX4KSS5TXRR3K5NEN9ZV3AJD2V65K7ABRZDF5D5V1FJZZMNJ5XZ4FEREEKEBV9TDFPGJTKDEHEC60K3DN24DAATRESDJ1ZYYSYSRCAT4BT2B62ARGVMJTT5N2R126DRW9TGRWCW0ZAF2N2WET1H4NJEW77X0QT46Z5R3MZ0XPHD04002",
      },
      denomPubHash:
        "JS61DTKAFM0BX8Q4XV3ZSKB921SM8QK745Z2AFXTKFMBHHFNBD8TQ5ETJHFNDGBGX22FFN2A2ERNYG1SGSDQWNQHQQ2B14DBVJYJG8R",
      exchangeBaseUrl: "https://exchange.demo.taler.net/",
      exchangeMasterPub: "",
      feeDeposit: {
        currency: "KUDOS",
        fraction: 1000000,
        value: 0,
      },
      feeRefresh: {
        currency: "KUDOS",
        fraction: 1000000,
        value: 0,
      },
      feeRefund: {
        currency: "KUDOS",
        fraction: 1000000,
        value: 0,
      },
      feeWithdraw: {
        currency: "KUDOS",
        fraction: 1000000,
        value: 0,
      },
      isOffered: true,
      isRevoked: false,
      masterSig:
        "8S4VZGHE5WE0N5ZVCHYW9KZZR4YAKK15S46MV1HR1QB9AAMH3NWPW4DCR4NYGJK33Q8YNFY80SWNS6XKAP5DEVK933TM894FJ2VGE3G",
      stampExpireDeposit: {
        t_ms: 1742909388000,
      },
      stampExpireLegal: {
        t_ms: 1900589388000,
      },
      stampExpireWithdraw: {
        t_ms: 1679837388000,
      },
      stampStart: {
        t_ms: 1585229388000,
      },
      verificationStatus: DenominationVerificationStatus.Unverified,
      value: {
        currency: "KUDOS",
        fraction: 0,
        value: 5,
      },
      listIssueDate: { t_ms: 0 },
    },
    {
      denomPub: {
        cipher: 1,
        rsa_public_key:
          "040000YG3T1ADB8DVA6BD3EPV6ZHSHTDW35DEN4VH1AE6CSB7P1PSDTNTJG866PHF6QB1CCWYCVRGA0FVBJ9Q0G7KV7AD9010GDYBQH0NNPHW744MTNXVXWBGGGRGQGYK4DTYN1DSWQ1FZNDSZZPB5BEKG2PDJ93NX2JTN06Y8QMS2G734Z9XHC10EENBG2KVB7EJ3CM8PV1T32RC7AY62F3496E8D8KRHJQQTT67DSGMNKK86QXVDTYW677FG27DP20E8XY3M6FQD53NDJ1WWES91401MV1A3VXVPGC76GZVDD62W3WTJ1YMKHTTA3MRXX3VEAAH3XTKDN1ER7X6CZPMYTF8VK735VP2B2TZGTF28TTW4FZS32SBS64APCDF6SZQ427N5538TJC7SRE71YSP5ET8GS904002",
      },

      denomPubHash:
        "8T51NEY81VMPQ180EQ5WR0YH7GMNNT90W55Q0514KZM18AZT71FHJGJHQXGK0WTA7ACN1X2SD0S53XPBQ1A9KH960R48VCVVM6E3TH8",
      exchangeBaseUrl: "https://exchange.demo.taler.net/",
      exchangeMasterPub: "",
      feeDeposit: {
        currency: "KUDOS",
        fraction: 1000000,
        value: 0,
      },
      feeRefresh: {
        currency: "KUDOS",
        fraction: 1000000,
        value: 0,
      },
      feeRefund: {
        currency: "KUDOS",
        fraction: 1000000,
        value: 0,
      },
      feeWithdraw: {
        currency: "KUDOS",
        fraction: 1000000,
        value: 0,
      },
      isOffered: true,
      isRevoked: false,
      masterSig:
        "E3AWGAG8VB42P3KXM8B04Z6M483SX59R3Y4T53C3NXCA2NPB6C7HVCMVX05DC6S58E9X40NGEBQNYXKYMYCF3ASY2C4WP1WCZ4ME610",
      stampExpireDeposit: {
        t_ms: 1742909388000,
      },
      stampExpireLegal: {
        t_ms: 1900589388000,
      },
      stampExpireWithdraw: {
        t_ms: 1679837388000,
      },
      stampStart: {
        t_ms: 1585229388000,
      },
      verificationStatus: DenominationVerificationStatus.Unverified,
      value: {
        currency: "KUDOS",
        fraction: 0,
        value: 1,
      },
      listIssueDate: { t_ms: 0 },
    },
    {
      denomPub: {
        cipher: 1,
        rsa_public_key:
          "040000ZC0G60E9QQ5PD81TSDWD9GV5Y6P8Z05NSPA696DP07NGQQVSRQXBA76Q6PRB0YFX295RG4MTQJXAZZ860ET307HSC2X37XAVGQXRVB8Q4F1V7NP5ZEVKTX75DZK1QRAVHEZGQYKSSH6DBCJNQF6V9WNQF3GEYVA4KCBHA7JF772KHXM9642C28Z0AS4XXXV2PABAN5C8CHYD5H7JDFNK3920W5Q69X0BS84XZ4RE2PW6HM1WZ6KGZ3MKWWWCPKQ1FSFABRBWKAB09PF563BEBXKY6M38QETPH5EDWGANHD0SC3QV0WXYVB7BNHNNQ0J5BNV56K563SYHM4E5ND260YRJSYA1GN5YSW2B1J5T1A1EBNYF2DN6JNJKWXWEQ42G5YS17ZSZ5EWDRA9QKV8EGTCNAD04002",
      },
      denomPubHash:
        "A41HW0Q2H9PCNMEWW0C0N45QAYVXZ8SBVRRAHE4W6X24SV1TH38ANTWDT80JXEBW9Z8PVPGT9GFV2EYZWJ5JW5W1N34NFNKHQSZ1PFR",
      exchangeBaseUrl: "https://exchange.demo.taler.net/",
      exchangeMasterPub: "",
      feeDeposit: {
        currency: "KUDOS",
        fraction: 1000000,
        value: 0,
      },
      feeRefresh: {
        currency: "KUDOS",
        fraction: 1000000,
        value: 0,
      },
      feeRefund: {
        currency: "KUDOS",
        fraction: 1000000,
        value: 0,
      },
      feeWithdraw: {
        currency: "KUDOS",
        fraction: 1000000,
        value: 0,
      },
      isOffered: true,
      isRevoked: false,
      masterSig:
        "0ES1RKV002XB4YP21SN0QB7RSDHGYT0XAE65JYN8AVJAA6H7JZFN7JADXT521DJS89XMGPZGR8GCXF1516Y0Q9QDV00E6NMFA6CF838",
      stampExpireDeposit: {
        t_ms: 1742909388000,
      },
      stampExpireLegal: {
        t_ms: 1900589388000,
      },
      stampExpireWithdraw: {
        t_ms: 1679837388000,
      },
      stampStart: {
        t_ms: 1585229388000,
      },
      verificationStatus: DenominationVerificationStatus.Unverified,
      value: {
        currency: "KUDOS",
        fraction: 10000000,
        value: 0,
      },
      listIssueDate: { t_ms: 0 },
    },
    {
      denomPub: {
        cipher: 1,
        rsa_public_key:
          "040000ZSK2PMVY6E3NBQ52KXMW029M60F4BWYTDS0FZSD0PE53CNZ9H6TM3GQK1WRTEKQ5GRWJ1J9DY6Y42SP47QVT1XD1G0W05SQ5F3F7P5KSWR0FJBJ9NZBXQEVN8Q4JRC94X3JJ3XV3KBYTZ2HTDFV28C3H2SRR0XGNZB4FY85NDZF1G4AEYJJ9QB3C0V8H70YB8RV3FKTNH7XS4K4HFNZHJ5H9VMX5SM9Z2DX37HA5WFH0E2MJBVVF2BWWA5M0HPPSB365RAE2AMD42Q65A96WD80X27SB2ZNQZ8WX0K13FWF85GZ6YNYAJGE1KGN06JDEKE9QD68Z651D7XE8V6664TVVC8M68S7WD0DSXMJQKQ0BNJXNDE29Q7MRX6DA3RW0PZ44B3TKRK0294FPVZTNSTA6XF04002",
      },
      denomPubHash:
        "F5NGBX33DTV4595XZZVK0S2MA1VMXFEJQERE5EBP5DS4QQ9EFRANN7YHWC1TKSHT2K6CQWDBRES8D3DWR0KZF5RET40B4AZXZ0RW1ZG",
      exchangeBaseUrl: "https://exchange.demo.taler.net/",
      exchangeMasterPub: "",
      feeDeposit: {
        currency: "KUDOS",
        fraction: 1000000,
        value: 0,
      },
      feeRefresh: {
        currency: "KUDOS",
        fraction: 1000000,
        value: 0,
      },
      feeRefund: {
        currency: "KUDOS",
        fraction: 1000000,
        value: 0,
      },
      feeWithdraw: {
        currency: "KUDOS",
        fraction: 1000000,
        value: 0,
      },
      isOffered: true,
      isRevoked: false,
      masterSig:
        "58QEB6C6N7602E572E3JYANVVJ9BRW0V9E2ZFDW940N47YVQDK9SAFPWBN5YGT3G1742AFKQ0CYR4DM2VWV0Z0T1XMEKWN6X2EZ9M0R",
      stampExpireDeposit: {
        t_ms: 1742909388000,
      },
      stampExpireLegal: {
        t_ms: 1900589388000,
      },
      stampExpireWithdraw: {
        t_ms: 1679837388000,
      },
      stampStart: {
        t_ms: 1585229388000,
      },
      verificationStatus: DenominationVerificationStatus.Unverified,
      value: {
        currency: "KUDOS",
        fraction: 0,
        value: 2,
      },
      listIssueDate: { t_ms: 0 },
    },
  ];

  const res = selectWithdrawalDenominations(amount, denoms);

  console.error("cost", Amounts.stringify(res.totalWithdrawCost));
  console.error("withdraw amount", Amounts.stringify(amount));

  t.assert(Amounts.cmp(res.totalWithdrawCost, amount) <= 0);
  t.pass();
});
