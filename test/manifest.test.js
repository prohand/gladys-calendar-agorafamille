// -----------------------------------------------------------------------------
// Consistency checks between `gladys-assistant-integration.json` and the code.
// The manifest is validated by the store indexer, but nothing there can know
// which handlers the code actually registers — these tests keep both in sync.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { ACCOUNT_KEYS, DEFAULT_CONFIG } from '../src/config.js';
import { LANGUAGES } from '../src/i18n.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const appSource = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');

test('the version is the same everywhere, and the image is tagged with it', () => {
  assert.equal(manifest.version, pkg.version);
  assert.equal(
    manifest.docker_image,
    `ghcr.io/prohand/gladys-calendar-agorafamille:${pkg.version}`,
  );
});

test('a calendar integration: per-user accounts, no devices, no scenes, no widget', () => {
  assert.equal(manifest.type, 'calendar');
  for (const field of ['scene_triggers', 'scene_actions', 'widgets', 'discovery']) {
    assert.equal(manifest[field], undefined, field);
  }
  assert.match(appSource, /onCalendarAccountUpdated\(/);
});

test('every manifest action is registered', () => {
  for (const action of manifest.actions ?? []) {
    assert.match(appSource, new RegExp(`onAction\\('${action.key}'`), action.key);
  }
});

// The store schema is the admission authority: a field type outside this list
// gets the integration rejected by the indexer.
const FIELD_TYPES = ['string', 'number', 'boolean', 'select', 'multi_select', 'secret', 'section'];

test('every field uses a type the store accepts', () => {
  const allFields = [
    ...manifest.account_schema,
    ...manifest.config_schema,
    ...(manifest.actions ?? []).flatMap((a) => a.fields ?? []),
  ];
  for (const field of allFields) {
    assert.ok(FIELD_TYPES.includes(field.type), `field "${field.key}": type "${field.type}"`);
    assert.match(field.key, /^[a-z0-9_]+$/, `field key "${field.key}" must be snake_case`);
    if (field.placeholder !== undefined) {
      assert.ok(
        ['string', 'number', 'secret'].includes(field.type),
        `field "${field.key}": a ${field.type} field cannot have a placeholder`,
      );
    }
    if (field.min !== undefined || field.max !== undefined) {
      assert.equal(field.type, 'number', `field "${field.key}": min/max are number-only`);
    }
  }
});

test('the account form asks for the portal, the login and a secret password', () => {
  const keys = manifest.account_schema
    .filter((field) => field.type !== 'section')
    .map((field) => field.key);
  assert.deepEqual(keys, ACCOUNT_KEYS);
  const password = manifest.account_schema.find((field) => field.key === 'password');
  assert.equal(password.type, 'secret');
  // The credentials are each user's: none in the integration settings.
  for (const key of ACCOUNT_KEYS) {
    assert.ok(!manifest.config_schema.some((field) => field.key === key), key);
  }
});

test('config_schema defaults stay consistent with DEFAULT_CONFIG', () => {
  for (const field of manifest.config_schema) {
    assert.notEqual(field.type, 'section');
    assert.ok(field.key in DEFAULT_CONFIG, `config key "${field.key}" missing in DEFAULT_CONFIG`);
    assert.equal(DEFAULT_CONFIG[field.key], field.default, `default of "${field.key}"`);
  }
  assert.deepEqual(
    Object.keys(DEFAULT_CONFIG).sort(),
    manifest.config_schema.map((field) => field.key).sort(),
  );
});

const CATEGORIES = [
  'climate',
  'lighting',
  'energy',
  'security',
  'multimedia',
  'appliances',
  'environment',
  'protocols',
  'network',
  'notifications',
  'assistants',
  'services',
  'transport',
  'vehicles',
  'servers',
  'leisure',
];

test('categories, keywords and countries follow the store rules', () => {
  const { categories, keywords, countries } = manifest;
  assert.ok(categories.length >= 1 && categories.length <= 3);
  for (const category of categories) {
    assert.ok(CATEGORIES.includes(category), `unknown category "${category}"`);
  }
  assert.ok(keywords.length >= 1 && keywords.length <= 10);
  const normalized = keywords.map((keyword) => keyword.trim().toLowerCase());
  assert.equal(new Set(normalized).size, keywords.length, 'keywords must be unique');
  for (const keyword of normalized) {
    assert.ok(keyword.length >= 2 && keyword.length <= 30, `keyword "${keyword}"`);
  }
  // Agora Famille serves French municipalities only.
  assert.deepEqual(countries, ['FR']);
});

test('the Gladys floor covers every field the manifest declares', () => {
  // The calendar type and account_schema need 5.2.0; keywords/countries 5.3.0.
  assert.equal(manifest.gladys_version, '>=5.3.0');
});

test('the portal is a cloud service: the transport says so', () => {
  assert.deepEqual(manifest.transports, ['cloud']);
});

/** Every multi-language object of the manifest, with where it sits. */
function multiLanguageTexts(node, path = 'manifest') {
  if (Array.isArray(node)) {
    return node.flatMap((child, index) => multiLanguageTexts(child, `${path}[${index}]`));
  }
  if (node === null || typeof node !== 'object') {
    return [];
  }
  const keys = Object.keys(node);
  if (keys.includes('en') && keys.every((key) => /^[a-z]{2}$/.test(key))) {
    return [{ path, text: node }];
  }
  return keys.flatMap((key) => multiLanguageTexts(node[key], `${path}.${key}`));
}

test('every multi-language text of the manifest carries en, fr, de and es', () => {
  const texts = multiLanguageTexts(manifest);
  assert.ok(texts.length > 20, `only ${texts.length} texts found`);
  for (const { path, text } of texts) {
    assert.deepEqual(Object.keys(text).sort(), [...LANGUAGES].sort(), `${path}: languages`);
    for (const language of LANGUAGES) {
      assert.ok(text[language].trim().length > 0, `${path}.${language} is empty`);
    }
  }
});

test('the per-language length limits of the store hold in every language', () => {
  assert.ok(manifest.name.length >= 3 && manifest.name.length <= 30);
  for (const language of LANGUAGES) {
    const { length } = manifest.description[language];
    assert.ok(length >= 10 && length <= 100, `description.${language}: ${length} characters`);
  }
});

test('the user documentation exists in every language', async () => {
  for (const language of LANGUAGES) {
    const text = await readFile(new URL(`../docs/${language}.md`, import.meta.url), 'utf8');
    assert.ok(text.length > 1000, `docs/${language}.md is too short`);
  }
});
