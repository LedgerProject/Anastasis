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

export interface CoinConfig {
  name: string;
  value: string;
  durationWithdraw: string;
  durationSpend: string;
  durationLegal: string;
  feeWithdraw: string;
  feeDeposit: string;
  feeRefresh: string;
  feeRefund: string;
  rsaKeySize: number;
}

const coinCommon = {
  durationLegal: "3 years",
  durationSpend: "2 years",
  durationWithdraw: "7 days",
  rsaKeySize: 1024,
};

export const coin_ct1 = (curr: string): CoinConfig => ({
  ...coinCommon,
  name: `${curr}_ct1`,
  value: `${curr}:0.01`,
  feeDeposit: `${curr}:0.00`,
  feeRefresh: `${curr}:0.01`,
  feeRefund: `${curr}:0.00`,
  feeWithdraw: `${curr}:0.01`,
});

export const coin_ct10 = (curr: string): CoinConfig => ({
  ...coinCommon,
  name: `${curr}_ct10`,
  value: `${curr}:0.10`,
  feeDeposit: `${curr}:0.01`,
  feeRefresh: `${curr}:0.01`,
  feeRefund: `${curr}:0.00`,
  feeWithdraw: `${curr}:0.01`,
});

export const coin_u1 = (curr: string): CoinConfig => ({
  ...coinCommon,
  name: `${curr}_u1`,
  value: `${curr}:1`,
  feeDeposit: `${curr}:0.02`,
  feeRefresh: `${curr}:0.02`,
  feeRefund: `${curr}:0.02`,
  feeWithdraw: `${curr}:0.02`,
});

export const coin_u2 = (curr: string): CoinConfig => ({
  ...coinCommon,
  name: `${curr}_u2`,
  value: `${curr}:2`,
  feeDeposit: `${curr}:0.02`,
  feeRefresh: `${curr}:0.02`,
  feeRefund: `${curr}:0.02`,
  feeWithdraw: `${curr}:0.02`,
});

export const coin_u4 = (curr: string): CoinConfig => ({
  ...coinCommon,
  name: `${curr}_u4`,
  value: `${curr}:4`,
  feeDeposit: `${curr}:0.02`,
  feeRefresh: `${curr}:0.02`,
  feeRefund: `${curr}:0.02`,
  feeWithdraw: `${curr}:0.02`,
});

export const coin_u8 = (curr: string): CoinConfig => ({
  ...coinCommon,
  name: `${curr}_u8`,
  value: `${curr}:8`,
  feeDeposit: `${curr}:0.16`,
  feeRefresh: `${curr}:0.16`,
  feeRefund: `${curr}:0.16`,
  feeWithdraw: `${curr}:0.16`,
});

const coin_u10 = (curr: string): CoinConfig => ({
  ...coinCommon,
  name: `${curr}_u10`,
  value: `${curr}:10`,
  feeDeposit: `${curr}:0.2`,
  feeRefresh: `${curr}:0.2`,
  feeRefund: `${curr}:0.2`,
  feeWithdraw: `${curr}:0.2`,
});

export const defaultCoinConfig = [
  coin_ct1,
  coin_ct10,
  coin_u1,
  coin_u2,
  coin_u4,
  coin_u8,
  coin_u10,
];

const coinCheapCommon = (curr: string) => ({
  durationLegal: "3 years",
  durationSpend: "2 years",
  durationWithdraw: "7 days",
  rsaKeySize: 1024,
  feeRefresh: `${curr}:0.2`,
  feeRefund: `${curr}:0.2`,
  feeWithdraw: `${curr}:0.2`,
});

export function makeNoFeeCoinConfig(curr: string): CoinConfig[] {
  const cc: CoinConfig[] = [];

  for (let i = 0; i < 16; i++) {
    const ct = 2 ** i;

    const unit = Math.floor(ct / 100);
    const cent = ct % 100;

    cc.push({
      durationLegal: "3 years",
      durationSpend: "2 years",
      durationWithdraw: "7 days",
      rsaKeySize: 1024,
      name: `${curr}-u${i}`,
      feeDeposit: `${curr}:0`,
      feeRefresh: `${curr}:0`,
      feeRefund: `${curr}:0`,
      feeWithdraw: `${curr}:0`,
      value: `${curr}:${unit}.${cent}`,
    });
  }

  return cc;
}
