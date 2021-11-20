/*
 This file is part of GNU Taler
 (C) 2021 Taler Systems S.A.

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
 *
 * @author Sebastian Javier Marchano (sebasjm)
 */

import { classifyTalerUri, TalerUriType } from "@gnu-taler/taler-util";
import { Fragment, h } from "preact";
import { ButtonPrimary, ButtonSuccess } from "../components/styled/index";

export interface Props {
  url: string;
  onDismiss: () => void;
}

export function TalerActionFound({ url, onDismiss }: Props) {
  const uriType = classifyTalerUri(url);
  return (
    <Fragment>
      <section>
        <h1>Taler Action </h1>
        {uriType === TalerUriType.TalerPay && (
          <div>
            <p>This page has pay action.</p>
            <ButtonSuccess
              onClick={() => {
                chrome.tabs.create({ url: actionForTalerUri(uriType, url) });
              }}
            >
              Open pay page
            </ButtonSuccess>
          </div>
        )}
        {uriType === TalerUriType.TalerWithdraw && (
          <div>
            <p>This page has a withdrawal action.</p>
            <ButtonSuccess
              onClick={() => {
                chrome.tabs.create({ url: actionForTalerUri(uriType, url) });
              }}
            >
              Open withdraw page
            </ButtonSuccess>
          </div>
        )}
        {uriType === TalerUriType.TalerTip && (
          <div>
            <p>This page has a tip action.</p>
            <ButtonSuccess
              onClick={() => {
                chrome.tabs.create({ url: actionForTalerUri(uriType, url) });
              }}
            >
              Open tip page
            </ButtonSuccess>
          </div>
        )}
        {uriType === TalerUriType.TalerNotifyReserve && (
          <div>
            <p>This page has a notify reserve action.</p>
            <ButtonSuccess
              onClick={() => {
                chrome.tabs.create({ url: actionForTalerUri(uriType, url) });
              }}
            >
              Notify
            </ButtonSuccess>
          </div>
        )}
        {uriType === TalerUriType.TalerRefund && (
          <div>
            <p>This page has a refund action.</p>
            <ButtonSuccess
              onClick={() => {
                chrome.tabs.create({ url: actionForTalerUri(uriType, url) });
              }}
            >
              Open refund page
            </ButtonSuccess>
          </div>
        )}
        {uriType === TalerUriType.Unknown && (
          <div>
            <p>This page has a malformed taler uri.</p>
            <p>{url}</p>
          </div>
        )}
      </section>
      <footer>
        <div />
        <ButtonPrimary onClick={() => onDismiss()}> Dismiss </ButtonPrimary>
      </footer>
    </Fragment>
  );
}

function actionForTalerUri(
  uriType: TalerUriType,
  talerUri: string,
): string | undefined {
  switch (uriType) {
    case TalerUriType.TalerWithdraw:
      return makeExtensionUrlWithParams("static/wallet.html#/withdraw", {
        talerWithdrawUri: talerUri,
      });
    case TalerUriType.TalerPay:
      return makeExtensionUrlWithParams("static/wallet.html#/pay", {
        talerPayUri: talerUri,
      });
    case TalerUriType.TalerTip:
      return makeExtensionUrlWithParams("static/wallet.html#/tip", {
        talerTipUri: talerUri,
      });
    case TalerUriType.TalerRefund:
      return makeExtensionUrlWithParams("static/wallet.html#/refund", {
        talerRefundUri: talerUri,
      });
    case TalerUriType.TalerNotifyReserve:
      // FIXME: implement
      break;
    default:
      console.warn(
        "Response with HTTP 402 has Taler header, but header value is not a taler:// URI.",
      );
      break;
  }
  return undefined;
}

function makeExtensionUrlWithParams(
  url: string,
  params?: { [name: string]: string | undefined },
): string {
  const innerUrl = new URL(chrome.extension.getURL("/" + url));
  if (params) {
    const hParams = Object.keys(params)
      .map((k) => `${k}=${params[k]}`)
      .join("&");
    innerUrl.hash = innerUrl.hash + "?" + hParams;
  }
  return innerUrl.href;
}
