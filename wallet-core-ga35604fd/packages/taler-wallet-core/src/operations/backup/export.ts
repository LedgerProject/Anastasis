/*
 This file is part of GNU Taler
 (C) 2020 Taler Systems SA

 GNU Taler is free software; you can redistribute it and/or modify it under the
 terms of the GNU General Public License as published by the Free Software
 Foundation; either version 3, or (at your option) any later version.

 GNU Taler is distributed in the hope that it will be useful, but WITHOUT ANY
 WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR
 A PARTICULAR PURPOSE.  See the GNU General Public License for more details.

 You should have received a copy of the GNU General Public License along with
 GNU Taler; see the file COPYING.  If not, see <http://www.gnu.org/licenses/>
 */

/**
 * Implementation of wallet backups (export/import/upload) and sync
 * server management.
 *
 * @author Florian Dold <dold@taler.net>
 */

/**
 * Imports.
 */
import {
  Amounts,
  BackupBackupProvider,
  BackupBackupProviderTerms,
  BackupCoin,
  BackupCoinSource,
  BackupCoinSourceType,
  BackupDenomination,
  BackupExchange,
  BackupExchangeDetails,
  BackupExchangeWireFee,
  BackupProposal,
  BackupProposalStatus,
  BackupPurchase,
  BackupRecoupGroup,
  BackupRefreshGroup,
  BackupRefreshOldCoin,
  BackupRefreshSession,
  BackupRefundItem,
  BackupRefundState,
  BackupReserve,
  BackupTip,
  BackupWithdrawalGroup,
  canonicalizeBaseUrl,
  canonicalJson,
  getTimestampNow,
  Logger,
  timestampToIsoString,
  WalletBackupContentV1,
  hash,
  encodeCrock,
  getRandomBytes,
  stringToBytes,
} from "@gnu-taler/taler-util";
import { InternalWalletState } from "../../common.js";
import {
  AbortStatus,
  CoinSourceType,
  CoinStatus,
  ProposalStatus,
  RefreshCoinStatus,
  RefundState,
  WALLET_BACKUP_STATE_KEY,
} from "../../db.js";
import { getWalletBackupState, provideBackupState } from "./state.js";

const logger = new Logger("backup/export.ts");

