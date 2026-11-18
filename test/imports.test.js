import test from 'node:test';
import assert from 'node:assert/strict';
import { checkImports } from '../scripts/check-imports.js';
test('all backend relative ESM imports exist, including middleware/log source', async () => {
  const result = await checkImports();
  assert.ok(result.checked > 100);
  assert.deepEqual(result.missing, []);
});
