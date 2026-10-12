// Compare two performance runs (same harness, same scenes): node scripts/perf-compare.mjs <before.json> <after.json>
// Headless runs (perf-scenes) compare frame CPU ms; browser runs (perf-browser) compare FPS, p95 interval and long tasks.
import { readFileSync } from 'node:fs';

const [a, b] = process.argv.slice(2).map((f) => JSON.parse(readFileSync(f, 'utf8')));
const key = (r) => `${r.scene} ${r.viewport}`;
const after = new Map(b.results.map((r) => [key(r), r]));
const browser = 'fps' in a.results[0];
const rows = [];
for (const r of a.results) {
  const s = after.get(key(r));
  if (!s) continue;
  rows.push(
    browser
      ? `| ${r.scene} | ${r.viewport} | ${r.fps.toFixed(1)} → ${s.fps.toFixed(1)} | ${r.p95.toFixed(1)} → ${s.p95.toFixed(1)} | ${r.longTasks} → ${s.longTasks} | ${r.viewMs?.toFixed(1)} → ${s.viewMs?.toFixed(1)} |`
      : `| ${r.scene} | ${r.viewport} | ${r.mean.toFixed(2)} → ${s.mean.toFixed(2)} | ${r.p95.toFixed(2)} → ${s.p95.toFixed(2)} | ${r.p99.toFixed(2)} → ${s.p99.toFixed(2)} | ${r.max.toFixed(1)} → ${s.max.toFixed(1)} |`,
  );
}
console.log(browser ? '| Scene | Viewport | FPS | p95 interval ms | Long tasks | View ms |' : '| Scene | Viewport | Mean ms | p95 ms | p99 ms | Max ms |');
console.log('|---|---|---|---|---|---|');
console.log(rows.join('\n'));
