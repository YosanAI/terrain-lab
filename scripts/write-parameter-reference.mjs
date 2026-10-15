/** Derive documentation directly from the schema used by the UI and validators. */
import { GENERATORS, EROSIONS } from '../src/ui/parameters.js';
import { writeFile } from 'node:fs/promises';
const lines = ['# Parameter reference', '',
  'Generated from `src/ui/parameters.js` using `npm run docs:parameters`.', '',
  'Every base generator also receives a string seed. The shared grid controls offer 128, 256 (default), or 512 segments, and a terrain size of 64–2048 world units (default 256). Base controls update live after a 180 ms pause using the current seed. Generate chooses a fresh random seed. Erosion settings take effect only after Apply. Bounded numeric controls use sliders with linked exact-value inputs.', '',
  'Conditional controls are hidden when irrelevant: ridge sharpness / gain for warped ridges only, blending outside hard Voronoi cells, sharpness for Voronoi ridges, and transition width for smooth faults.', ''];
for (const [group, definitions] of [['Base generators', GENERATORS], ['Erosion operations', EROSIONS]]) {
  lines.push(`## ${group}`, '');
  for (const [id, definition] of Object.entries(definitions)) {
    lines.push(`### ${definition.label} (\`${id}\`)`, '', definition.description, '',
      '| Control / API key | Default | Accepted values | Meaning / notes |',
      '| --- | --- | --- | --- |');
    for (const p of definition.params) {
      const values = p.type === 'select' ? p.options.map(([value, label]) => `\`${value}\`: ${label}`).join('; ')
        : p.type === 'text' ? 'String, truncated to 128 characters' : `${p.min}–${p.max}${p.step === 1 ? '; integer' : ''}`;
      lines.push(`| ${p.label} / \`${p.key}\` | ${p.default} | ${values} | ${p.help || (p.visible ? 'Conditionally displayed.' : '—')} |`);
    }
    lines.push('');
  }
}
await writeFile(new URL('../docs/PARAMETERS.md', import.meta.url), lines.join('\n') + '\n');
console.log('Updated docs/PARAMETERS.md');
