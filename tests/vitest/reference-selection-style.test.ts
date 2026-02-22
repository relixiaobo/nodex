import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('reference selected style', () => {
  const css = readFileSync(resolve(process.cwd(), 'src/assets/main.css'), 'utf8');

  it('renders selected reference frame as overlay to avoid layout shift', () => {
    expect(css).toMatch(/\.node-selected-ref\s*\{[\s\S]*position:\s*relative;/);
    expect(css).toMatch(/\.node-selected-ref::before\s*\{[\s\S]*position:\s*absolute;/);
    expect(css).toMatch(/\.node-selected-ref::before\s*\{[\s\S]*top:\s*-1px;/);
    expect(css).toMatch(/\.node-selected-ref::before\s*\{[\s\S]*left:\s*-6px;/);
    expect(css).toMatch(/\.node-selected-ref::before\s*\{[\s\S]*right:\s*-6px;/);
  });

  it('does not use padding/margin on the layout box', () => {
    const baseRule = css.match(/\.node-selected-ref\s*\{([\s\S]*?)\}/)?.[1] ?? '';
    expect(baseRule).not.toMatch(/padding\s*:/);
    expect(baseRule).not.toMatch(/margin\s*:/);
    expect(baseRule).not.toMatch(/border\s*:/);
  });
});
