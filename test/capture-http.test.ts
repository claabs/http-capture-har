/* eslint-disable global-require */
/* eslint-disable @typescript-eslint/no-var-requires */
import fs from 'fs';

describe('it should capture http requests globally', () => {
  beforeEach(() => {
    jest.resetModules();
  });
  it('should output a har file on requests', async () => {
    if (fs.existsSync('test2.har')) fs.unlinkSync('test2.har');
    const { captureHTTPsGlobal } = await import('../src/capture-http');
    const http = require('http'); // Have to use require here. `import()` adds redefinition restrictions on module functs that prevents patching
    const https = require('https');
    captureHTTPsGlobal(http, 'test1.har');
    captureHTTPsGlobal(https, 'test2.har');
    const axios = (await import('axios')).default;

    await axios.get('https://www.example.com');
    const exists = fs.existsSync('test2.har');
    expect(exists).toBeTruthy();
  });
});
