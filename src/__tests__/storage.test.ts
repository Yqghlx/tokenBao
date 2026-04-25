const fs = require('fs');
const path = require('path');
const storage = require('../utils/storage');

function runStorageTests() {
  let passed = 0;
  let failed = 0;
  const testFile = 'test-storage-unit.json';
  const testData = { name: 'test', value: 123, nested: { key: 'value' } };

  try {
    storage.saveJson(testFile, testData);
    passed++; console.log('✓ saveJson should write file');
  } catch (e: any) { failed++; console.log('✗ saveJson failed:', e.message); }

  try {
    const loaded = storage.loadJson(testFile, {});
    if (loaded.name === 'test' && loaded.value === 123) { passed++; console.log('✓ loadJson should read file'); }
    else { failed++; console.log('✗ loadJson data mismatch'); }
  } catch (e: any) { failed++; console.log('✗ loadJson failed:', e.message); }

  try {
    const defaultData = { default: true };
    const loaded = storage.loadJson('non-existent-unit.json', defaultData);
    if (loaded.default === true) { passed++; console.log('✓ loadJson return default for missing file'); }
    else { failed++; console.log('✗ loadJson default failed'); }
  } catch (e: any) { failed++; console.log('✗ loadJson default failed:', e.message); }

  try {
    const files = storage.listJsonFiles();
    if (files.some((f: string) => f.includes('test-storage-unit'))) { passed++; console.log('✓ listJsonFiles should list json files'); }
    else { failed++; console.log('✗ listJsonFiles failed'); }
  } catch (e: any) { failed++; console.log('✗ listJsonFiles failed:', e.message); }

  console.log('');
  console.log('SUMMARY: ' + passed + '/4 passed');
  if (failed > 0) process.exit(1);
}

runStorageTests();