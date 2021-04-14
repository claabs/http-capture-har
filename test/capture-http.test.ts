import fs from 'fs';

describe('it should capture http requests globally', () => {
  beforeEach(() => {
    jest.resetModules();
  });
  it('should output a har file on requests', async () => {
    const { captureHTTPsGlobal } = await import('../src/capture-http');
    const http = await import('http');
    const https = await import('https');
    captureHTTPsGlobal(http, 'test1.har');
    captureHTTPsGlobal(https, 'test2.har');
    const axios = await (await import('axios')).default;

    await axios.get('https://google.com');
    const exists = fs.existsSync('test1.har');
    expect(exists).toBeTruthy();
  });
});
