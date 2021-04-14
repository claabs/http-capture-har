/* eslint-disable import/prefer-default-export */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable prefer-destructuring */
/* eslint-disable no-param-reassign */
/* eslint-disable no-underscore-dangle */

import url from 'url';
import * as http from 'http';
import * as https from 'https';

import events from 'events';
import { objectWithoutProperties } from './utils';
import HarWriter from './har-writer';

// This typing nonsense from: https://stackoverflow.com/a/59538756/5037239
type Overloads<T> = T extends {
  (...args: infer A1): infer R1;
  (...args: infer A2): infer R2;
}
  ? [(...args: A1) => R1, (...args: A2) => R2]
  : T extends {
      (...args: infer A1): infer R1;
    }
  ? [(...args: A1) => R1]
  : any;

type OverloadedParameters<T> = Overloads<T> extends infer O
  ? { [K in keyof O]: Parameters<Extract<O[K], (...args: any) => any>> }
  : never;

type RequestParametersOverloads = OverloadedParameters<typeof http.request>;
type RequestParametersIntersect = RequestParametersOverloads[0] & RequestParametersOverloads[1];
type RequestParametersUnion = RequestParametersOverloads[0] | RequestParametersOverloads[1];
type RequestIntersectSignature = (
  ...args: RequestParametersOverloads[0] & RequestParametersOverloads[1]
) => http.ClientRequest;

interface CallbackRes extends http.IncomingMessage {
  req: http.ClientRequest;
}

type HttpModule = typeof http;
type HttpsModule = typeof https;
type UnpatchedHttpModules = HttpModule | HttpsModule;
interface PatchedHttpModule extends HttpModule {
  __request: RequestIntersectSignature;
  __get: RequestIntersectSignature;
}
interface PatchedHttpsModule extends HttpsModule {
  __request: RequestIntersectSignature;
  __get: RequestIntersectSignature;
}
type PatchedHttpModules = PatchedHttpModule | PatchedHttpsModule;

/**
 * Wraps the http/https.request() and .get() calls to automatically capture information for the segment.
 * This patches the built-in HTTP and HTTPS modules globally. If using a 3rd party HTTP library,
 * it should still use HTTP under the hood. Be sure to patch globally before requiring the 3rd party library.
 * 3rd party library compatibility is best effort. Some incompatibility issues may arise.
 * @param {http|https} module - The built in Node.js HTTP or HTTPS module.
 * @param {boolean} downstreamXRayEnabled - when true, adds a "traced:true" property to the subsegment
 *   so the AWS X-Ray service expects a corresponding segment from the downstream service.
 * @param {function} subsegmentCallback - a callback that is called with the subsegment, the Node.js
 *   http.ClientRequest, the Node.js http.IncomingMessage (if a response was received) and any error issued,
 *   allowing custom annotations and metadata to be added.
 *   to be added to the subsegment.
 * @alias module:http_p.captureHTTPsGlobal
 */

function enableCapture(
  module: PatchedHttpModules,
  harFile: string
  // subsegmentCallback?: HttpSubsegmentCallback
) {
  const captureOutgoingHTTPs = (
    baseFunc: (...args: RequestParametersIntersect) => http.ClientRequest,
    ...args: RequestParametersIntersect
  ) => {
    let options: http.ClientRequestArgs | url.URL | string;
    let callback: ((res: http.IncomingMessage) => void) | undefined;
    let hasUrl: boolean;
    let urlObj: http.RequestOptions | url.URL;

    if (typeof args[1] === 'object') {
      const args1 = args as RequestParametersOverloads[1];
      const arg0 = args1[0];
      hasUrl = true;
      urlObj = typeof arg0 === 'string' ? new url.URL(arg0) : arg0;
      options = args1[1];
      callback = args1[2];
    } else {
      const args0 = args as RequestParametersOverloads[0];
      const arg0 = args0[0];
      hasUrl = false;
      options = arg0;
      urlObj = options as http.RequestOptions | url.URL; // redundant, for Typescript
      callback = args0[1];
    }
    const arg0 = args[0];

    // Short circuit if the HTTP request has no options
    if (!options) {
      return baseFunc(...(args as any));
    }

    // Case of calling a string URL without options, e.g.: http.request('http://amazon.com', callback)
    if (typeof options === 'string') {
      options = new url.URL(options);
    }

    if (!hasUrl) {
      urlObj = options;
    }

    const hostname =
      options.hostname || options.host || urlObj.hostname || urlObj.host || 'Unknown host';

    const harWriter = new HarWriter(harFile);

    const requestTracker = harWriter.beginRequest(hostname);

    const errorCapturer = function errorCapturer(this: any, e: any) {
      // const madeItToDownstream = e.code !== 'ECONNREFUSED';

      requestTracker.addRequestData(this);
      requestTracker.close(e);
    };

    const optionsCopy = objectWithoutProperties(options, ['Segment'], true);

    const newCallback = (_res: http.IncomingMessage): void => {
      const res = _res as CallbackRes;
      res.on('end', () => {
        // const cause = getCauseTypeFromHttpStatus(res.statusCode);

        requestTracker.addRequestData(res.req, res);
        requestTracker.close();
      });

      if (typeof callback === 'function') {
        // if (contextUtils.isAutomaticMode()) {
        //   const session = contextUtils.getNamespace();

        //   session.run(function () {
        //     contextUtils.setSegment(subsegment);
        //     callback(res);
        //   });
        // } else {
        //   callback(res);
        // }
        callback(res);
        // if no callback provided by user application, AND no explicit response listener
        // added by user application, then we consume the response so the 'end' event fires
        // See: https://nodejs.org/api/http.html#http_class_http_clientrequest
      } else if (res.req && res.req.listenerCount('response') === 0) {
        res.resume();
      }
    };

    let funcArgs: RequestParametersUnion;
    if (hasUrl) {
      funcArgs = [arg0 as string | url.URL, optionsCopy, newCallback];
    } else {
      funcArgs = [options, newCallback];
    }

    const req = baseFunc(...(funcArgs as any));

    // Use errorMonitor if available (in Node 12.17+), otherwise fall back to standard error listener
    // See: https://nodejs.org/dist/latest-v12.x/docs/api/events.html#events_eventemitter_errormonitor
    req.on(events.errorMonitor, errorCapturer);

    return req;
  };

  module.__request = module.request;
  module.request = (function captureHTTPsRequest(...args: RequestParametersIntersect[]) {
    return captureOutgoingHTTPs(module.__request, ...(args as any));
  } as unknown) as typeof http.request;

  module.__get = module.get;
  module.get = (function captureHTTPsGet(...args: RequestParametersIntersect[]) {
    return captureOutgoingHTTPs(module.__get, ...(args as any));
  } as unknown) as typeof http.get;
}

/**
 * This module patches the HTTP and HTTPS node built-in libraries and returns a copy of the module with capture output enabled.
 */
export const captureHTTPsGlobal = (
  _module: UnpatchedHttpModules,
  harFile = 'captured-requests.har'
): void => {
  const module = _module as PatchedHttpModules;
  if (!module.__request) enableCapture(module, harFile);
};
