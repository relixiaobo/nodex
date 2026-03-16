import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('server ai route source', () => {
  it('uses streamSimple so unified reasoning options reach provider adapters', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'server/src/routes/ai.ts'),
      'utf8',
    );

    expect(source).toContain(
      "import { streamSimple as piStream } from '@mariozechner/pi-ai';",
    );
    expect(source).not.toContain(
      "import { stream as piStream } from '@mariozechner/pi-ai';",
    );
    expect(source).toContain('const eventStream = piStream(model, context, {');
    expect(source).toContain('...streamOptions,');
  });
});
