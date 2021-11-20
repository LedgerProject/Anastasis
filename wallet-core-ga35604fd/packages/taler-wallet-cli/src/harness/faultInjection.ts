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

/**
 * Fault injection proxy.
 *
 * @author Florian Dold <dold@taler.net>
 */

/**
 * Imports
 */
import * as http from "http";
import { URL } from "url";
import {
  GlobalTestState,
  ExchangeService,
  ExchangeServiceInterface,
  MerchantServiceInterface,
  MerchantService,
} from "../harness/harness.js";

export interface FaultProxyConfig {
  inboundPort: number;
  targetPort: number;
}

/**
 * Fault injection context.  Modified by fault injection functions.
 */
export interface FaultInjectionRequestContext {
  requestUrl: string;
  method: string;
  requestHeaders: Record<string, string | string[] | undefined>;
  requestBody?: Buffer;
  dropRequest: boolean;
}

export interface FaultInjectionResponseContext {
  request: FaultInjectionRequestContext;
  statusCode: number;
  responseHeaders: Record<string, string | string[] | undefined>;
  responseBody: Buffer | undefined;
  dropResponse: boolean;
}

export interface FaultSpec {
  modifyRequest?: (ctx: FaultInjectionRequestContext) => Promise<void>;
  modifyResponse?: (ctx: FaultInjectionResponseContext) => Promise<void>;
}

export class FaultProxy {
  constructor(
    private globalTestState: GlobalTestState,
    private faultProxyConfig: FaultProxyConfig,
  ) {}

  private currentFaultSpecs: FaultSpec[] = [];

  start() {
    const server = http.createServer((req, res) => {
      const requestChunks: Buffer[] = [];
      const requestUrl = `http://localhost:${this.faultProxyConfig.inboundPort}${req.url}`;
      console.log("request for", new URL(requestUrl));
      req.on("data", (chunk) => {
        requestChunks.push(chunk);
      });
      req.on("end", async () => {
        console.log("end of data");
        let requestBuffer: Buffer | undefined;
        if (requestChunks.length > 0) {
          requestBuffer = Buffer.concat(requestChunks);
        }
        console.log("full request body", requestBuffer);

        const faultReqContext: FaultInjectionRequestContext = {
          dropRequest: false,
          method: req.method!!,
          requestHeaders: req.headers,
          requestUrl,
          requestBody: requestBuffer,
        };

        for (const faultSpec of this.currentFaultSpecs) {
          if (faultSpec.modifyRequest) {
            await faultSpec.modifyRequest(faultReqContext);
          }
        }

        if (faultReqContext.dropRequest) {
          res.destroy();
          return;
        }

        const faultedUrl = new URL(faultReqContext.requestUrl);

        const proxyRequest = http.request({
          method: faultReqContext.method,
          host: "localhost",
          port: this.faultProxyConfig.targetPort,
          path: faultedUrl.pathname + faultedUrl.search,
          headers: faultReqContext.requestHeaders,
        });

        console.log(
          `proxying request to target path '${
            faultedUrl.pathname + faultedUrl.search
          }'`,
        );

        if (faultReqContext.requestBody) {
          proxyRequest.write(faultReqContext.requestBody);
        }
        proxyRequest.end();
        proxyRequest.on("response", (proxyResp) => {
          console.log("gotten response from target", proxyResp.statusCode);
          const respChunks: Buffer[] = [];
          proxyResp.on("data", (proxyRespData) => {
            respChunks.push(proxyRespData);
          });
          proxyResp.on("end", async () => {
            console.log("end of target response");
            let responseBuffer: Buffer | undefined;
            if (respChunks.length > 0) {
              responseBuffer = Buffer.concat(respChunks);
            }
            const faultRespContext: FaultInjectionResponseContext = {
              request: faultReqContext,
              dropResponse: false,
              responseBody: responseBuffer,
              responseHeaders: proxyResp.headers,
              statusCode: proxyResp.statusCode!!,
            };
            for (const faultSpec of this.currentFaultSpecs) {
              const modResponse = faultSpec.modifyResponse;
              if (modResponse) {
                await modResponse(faultRespContext);
              }
            }
            if (faultRespContext.dropResponse) {
              req.destroy();
              return;
            }
            if (faultRespContext.responseBody) {
              // We must accommodate for potentially changed content length
              faultRespContext.responseHeaders[
                "content-length"
              ] = `${faultRespContext.responseBody.byteLength}`;
            }
            console.log("writing response head");
            res.writeHead(
              faultRespContext.statusCode,
              http.STATUS_CODES[faultRespContext.statusCode],
              faultRespContext.responseHeaders,
            );
            if (faultRespContext.responseBody) {
              res.write(faultRespContext.responseBody);
            }
            res.end();
          });
        });
      });
    });

    server.listen(this.faultProxyConfig.inboundPort);
    this.globalTestState.servers.push(server);
  }

  addFault(f: FaultSpec) {
    this.currentFaultSpecs.push(f);
  }

  clearAllFaults() {
    this.currentFaultSpecs = [];
  }
}

export class FaultInjectedExchangeService implements ExchangeServiceInterface {
  baseUrl: string;
  port: number;
  faultProxy: FaultProxy;

  get name(): string {
    return this.innerExchange.name;
  }

  get masterPub(): string {
    return this.innerExchange.masterPub;
  }

  private innerExchange: ExchangeService;

  constructor(
    t: GlobalTestState,
    e: ExchangeService,
    proxyInboundPort: number,
  ) {
    this.innerExchange = e;
    this.faultProxy = new FaultProxy(t, {
      inboundPort: proxyInboundPort,
      targetPort: e.port,
    });
    this.faultProxy.start();

    const exchangeUrl = new URL(e.baseUrl);
    exchangeUrl.port = `${proxyInboundPort}`;
    this.baseUrl = exchangeUrl.href;
    this.port = proxyInboundPort;
  }
}

export class FaultInjectedMerchantService implements MerchantServiceInterface {
  baseUrl: string;
  port: number;
  faultProxy: FaultProxy;

  get name(): string {
    return this.innerMerchant.name;
  }

  private innerMerchant: MerchantService;
  private inboundPort: number;

  constructor(
    t: GlobalTestState,
    m: MerchantService,
    proxyInboundPort: number,
  ) {
    this.innerMerchant = m;
    this.faultProxy = new FaultProxy(t, {
      inboundPort: proxyInboundPort,
      targetPort: m.port,
    });
    this.faultProxy.start();
    this.inboundPort = proxyInboundPort;
  }

  makeInstanceBaseUrl(instanceName?: string | undefined): string {
    const url = new URL(this.innerMerchant.makeInstanceBaseUrl(instanceName));
    url.port = `${this.inboundPort}`;
    return url.href;
  }
}
