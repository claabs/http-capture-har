/* eslint-disable no-continue */
/* eslint-disable no-param-reassign */
/**
 * Checks a HTTP response code, where 4xx are 'error' and 5xx are 'fault'.
 * @param {string} status - the HTTP response status code.
 * @returns [string] - 'error', 'fault' or nothing on no match
 * @alias module:utils.getCauseTypeFromHttpStatus
 */

export function getCauseTypeFromHttpStatus(
  status?: number | string
): 'error' | 'fault' | undefined {
  if (!status) return undefined;
  const stat = status.toString();
  if (stat.match(/^[4][0-9]{2}$/) !== null) return 'error';
  if (stat.match(/^[5][0-9]{2}$/) !== null) return 'fault';
  return undefined;
}

/**
 * Makes a shallow copy of an object without given keys - keeps prototype
 * @param {Object} obj - The object to copy
 * @param {string[]} [keys=[]] - The keys that won't be copied
 * @param {boolean} [preservePrototype=false] - If true also copy prototype properties
 * @returns {}
 */
// eslint-disable-next-line @typescript-eslint/ban-types
export function objectWithoutProperties<T extends object, K extends keyof T | string>(
  obj: T,
  keys: K[],
  preservePrototype?: boolean
): Omit<T, K> {
  keys = Array.isArray(keys) ? keys : [];
  preservePrototype = typeof preservePrototype === 'boolean' ? preservePrototype : false;
  const target = preservePrototype ? Object.create(Object.getPrototypeOf(obj)) : {};
  Object.entries(obj).forEach(([property, value]) => {
    const prop = property as K;
    if (!keys.includes(prop) && Object.prototype.hasOwnProperty.call(obj, property)) {
      target[property] = value;
    }
  });
  return target;
}

/**
 * Removes the query string parameters from a given http request path
 * as it may contain sensitive information
 *
 * Related issue: https://github.com/aws/aws-xray-sdk-node/issues/246
 *
 * Node documentation: https://nodejs.org/api/http.html#http_http_request_url_options_callback
 *
 * @param {string} path - options.path in a http.request callback
 * @returns [string] - removes query string element from path
 * @alias module:utils.stripQueryStringFromPath
 */
export function stripQueryStringFromPath(path: string): string {
  return path ? path.split('?')[0] : '';
}
