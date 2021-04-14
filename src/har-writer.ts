// eslint-disable-next-line import/no-unresolved
import { Har, Entry } from 'har-format';
import { writeFileSync } from 'fs';
// eslint-disable-next-line import/no-cycle
import RequestTracker from './request-tracker';

export default class HarWriter {
  private activeHar: Har;

  private filename: string;

  constructor(filename: string) {
    this.filename = filename;
    this.activeHar = {
      log: {
        version: '1.1',
        creator: {
          name: 'http-capture-har',
          version: '0.0.0', // TODO: version
        },
        entries: [],
      },
    };
    this.writeHar();
  }

  public beginRequest(hostname: string): RequestTracker {
    return new RequestTracker(hostname, this);
  }

  public addEntry(entry: Entry): void {
    this.activeHar.log.entries.push(entry);
    this.writeHar();
  }

  private writeHar() {
    writeFileSync(this.filename, JSON.stringify(this.activeHar), 'utf8');
  }
}
