// eslint-disable-next-line import/no-unresolved
import har from 'har-format';
import http from 'http';
import qs from 'qs';
import cookie from 'cookie';
// eslint-disable-next-line import/no-cycle
import HarWriter from './har-writer';
import { stripQueryStringFromPath } from './utils';

function httpToHarHeaders(httpHeaders: http.OutgoingHttpHeaders): har.Header[] {
  const harHeaders: har.Header[] = [];
  Object.entries(httpHeaders).forEach(([name, value]) => {
    if (typeof value === 'string') {
      harHeaders.push({ name, value });
    } else if (typeof value === 'number') {
      harHeaders.push({ name, value: value.toString() });
    } else if (Array.isArray(value)) {
      value.forEach((val) => {
        harHeaders.push({ name, value: val });
      });
    }
  });
  return harHeaders;
}

function queryStringToHarQueryString(queryString?: string): har.QueryString[] {
  const qsQueryString = queryString
    ? qs.parse(queryString, {
        depth: 0,
      })
    : undefined;
  const harQueryString: har.QueryString[] = [];
  if (qsQueryString) {
    Object.entries(qsQueryString).forEach(([name, _value]) => {
      const value = _value as string | string[] | undefined;
      if (Array.isArray(value)) {
        value.forEach((val) => {
          harQueryString.push({ name, value: val });
        });
      } else if (typeof value === 'string') {
        harQueryString.push({ name, value });
      } else {
        harQueryString.push({ name, value: '' });
      }
    });
  }
  return harQueryString;
}

function httpHeadersToHarCookie(cookies?: string | number | string[]): har.Cookie[] {
  let cookieString = '';
  if (!cookies) return [];
  if (Array.isArray(cookies)) {
    cookieString = cookies.join('; ');
  } else if (typeof cookies === 'string') {
    cookieString = cookies;
  }
  const cookieObj = cookie.parse(cookieString);
  const harCookies: har.Cookie[] = [];
  Object.entries(cookieObj).forEach(([name, value]) => {
    harCookies.push({ name, value });
  });
  return harCookies;
}

function assembleHarRequest(req: http.ClientRequest): har.Request {
  const queryString: string | undefined = req.path.split('?')[1];
  const httpCookies = req.getHeader('Cookie');
  return {
    url: `${req.protocol}//${req.getHeader('host')}${stripQueryStringFromPath(req.path)}`,
    headers: httpToHarHeaders(req.getHeaders()),
    httpVersion: '1.1',
    method: req.method,
    bodySize: -1,
    headersSize: -1,
    queryString: queryStringToHarQueryString(queryString),
    cookies: httpHeadersToHarCookie(httpCookies),
  };
}

function readResponseBody(res: http.IncomingMessage): string {
  // This doesn't work. How do we make it work without promises?
  const chunks: string[] = [];
  res.setEncoding('utf8');
  let chunk: string;
  // eslint-disable-next-line no-cond-assign
  while ((chunk = res.read()) !== null) {
    chunks.push(chunk);
  }
  return chunks.join('');
}

function assembleHarResponse(res: http.IncomingMessage): har.Response {
  const httpCookies = res.headers?.['set-cookie'];
  const bodySize = res.headers?.['content-length']
    ? parseInt(res.headers['content-length'], 10)
    : -1;
  return {
    redirectURL: res.headers?.location || '',
    status: res.statusCode as number,
    statusText: res.statusMessage as string,
    headers: httpToHarHeaders(res.headers),
    httpVersion: res.httpVersion,
    bodySize,
    headersSize: -1,
    content: {
      mimeType: res.headers?.['content-type'] || '',
      size: bodySize,
      text: readResponseBody(res),
    },
    cookies: httpHeadersToHarCookie(httpCookies),
  };
}

function generateEmptyResponse(): har.Response {
  return {
    bodySize: -1,
    content: {
      mimeType: '',
      size: -1,
    },
    cookies: [],
    headers: [],
    headersSize: -1,
    httpVersion: '',
    redirectURL: '',
    status: 503,
    statusText: 'Service Unavailable',
  };
}

function generateEmptyRequest(): har.Request {
  return {
    bodySize: -1,
    cookies: [],
    headers: [],
    headersSize: -1,
    httpVersion: '',
    method: 'GET',
    queryString: [],
    url: '',
  };
}

export default class RequestTracker {
  private harWriter: HarWriter;

  private hostname: string;

  private startDate: Date;

  private inProgressEntry: Omit<har.Entry, 'timings' | 'time'> | undefined;

  constructor(hostname: string, harWriter: HarWriter) {
    this.harWriter = harWriter;
    this.hostname = hostname;
    this.startDate = new Date();
  }

  public addRequestData(req: http.ClientRequest, res?: http.IncomingMessage): void {
    const response = res ? assembleHarResponse(res) : generateEmptyResponse();

    this.inProgressEntry = {
      startedDateTime: this.startDate.toISOString(),
      request: assembleHarRequest(req),
      response,
      cache: {},
    };
  }

  public close(err?: Error | string): void {
    const timeElapsed = new Date().valueOf() - this.startDate.valueOf();
    if (!this.inProgressEntry) {
      this.inProgressEntry = {
        startedDateTime: this.startDate.toISOString(),
        request: generateEmptyRequest(),
        response: generateEmptyResponse(),
        cache: {},
        comment: err?.toString(),
      };
    }
    const entry: har.Entry = {
      ...this.inProgressEntry,
      time: timeElapsed,
      timings: {
        receive: 0,
        wait: timeElapsed,
      },
    };

    this.harWriter.addEntry(entry);
  }
}
