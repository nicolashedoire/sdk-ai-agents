import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // One child process per test file, as Vitest does by default from version 2. In the
    // `threads` pool, process.env is a copy per worker thread, and writing to it once crashed
    // Node 24 (segmentation fault in node::MapKVStore::Set).
    pool: 'forks',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'dist/',
        '**/*.test.ts',
        '**/*.spec.ts',
      ],
    },
  },
})