export async function exportBackup(
  ws: InternalWalletState,
): Promise<WalletBackupContentV1> {
  await provideBackupState(ws);
  return ws.db
    .mktx((x) => ({
      config: x.config,
      exchanges: x.exchanges,
      exchangeDetails: x.exchangeDetails,
      coins: x.coins,
      denominations: x.denominations,
      purchases: x.purchases,
      proposals: x.proposals,
      refreshGroups: x.refreshGroups,
      backupProviders: x.backupProviders,
      tips: x.tips,
      recoupGroups: x.recoupGroups,
      reserves: x.reserves,
      withdrawalGroups: x.withdrawalGroups,
    }))
    .runReadWrite(async (tx) => {
      const bs = await getWalletBackupState(ws, tx);

      const backupExchangeDetails: BackupExchangeDetails[] = [];
      const backupExchanges: BackupExchange[] = [];
      const backupCoinsByDenom: { [dph: string]: BackupCoin[] } = {};
      const backupDenominationsByExchange: {
        [url: string]: BackupDenomination[];
      } = {};
      const backupReservesByExchange: { [url: string]: BackupReserve[] } = {};
      const backupPurchases: BackupPurchase[] = [];
      const backupProposals: BackupProposal[] = [];
      const backupRefreshGroups: BackupRefreshGroup[] = [];
      const backupBackupProviders: BackupBackupProvider[] = [];
      const backupTips: BackupTip[] = [];
      const backupRecoupGroups: BackupRecoupGroup[] = [];
      const withdrawalGroupsByReserve: {
        [reservePub: string]: BackupWithdrawalGroup[];
      } = {};

      await tx.withdrawalGroups.iter().forEachAsync(async (wg) => {
        const withdrawalGroups = (withdrawalGroupsByReserve[
          wg.reservePub
        ] ??= []);
        withdrawalGroups.push({
          raw_withdrawal_amount: Amounts.stringify(wg.rawWithdrawalAmount),
          selected_denoms: wg.denomsSel.selectedDenoms.map((x) => ({
            count: x.count,
            denom_pub_hash: x.denomPubHash,
          })),
          timestamp_created: wg.timestampStart,
          timestamp_finish: wg.timestampFinish,
          withdrawal_group_id: wg.withdrawalGroupId,
          secret_seed: wg.secretSeed,
          selected_denoms_id: wg.denomSelUid,
        });
      });

      await tx.reserves.iter().forEach((reserve) => {
        const backupReserve: BackupReserve = {
          initial_selected_denoms: reserve.initialDenomSel.selectedDenoms.map(
            (x) => ({
              count: x.count,
              denom_pub_hash: x.denomPubHash,
            }),
          ),
          initial_withdrawal_group_id: reserve.initialWithdrawalGroupId,
          instructed_amount: Amounts.stringify(reserve.instructedAmount),
          reserve_priv: reserve.reservePriv,
          timestamp_created: reserve.timestampCreated,
          withdrawal_groups:
            withdrawalGroupsByReserve[reserve.reservePub] ?? [],
          // FIXME!
          timestamp_last_activity: reserve.timestampCreated,
        };
        const backupReserves = (backupReservesByExchange[
          reserve.exchangeBaseUrl
        ] ??= []);
        backupReserves.push(backupReserve);
      });

      await tx.tips.iter().forEach((tip) => {
        backupTips.push({
          exchange_base_url: tip.exchangeBaseUrl,
          merchant_base_url: tip.merchantBaseUrl,
          merchant_tip_id: tip.merchantTipId,
          wallet_tip_id: tip.walletTipId,
          secret_seed: tip.secretSeed,
          selected_denoms: tip.denomsSel.selectedDenoms.map((x) => ({
            count: x.count,
            denom_pub_hash: x.denomPubHash,
          })),
          timestamp_finished: tip.pickedUpTimestamp,
          timestamp_accepted: tip.acceptedTimestamp,
          timestamp_created: tip.createdTimestamp,
          timestamp_expiration: tip.tipExpiration,
          tip_amount_raw: Amounts.stringify(tip.tipAmountRaw),
          selected_denoms_uid: tip.denomSelUid,
        });
      });

      await tx.recoupGroups.iter().forEach((recoupGroup) => {
        backupRecoupGroups.push({
          recoup_group_id: recoupGroup.recoupGroupId,
          timestamp_created: recoupGroup.timestampStarted,
          timestamp_finish: recoupGroup.timestampFinished,
          coins: recoupGroup.coinPubs.map((x, i) => ({
            coin_pub: x,
            recoup_finished: recoupGroup.recoupFinishedPerCoin[i],
            old_amount: Amounts.stringify(recoupGroup.oldAmountPerCoin[i]),
          })),
        });
      });

      await tx.backupProviders.iter().forEach((bp) => {
        let terms: BackupBackupProviderTerms | undefined;
        if (bp.terms) {
          terms = {
            annual_fee: Amounts.stringify(bp.terms.annualFee),
            storage_limit_in_megabytes: bp.terms.storageLimitInMegabytes,
            supported_protocol_version: bp.terms.supportedProtocolVersion,
          };
        }
        backupBackupProviders.push({
          terms,
          base_url: canonicalizeBaseUrl(bp.baseUrl),
          pay_proposal_ids: bp.paymentProposalIds,
          uids: bp.uids,
        });
      });

      await tx.coins.iter().forEach((coin) => {
        let bcs: BackupCoinSource;
        switch (coin.coinSource.type) {
          case CoinSourceType.Refresh:
            bcs = {
              type: BackupCoinSourceType.Refresh,
              old_coin_pub: coin.coinSource.oldCoinPub,
            };
            break;
          case CoinSourceType.Tip:
            bcs = {
              type: BackupCoinSourceType.Tip,
              coin_index: coin.coinSource.coinIndex,
              wallet_tip_id: coin.coinSource.walletTipId,
            };
            break;
          case CoinSourceType.Withdraw:
            bcs = {
              type: BackupCoinSourceType.Withdraw,
              coin_index: coin.coinSource.coinIndex,
              reserve_pub: coin.coinSource.reservePub,
              withdrawal_group_id: coin.coinSource.withdrawalGroupId,
            };
            break;
        }

        const coins = (backupCoinsByDenom[coin.denomPubHash] ??= []);
        coins.push({
          blinding_key: coin.blindingKey,
          coin_priv: coin.coinPriv,
          coin_source: bcs,
          current_amount: Amounts.stringify(coin.currentAmount),
          fresh: coin.status === CoinStatus.Fresh,
          denom_sig: coin.denomSig,
        });
      });

      await tx.denominations.iter().forEach((denom) => {
        const backupDenoms = (backupDenominationsByExchange[
          denom.exchangeBaseUrl
        ] ??= []);
        backupDenoms.push({
          coins: backupCoinsByDenom[denom.denomPubHash] ?? [],
          denom_pub: denom.denomPub,
          fee_deposit: Amounts.stringify(denom.feeDeposit),
          fee_refresh: Amounts.stringify(denom.feeRefresh),
          fee_refund: Amounts.stringify(denom.feeRefund),
          fee_withdraw: Amounts.stringify(denom.feeWithdraw),
          is_offered: denom.isOffered,
          is_revoked: denom.isRevoked,
          master_sig: denom.masterSig,
          stamp_expire_deposit: denom.stampExpireDeposit,
          stamp_expire_legal: denom.stampExpireLegal,
          stamp_expire_withdraw: denom.stampExpireWithdraw,
          stamp_start: denom.stampStart,
          value: Amounts.stringify(denom.value),
          list_issue_date: denom.listIssueDate,
        });
      });

      await tx.exchanges.iter().forEachAsync(async (ex) => {
        const dp = ex.detailsPointer;
        if (!dp) {
          return;
        }
        backupExchanges.push({
          base_url: ex.baseUrl,
          currency: dp.currency,
          master_public_key: dp.masterPublicKey,
          update_clock: dp.updateClock,
        });
      });

      await tx.exchangeDetails.iter().forEachAsync(async (ex) => {
        // Only back up permanently added exchanges.

        const wi = ex.wireInfo;
        const wireFees: BackupExchangeWireFee[] = [];

        Object.keys(wi.feesForType).forEach((x) => {
          for (const f of wi.feesForType[x]) {
            wireFees.push({
              wire_type: x,
              closing_fee: Amounts.stringify(f.closingFee),
              end_stamp: f.endStamp,
              sig: f.sig,
              start_stamp: f.startStamp,
              wire_fee: Amounts.stringify(f.wireFee),
            });
          }
        });

        backupExchangeDetails.push({
          base_url: ex.exchangeBaseUrl,
          reserve_closing_delay: ex.reserveClosingDelay,
          accounts: ex.wireInfo.accounts.map((x) => ({
            payto_uri: x.payto_uri,
            master_sig: x.master_sig,
          })),
          auditors: ex.auditors.map((x) => ({
            auditor_pub: x.auditor_pub,
            auditor_url: x.auditor_url,
            denomination_keys: x.denomination_keys,
          })),
          master_public_key: ex.masterPublicKey,
          currency: ex.currency,
          protocol_version: ex.protocolVersion,
          wire_fees: wireFees,
          signing_keys: ex.signingKeys.map((x) => ({
            key: x.key,
            master_sig: x.master_sig,
            stamp_end: x.stamp_end,
            stamp_expire: x.stamp_expire,
            stamp_start: x.stamp_start,
          })),
          tos_accepted_etag: ex.termsOfServiceAcceptedEtag,
          tos_accepted_timestamp: ex.termsOfServiceAcceptedTimestamp,
          denominations:
            backupDenominationsByExchange[ex.exchangeBaseUrl] ?? [],
          reserves: backupReservesByExchange[ex.exchangeBaseUrl] ?? [],
        });
      });

      const purchaseProposalIdSet = new Set<string>();

      await tx.purchases.iter().forEach((purch) => {
        const refunds: BackupRefundItem[] = [];
        purchaseProposalIdSet.add(purch.proposalId);
        for (const refundKey of Object.keys(purch.refunds)) {
          const ri = purch.refunds[refundKey];
          const common = {
            coin_pub: ri.coinPub,
            execution_time: ri.executionTime,
            obtained_time: ri.obtainedTime,
            refund_amount: Amounts.stringify(ri.refundAmount),
            rtransaction_id: ri.rtransactionId,
            total_refresh_cost_bound: Amounts.stringify(
              ri.totalRefreshCostBound,
            ),
          };
          switch (ri.type) {
            case RefundState.Applied:
              refunds.push({ type: BackupRefundState.Applied, ...common });
              break;
            case RefundState.Failed:
              refunds.push({ type: BackupRefundState.Failed, ...common });
              break;
            case RefundState.Pending:
              refunds.push({ type: BackupRefundState.Pending, ...common });
              break;
          }
        }

        backupPurchases.push({
          contract_terms_raw: purch.download.contractTermsRaw,
          auto_refund_deadline: purch.autoRefundDeadline,
          merchant_pay_sig: purch.merchantPaySig,
          pay_coins: purch.payCoinSelection.coinPubs.map((x, i) => ({
            coin_pub: x,
            contribution: Amounts.stringify(
              purch.payCoinSelection.coinContributions[i],
            ),
          })),
          proposal_id: purch.proposalId,
          refunds,
          timestamp_accept: purch.timestampAccept,
          timestamp_first_successful_pay: purch.timestampFirstSuccessfulPay,
          abort_status:
            purch.abortStatus === AbortStatus.None
              ? undefined
              : purch.abortStatus,
          nonce_priv: purch.noncePriv,
          merchant_sig: purch.download.contractData.merchantSig,
          total_pay_cost: Amounts.stringify(purch.totalPayCost),
          pay_coins_uid: purch.payCoinSelectionUid,
        });
      });

      await tx.proposals.iter().forEach((prop) => {
        if (purchaseProposalIdSet.has(prop.proposalId)) {
          return;
        }
        let propStatus: BackupProposalStatus;
        switch (prop.proposalStatus) {
          case ProposalStatus.ACCEPTED:
            return;
          case ProposalStatus.DOWNLOADING:
          case ProposalStatus.PROPOSED:
            propStatus = BackupProposalStatus.Proposed;
            break;
          case ProposalStatus.PERMANENTLY_FAILED:
            propStatus = BackupProposalStatus.PermanentlyFailed;
            break;
          case ProposalStatus.REFUSED:
            propStatus = BackupProposalStatus.Refused;
            break;
          case ProposalStatus.REPURCHASE:
            propStatus = BackupProposalStatus.Repurchase;
            break;
        }
        backupProposals.push({
          claim_token: prop.claimToken,
          nonce_priv: prop.noncePriv,
          proposal_id: prop.noncePriv,
          proposal_status: propStatus,
          repurchase_proposal_id: prop.repurchaseProposalId,
          timestamp: prop.timestamp,
          contract_terms_raw: prop.download?.contractTermsRaw,
          download_session_id: prop.downloadSessionId,
          merchant_base_url: prop.merchantBaseUrl,
          order_id: prop.orderId,
          merchant_sig: prop.download?.contractData.merchantSig,
        });
      });

      await tx.refreshGroups.iter().forEach((rg) => {
        const oldCoins: BackupRefreshOldCoin[] = [];

        for (let i = 0; i < rg.oldCoinPubs.length; i++) {
          let refreshSession: BackupRefreshSession | undefined;
          const s = rg.refreshSessionPerCoin[i];
          if (s) {
            refreshSession = {
              new_denoms: s.newDenoms.map((x) => ({
                count: x.count,
                denom_pub_hash: x.denomPubHash,
              })),
              session_secret_seed: s.sessionSecretSeed,
              noreveal_index: s.norevealIndex,
            };
          }
          oldCoins.push({
            coin_pub: rg.oldCoinPubs[i],
            estimated_output_amount: Amounts.stringify(
              rg.estimatedOutputPerCoin[i],
            ),
            finished: rg.statusPerCoin[i] === RefreshCoinStatus.Finished,
            input_amount: Amounts.stringify(rg.inputPerCoin[i]),
            refresh_session: refreshSession,
          });
        }

        backupRefreshGroups.push({
          reason: rg.reason as any,
          refresh_group_id: rg.refreshGroupId,
          timestamp_created: rg.timestampCreated,
          timestamp_finish: rg.timestampFinished,
          old_coins: oldCoins,
        });
      });

      const ts = getTimestampNow();

      if (!bs.lastBackupTimestamp) {
        bs.lastBackupTimestamp = ts;
      }

      const backupBlob: WalletBackupContentV1 = {
        schema_id: "gnu-taler-wallet-backup-content",
        schema_version: 1,
        exchanges: backupExchanges,
        exchange_details: backupExchangeDetails,
        wallet_root_pub: bs.walletRootPub,
        backup_providers: backupBackupProviders,
        current_device_id: bs.deviceId,
        proposals: backupProposals,
        purchases: backupPurchases,
        recoup_groups: backupRecoupGroups,
        refresh_groups: backupRefreshGroups,
        tips: backupTips,
        timestamp: bs.lastBackupTimestamp,
        trusted_auditors: {},
        trusted_exchanges: {},
        intern_table: {},
        error_reports: [],
        tombstones: [],
      };

      // If the backup changed, we change our nonce and timestamp.

      let h = encodeCrock(hash(stringToBytes(canonicalJson(backupBlob))));
      if (h !== bs.lastBackupPlainHash) {
        logger.trace(
          `plain backup hash changed (from ${bs.lastBackupPlainHash}to ${h})`,
        );
        bs.lastBackupTimestamp = ts;
        backupBlob.timestamp = ts;
        bs.lastBackupPlainHash = encodeCrock(
          hash(stringToBytes(canonicalJson(backupBlob))),
        );
        bs.lastBackupNonce = encodeCrock(getRandomBytes(32));
        logger.trace(
          `setting timestamp to ${timestampToIsoString(ts)} and nonce to ${
            bs.lastBackupNonce
          }`,
        );
        await tx.config.put({
          key: WALLET_BACKUP_STATE_KEY,
          value: bs,
        });
      } else {
        logger.trace("backup hash did not change");
      }

      return backupBlob;
    });
}
