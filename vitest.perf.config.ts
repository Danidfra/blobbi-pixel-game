/**
 * The performance budgets (`npm run test:perf`), apart from the correctness suite: one worker, one file at a time, so
 * a budget is measured on a core of its own (see tests/perf/budgets.perf.test.ts). The base config's `test` is
 * replaced, not merged (vitest's mergeConfig concatenates include/exclude lists).
 */
import { defineConfig } from 'vitest/config';
import base from './vite.config';

export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: ['tests/perf/**/*.perf.test.ts'],
    exclude: [],
    maxWorkers: 1,
    fileParallelism: false,
  },
});
