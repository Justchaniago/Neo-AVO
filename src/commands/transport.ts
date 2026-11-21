import { request as httpRequest, type ClientRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import type { LookupFunction } from "node:net";

import { parseCommandEndpoint, resolveCommandAddresses } from "./endpoint";

export async function postCommand(endpoint: string, body: string, secret: string | null | undefined, allowPrivate = false): Promise<void> {
  const url = parseCommandEndpoint(endpoint, allowPrivate);
  await new Promise<void>((resolve, reject) => {
    let request: ClientRequest | undefined;
    let settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error); else resolve();
    };
    const timer = setTimeout(() => {
      const error = new Error("command_delivery_timeout");
      finish(error);
      request?.destroy(error);
    }, 10_000);
    const lookup: LookupFunction = (hostname, options, callback) => {
      resolveCommandAddresses(hostname, allowPrivate).then(
        (addresses) => callback(null, options.all ? addresses : addresses[0].address, addresses[0].family),
        (error: Error) => callback(error, ""),
      );
    };
    try {
      request = (url.protocol === "https:" ? httpsRequest : httpRequest)(url, {
        method: "POST", agent: false, lookup,
        headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body), ...(secret ? { authorization: `Bearer ${secret}` } : {}) },
      }, (response) => {
        response.on("error", finish);
        response.destroy();
        const status = response.statusCode ?? 0;
        finish(status >= 200 && status < 300 ? undefined : new Error(`external_project_http_${status}`));
      });
      request.once("error", finish);
      request.end(body);
    } catch (error) {
      finish(error instanceof Error ? error : new Error(String(error)));
      request?.destroy();
    }
  });
}
