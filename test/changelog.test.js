import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { rollChangelog } from '../.github/scripts/changelog-release.mjs';

const REPO = 'https://github.com/prohand/gladys-calendar-agorafamille';

// A changelog before its first release: the real one moves on with every
// release, the rules of the roll do not.
const FIRST = `# Changelog

## [Unreleased]

### Added

- First version.

[Unreleased]: ${REPO}/commits/main
`;

test('the changelog keeps an Unreleased section for the next changes', async () => {
  const current = await readFile(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
  assert.match(current, /^## \[Unreleased\]$/m);
  assert.match(
    current,
    /^\[Unreleased\]: https:\/\/github\.com\/prohand\/gladys-calendar-agorafamille\//m,
  );
});

test('the first release moves Unreleased under its version and links the tag', () => {
  const rolled = rollChangelog(FIRST, '1.0.1', '2026-11-04');
  assert.match(rolled, /^## \[Unreleased\]\n\n## \[1\.0\.1\] - 2026-11-04\n\n### Added/m);
  assert.ok(rolled.includes(`[Unreleased]: ${REPO}/compare/v1.0.1...HEAD`));
  assert.ok(rolled.includes(`[1.0.1]: ${REPO}/releases/tag/v1.0.1`));
});

test('the next release compares with the previous tag', () => {
  const first = rollChangelog(FIRST, '1.0.1', '2026-11-04');
  const withChange = first.replace('## [Unreleased]\n', '## [Unreleased]\n\n### Fixed\n\n- x\n');
  const second = rollChangelog(withChange, '1.1.0', '2026-11-20');
  assert.match(second, /^\[1\.1\.0\]: .*\/compare\/v1\.0\.1\.\.\.v1\.1\.0$/m);
  // Rolling the same version twice changes nothing.
  assert.equal(rollChangelog(second, '1.1.0', '2026-11-20'), second);
});
