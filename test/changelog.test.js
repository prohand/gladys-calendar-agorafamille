import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { rollChangelog } from '../.github/scripts/changelog-release.mjs';

const current = await readFile(new URL('../CHANGELOG.md', import.meta.url), 'utf8');

test('the first release moves Unreleased under its version and links the tag', () => {
  const rolled = rollChangelog(current, '1.0.1', '2026-11-04');
  assert.match(rolled, /^## \[Unreleased\]\n\n## \[1\.0\.1\] - 2026-11-04\n\n### Added/m);
  assert.match(
    rolled,
    /^\[Unreleased\]: https:\/\/github\.com\/prohand\/gladys-calendar-agorafamille\/compare\/v1\.0\.1\.\.\.HEAD$/m,
  );
  assert.match(
    rolled,
    /^\[1\.0\.1\]: https:\/\/github\.com\/prohand\/gladys-calendar-agorafamille\/releases\/tag\/v1\.0\.1$/m,
  );
});

test('the next release compares with the previous tag', () => {
  const first = rollChangelog(current, '1.0.1', '2026-11-04');
  const withChange = first.replace('## [Unreleased]\n', '## [Unreleased]\n\n### Fixed\n\n- x\n');
  const second = rollChangelog(withChange, '1.1.0', '2026-11-20');
  assert.match(second, /^\[1\.1\.0\]: .*\/compare\/v1\.0\.1\.\.\.v1\.1\.0$/m);
  // Rolling the same version twice changes nothing.
  assert.equal(rollChangelog(second, '1.1.0', '2026-11-20'), second);
});
