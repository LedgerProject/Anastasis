/*
 This file is part of GNU Taler
 (C) 2019 Taler Systems S.A.

 GNU Taler is free software; you can redistribute it and/or modify it under the
 terms of the GNU General Public License as published by the Free Software
 Foundation; either version 3, or (at your option) any later version.

 GNU Taler is distributed in the hope that it will be useful, but WITHOUT ANY
 WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS FOR
 A PARTICULAR PURPOSE.  See the GNU General Public License for more details.

 You should have received a copy of the GNU General Public License along with
 GNU Taler; see the file COPYING.  If not, see <http://www.gnu.org/licenses/>

 SPDX-License-Identifier: AGPL3.0-or-later
*/

/**
 * Imports.
 */
import {
  Headers,
  HttpRequestLibrary,
  HttpRequestOptions,
  HttpResponse,
} from "../util/http.js";
import { RequestThrottler } from "../util/RequestThrottler.js";
import Axios, { AxiosResponse } from "axios";
import { OperationFailedError, makeErrorDetails } from "../errors.js";
import { Logger, bytesToString } from "@gnu-taler/taler-util";
import { TalerErrorCode, URL } from "@gnu-taler/taler-util";

const logger = new Logger("NodeHttpLib.ts");

/**
 * Implementation of the HTTP request library interface for node.
 */
export class NodeHttpLib implements HttpRequestLibrary {
  private throttle = new RequestThrottler();
  private throttlingEnabled = true;

  /**
   * Set whether requests should be throttled.
   */
  setThrottling(enabled: boolean): void {
    this.throttlingEnabled = enabled;
  }

  async fetch(url: string, opt?: HttpRequestOptions): Promise<HttpResponse> {
    const method = opt?.method ?? "GET";
    let body = opt?.body;

    logger.trace(`Requesting ${method} ${url}`);

    const parsedUrl = new URL(url);
    if (this.throttlingEnabled && this.throttle.applyThrottle(url)) {
      throw OperationFailedError.fromCode(
        TalerErrorCode.WALLET_HTTP_REQUEST_THROTTLED,
        `request to origin ${parsedUrl.origin} was throttled`,
        {
          requestMethod: method,
          requestUrl: url,
          throttleStats: this.throttle.getThrottleStats(url),
        },
      );
    }
    let timeout: number | undefined;
    if (typeof opt?.timeout?.d_ms === "number") {
      timeout = opt.timeout.d_ms;
    }
    let resp: AxiosResponse;
    try {
      resp = await Axios({
        method,
        url: url,
        responseType: "arraybuffer",
        headers: opt?.headers,
        validateStatus: () => true,
        transformResponse: (x) => x,
        data: body,
        timeout,
        maxRedirects: 0,
      });
    } catch (e: any) {
      throw OperationFailedError.fromCode(
        TalerErrorCode.WALLET_NETWORK_ERROR,
        `${e.message}`,
        {
          requestUrl: url,
          requestMethod: method,
        },
      );
    }

    const makeText = async (): Promise<string> => {
      const respText = new Uint8Array(resp.data);
      return bytesToString(respText);
    };

    const makeJson = async (): Promise<any> => {
      let responseJson;
      const respText = await makeText();
      try {
        responseJson = JSON.parse(respText);
      } catch (e) {
        logger.trace(`invalid json: '${resp.data}'`);
        throw new OperationFailedError(
          makeErrorDetails(
            TalerErrorCode.WALLET_RECEIVED_MALFORMED_RESPONSE,
            "invalid JSON",
            {
              httpStatusCode: resp.status,
              requestUrl: url,
              requestMethod: method,
            },
          ),
        );
      }
      if (responseJson === null || typeof responseJson !== "object") {
        logger.trace(`invalid json (not an object): '${respText}'`);
        throw new OperationFailedError(
          makeErrorDetails(
            TalerErrorCode.WALLET_RECEIVED_MALFORMED_RESPONSE,
            "invalid JSON",
            {
              httpStatusCode: resp.status,
              requestUrl: url,
              requestMethod: method,
            },
          ),
        );
      }
      return responseJson;
    };
    const makeBytes = async () => {
      if (typeof resp.data.byteLength !== "number") {
        throw Error("expected array buffer");
      }
      const buf = resp.data;
      return buf;
    };
    const headers = new Headers();
    for (const hn of Object.keys(resp.headers)) {
      headers.set(hn, resp.headers[hn]);
    }
    return {
      requestUrl: url,
      requestMethod: method,
      headers,
      status: resp.status,
      text: makeText,
      json: makeJson,
      bytes: makeBytes,
    };
  }
  async get(url: string, opt?: HttpRequestOptions): Promise<HttpResponse> {
    return this.fetch(url, {
      method: "GET",
      ...opt,
    });
  }

  async postJson(
    url: string,
    body: any,
    opt?: HttpRequestOptions,
  ): Promise<HttpResponse> {
    return this.fetch(url, {
      method: "POST",
      body,
      ...opt,
    });
  }
}
