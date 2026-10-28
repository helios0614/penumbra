/** Run with: node node_modules/vite-node/vite-node.mjs tests/performance/chat-markdown-segmentation.ts
 * Synthetic CPU measurements only; does not contact a backend or render private content.
 */
import { performance } from 'node:perf_hooks';
import assert from 'node:assert/strict';
import { splitAssistantBubbles } from '../../src/components/chat/bubble-chunks';
import { hasVisibleText, parseBubbleMarkdown } from '../../src/components/chat/markdown-boundaries';

// Historical a2e4af2 scanner, for CPU comparison only. Its Markdown bugs remain
// intentional here; it is never used for rendering or semantic assertions.
function historicalScan(content: string): string[] {
  const parts: string[] = []; let current = '', fenceOpen = false;
  for (const line of content.replace(/\r\n?/g, '\n').split('\n')) {
    if (/^```/.test(line)) fenceOpen = !fenceOpen;
    if (!hasVisibleText(line) && !fenceOpen) { if (current) parts.push(current); current = ''; continue; }
    current += (current ? '\n' : '') + line;
  }
  if (current) parts.push(current);
  return parts.filter(chunk => hasVisibleText(chunk) && !['---', '***', '___'].includes(chunk.trim()));
}

const code = (lines: number) => '```ts\n' + Array.from({ length: lines }, (_, i) => `const synthetic${i} = ${i};\n`).join('\n') + '```';
const list = (items: number) => Array.from({ length: items }, (_, i) => `1. synthetic item ${i}\n\n   continuation ${i}`).join('\n\n');
const scenarios = [
  ['code-200', code(200)], ['code-800', code(800)], ['code-2400', code(2400)],
  ['list-50', list(50)], ['list-200', list(200)], ['list-800', list(800)],
] as const;
function measure(run: () => unknown, count = 25) {
  for (let i = 0; i < 5; i++) run();
  const times: number[] = [];
  for (let i = 0; i < count; i++) { const start = performance.now(); run(); times.push(performance.now() - start); }
  times.sort((a, b) => a - b);
  return { p50ms: +times[Math.floor(count * .5)].toFixed(3), p95ms: +times[Math.floor(count * .95)].toFixed(3) };
}
console.log('Full-prefix parse + boundary/visibility planning; same-node single process, 5 warmups + 25 samples.');
for (const [name, source] of scenarios) {
  assert.deepEqual(splitAssistantBubbles(source), [source]);
  console.log(JSON.stringify({ name, chars: source.length, historicalScan: measure(() => historicalScan(source)), parserOnly: measure(() => parseBubbleMarkdown(source)), split: measure(() => splitAssistantBubbles(source)) }));
}
const prose = Array(200).fill('Synthetic paragraph with **emphasis** and a [link](https://example.org).').join('\n\n');
assert.equal(splitAssistantBubbles(prose).length, 200);
console.log(JSON.stringify({ name: 'prose-200', chars: prose.length, historicalScan: measure(() => historicalScan(prose)), split: measure(() => splitAssistantBubbles(prose)) }));
for (const [name, complete] of [['code', code(200)], ['list', list(200)]] as const) {
  for (const size of [1, 16]) {
    // Character-by-character first 2000 chars, then small chunks through the full long content.
    const source = size === 1 ? complete.slice(0, 2000) : complete;
    const times: number[] = [], start = performance.now();
    for (let end = 1; end <= source.length; end += size) {
      const tick = performance.now(); splitAssistantBubbles(source.slice(0, end)); times.push(performance.now() - tick);
    }
    assert.deepEqual(splitAssistantBubbles(complete), [complete]);
    const totalMs = performance.now() - start; times.sort((a,b) => a-b);
    console.log(JSON.stringify({ name, chars: source.length, chunkSize: size, updates: times.length,
      totalMs: +totalMs.toFixed(1), p50ms: +times[Math.floor(times.length*.5)].toFixed(3), p95ms: +times[Math.floor(times.length*.95)].toFixed(3), maxMs: +times[times.length-1].toFixed(3) }));
  }
}
