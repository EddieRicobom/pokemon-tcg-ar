// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('arquivo de arte publicado', () => {
  it('corresponde pixel a pixel aos recortes atuais, sem empacotamento desatualizado', () => {
    const result = execFileSync(process.execPath, ['--experimental-strip-types', 'scripts/build-vila-atlas.mjs', '--check'], { encoding: 'utf8' });
    expect(result).toContain('atlas publicado corresponde');
  });
});
