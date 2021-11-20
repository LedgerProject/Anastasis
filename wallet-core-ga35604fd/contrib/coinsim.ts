/*
 This file is part of GNU Taler
 (C) 2018 GNUnet e.V.

 GNU Taler is free software; you can redistribute it and/or modify it under the
 terms of the GNU General Public License as published by the Free Software
 Foundation; either version 3, or (at your option) any later version.

 GNU Taler is distributed in the hope that it will be useful, but WITHOUT ANY
 WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR
 A PARTICULAR PURPOSE.  See the GNU General Public License for more details.

 You should have received a copy of the GNU General Public License along with
 GNU Taler; see the file COPYING.  If not, see <http://www.gnu.org/licenses/>
 */


function getRandomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

const denoms = [8096, 4096, 2048, 1024, 512, 256, 128, 64, 32, 16, 8, 4, 2, 1];

// mapping from denomination index to count
const wallet = denoms.map(() => 0);

const trans_max = 5000;
const trans_min = 4;

const withdraw_max = 10000;

const num_transactions = parseInt(process.argv[2]);

// Refresh or withdraw operations
let ops = 0;
let ops_refresh = 0;
let ops_withdraw = 0;
let ops_spend = 0;
let refresh_output = 0;

function withdraw(amount, is_refresh) {
  while (amount != 0) {
    for (let i = 0; i < denoms.length; i++) {
      let d = denoms[i];
      if (d <= amount) {
        amount -= d;
        wallet[i]++;
        ops++;
        if (!is_refresh) {
          ops_withdraw++;
        } else {
          refresh_output++;
        }
        break;
      }
    }
  }
}

function spendSmallestFirst(cost) {
  while (cost != 0) {
    for (let j = 0; j < denoms.length; j++) {
      const k = denoms.length - j - 1;
      const d = denoms[k];
      const w = wallet[k];
      if (w == 0) {
        continue;
      }
      if (d <= cost) {
        // spend
        wallet[k]--;
        cost -= d;
        ops++;
        ops_spend++;
        break;
      }
      // partially spend and then refresh
      ops++;
      ops_spend++;
      let r = d - cost;
      ops_refresh++;
      wallet[k]--;
      withdraw(r, true);
      cost = 0;
    }
  }
}

function spendLargestFirst(cost) {
  while (cost != 0) {
    for (let j = 0; j < denoms.length; j++) {
      const d = denoms[j];
      const w = wallet[j];
      if (w == 0) {
        continue;
      }
      if (d <= cost) {
        // spend
        wallet[j]--;
        cost -= d;
        ops++;
        ops_spend++;
        break;
      }
      // partially spend and then refresh
      ops++;
      ops_spend++;
      let r = d - cost;
      ops_refresh++;
      wallet[j]--;
      withdraw(r, true);
      cost = 0;
    }
  }
}

function spendHybrid(cost) {
    for (let j = 0; j < denoms.length; j++) {
      const k = denoms.length - j - 1;
      const d = denoms[k];
      const w = wallet[k];
      if (w == 0) {
        continue;
      }
      if (d < cost) {
        continue;
      }
      // partially spend and then refresh
      ops++;
      ops_spend++;
      let r = d - cost;
      ops_refresh++;
      wallet[k]--;
      withdraw(r, true);
      cost = 0;
    }

  spendSmallestFirst(cost);
}

for (let i = 0; i < num_transactions; i++) {
  // check existing wallet balance
  let balance = 0;
  for (let j = 0; j < denoms.length; j++) {
    balance += wallet[j] * denoms[j]
  }
  // choose how much we want to spend
  let cost = getRandomInt(trans_min, trans_max);
  if (balance < cost) {
    // we need to withdraw
    let amount = getRandomInt(cost - balance, withdraw_max);
    withdraw(amount, false);
  }

  // check that we now have enough balance
  balance = 0;
  for (let j = 0; j < denoms.length; j++) {
    balance += wallet[j] * denoms[j]
  }

  if (balance < cost) {
    throw Error("not enough balance");
  }

  // now we spend
  spendHybrid(cost);
}

console.log("total ops", ops / num_transactions);
console.log("spend ops", ops_spend / num_transactions);
console.log("pure withdraw ops", ops_withdraw / num_transactions);
console.log("refresh (multi output) ops", ops_refresh / num_transactions);
console.log("refresh output", refresh_output / ops_refresh);
