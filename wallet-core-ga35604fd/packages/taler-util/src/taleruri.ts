/*
 This file is part of GNU Taler
 (C) 2019-2020 Taler Systems S.A.

 GNU Taler is free software; you can redistribute it and/or modify it under the
 terms of the GNU General Public License as published by the Free Software
 Foundation; either version 3, or (at your option) any later version.

 GNU Taler is distributed in the hope that it will be useful, but WITHOUT ANY
 WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR
 A PARTICULAR PURPOSE.  See the GNU General Public License for more details.

 You should have received a copy of the GNU General Public License along with
 GNU Taler; see the file COPYING.  If not, see <http://www.gnu.org/licenses/>
 */

import { canonicalizeBaseUrl } from "./helpers.js";
import { URLSearchParams } from "./url.js";

export interface PayUriResult {
  merchantBaseUrl: string;
  orderId: string;
  sessionId: string;
  claimToken: string | undefined;
  noncePriv: string | undefined;
}

export interface WithdrawUriResult {
  bankIntegrationApiBaseUrl: string;
  withdrawalOperationId: string;
}

export interface RefundUriResult {
  merchantBaseUrl: string;
  orderId: string;
}

export interface TipUriResult {
  merchantTipId: string;
  merchantBaseUrl: string;
}

/**
 * Parse a taler[+http]://withdraw URI.
 * Return undefined if not passed a valid URI.
 */
export function parseWithdrawUri(s: string): WithdrawUriResult | undefined {
  const pi = parseProtoInfo(s, "withdraw");
  if (!pi) {
    return undefined;
  }
  const parts = pi.rest.split("/");

  if (parts.length < 2) {
    return undefined;
  }

  const host = parts[0].toLowerCase();
  const pathSegments = parts.slice(1, parts.length - 1);
  /**
   * The statement below does not tolerate a slash-ended URI.
   * This results in (1) the withdrawalId being passed as the
   * empty string, and (2) the bankIntegrationApi ending with the
   * actual withdrawal operation ID.  That can be fixed by
   * trimming the parts-list.  FIXME
   */
  const withdrawId = parts[parts.length - 1];
  const p = [host, ...pathSegments].join("/");

  return {
    bankIntegrationApiBaseUrl: canonicalizeBaseUrl(`${pi.innerProto}://${p}/`),
    withdrawalOperationId: withdrawId,
  };
}

export enum TalerUriType {
  TalerPay = "taler-pay",
  TalerWithdraw = "taler-withdraw",
  TalerTip = "taler-tip",
  TalerRefund = "taler-refund",
  TalerNotifyReserve = "taler-notify-reserve",
  Unknown = "unknown",
}

/**
 * Classify a taler:// URI.
 */
export function classifyTalerUri(s: string): TalerUriType {
  const sl = s.toLowerCase();
  if (sl.startsWith("taler://pay/")) {
    return TalerUriType.TalerPay;
  }
  if (sl.startsWith("taler+http://pay/")) {
    return TalerUriType.TalerPay;
  }
  if (sl.startsWith("taler://tip/")) {
    return TalerUriType.TalerTip;
  }
  if (sl.startsWith("taler+http://tip/")) {
    return TalerUriType.TalerTip;
  }
  if (sl.startsWith("taler://refund/")) {
    return TalerUriType.TalerRefund;
  }
  if (sl.startsWith("taler+http://refund/")) {
    return TalerUriType.TalerRefund;
  }
  if (sl.startsWith("taler://withdraw/")) {
    return TalerUriType.TalerWithdraw;
  }
  if (sl.startsWith("taler+http://withdraw/")) {
    return TalerUriType.TalerWithdraw;
  }
  if (sl.startsWith("taler://notify-reserve/")) {
    return TalerUriType.TalerNotifyReserve;
  }
  return TalerUriType.Unknown;
}

interface TalerUriProtoInfo {
  innerProto: "http" | "https";
  rest: string;
}

function parseProtoInfo(
  s: string,
  action: string,
): TalerUriProtoInfo | undefined {
  const pfxPlain = `taler://${action}/`;
  const pfxHttp = `taler+http://${action}/`;
  if (s.toLowerCase().startsWith(pfxPlain)) {
    return {
      innerProto: "https",
      rest: s.substring(pfxPlain.length),
    };
  } else if (s.toLowerCase().startsWith(pfxHttp)) {
    return {
      innerProto: "http",
      rest: s.substring(pfxHttp.length),
    };
  } else {
    return undefined;
  }
}

/**
 * Parse a taler[+http]://pay URI.
 * Return undefined if not passed a valid URI.
 */
export function parsePayUri(s: string): PayUriResult | undefined {
  const pi = parseProtoInfo(s, "pay");
  if (!pi) {
    return undefined;
  }
  const c = pi?.rest.split("?");
  const q = new URLSearchParams(c[1] ?? "");
  const claimToken = q.get("c") ?? undefined;
  const noncePriv = q.get("n") ?? undefined;
  const parts = c[0].split("/");
  if (parts.length < 3) {
    return undefined;
  }
  const host = parts[0].toLowerCase();
  const sessionId = parts[parts.length - 1];
  const orderId = parts[parts.length - 2];
  const pathSegments = parts.slice(1, parts.length - 2);
  const p = [host, ...pathSegments].join("/");
  const merchantBaseUrl = canonicalizeBaseUrl(`${pi.innerProto}://${p}/`);

  return {
    merchantBaseUrl,
    orderId,
    sessionId: sessionId,
    claimToken,
    noncePriv,
  };
}

/**
 * Parse a taler[+http]://tip URI.
 * Return undefined if not passed a valid URI.
 */
export function parseTipUri(s: string): TipUriResult | undefined {
  const pi = parseProtoInfo(s, "tip");
  if (!pi) {
    return undefined;
  }
  const c = pi?.rest.split("?");
  const parts = c[0].split("/");
  if (parts.length < 2) {
    return undefined;
  }
  const host = parts[0].toLowerCase();
  const tipId = parts[parts.length - 1];
  const pathSegments = parts.slice(1, parts.length - 1);
  const p = [host, ...pathSegments].join("/");
  const merchantBaseUrl = canonicalizeBaseUrl(`${pi.innerProto}://${p}/`);

  return {
    merchantBaseUrl,
    merchantTipId: tipId,
  };
}

/**
 * Parse a taler[+http]://refund URI.
 * Return undefined if not passed a valid URI.
 */
export function parseRefundUri(s: string): RefundUriResult | undefined {
  const pi = parseProtoInfo(s, "refund");
  if (!pi) {
    return undefined;
  }
  const c = pi?.rest.split("?");
  const parts = c[0].split("/");
  if (parts.length < 3) {
    return undefined;
  }
  const host = parts[0].toLowerCase();
  const sessionId = parts[parts.length - 1];
  const orderId = parts[parts.length - 2];
  const pathSegments = parts.slice(1, parts.length - 2);
  const p = [host, ...pathSegments].join("/");
  const merchantBaseUrl = canonicalizeBaseUrl(`${pi.innerProto}://${p}/`);

  return {
    merchantBaseUrl,
    orderId,
  };
}
