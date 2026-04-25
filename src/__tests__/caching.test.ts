const caching = require('../optimizations/caching').default;

function runCachingTests() {
  let passed = 0;
  let failed = 0;

  caching.setOptions({ enabled: true, ttl: '5min', scope: 'both' });

  try {
    const content = { system: 'You are a helpful assistant', messages: [] };
    const result = caching.addCacheControl(content);
    if (Array.isArray(result.system) && result.system[0].cache === true) { 
      passed++; console.log('✓ addCacheControl should add cache to system'); 
    } else { failed++; console.log('✗ addCacheControl system failed'); }
  } catch (e: any) { failed++; console.log('✗ addCacheControl failed:', e.message); }

  try {
    caching.setOptions({ enabled: false });
    const content = { system: 'You are helpful', messages: [] };
    const result = caching.addCacheControl(content);
    caching.setOptions({ enabled: true });
    if (result.system === 'You are helpful') { passed++; console.log('✓ addCacheControl not modify when disabled'); }
    else { failed++; console.log('✗ disabled caching failed'); }
  } catch (e: any) { failed++; console.log('✗ addCacheControl disabled failed:', e.message); }

  try {
    caching.addCache('anthropic', 'test content');
    const hasCache = caching.checkCache('anthropic', 'test content');
    if (hasCache) { passed++; console.log('✓ addCache should store entry'); }
    else { failed++; console.log('✗ addCache failed'); }
  } catch (e: any) { failed++; console.log('✗ addCache/checkCache failed:', e.message); }

  try {
    const result = caching.checkCache('anthropic', 'non-existent');
    if (!result) { passed++; console.log('✓ checkCache return false for non-existent'); }
    else { failed++; console.log('✗ checkCache non-existent failed'); }
  } catch (e: any) { failed++; console.log('✗ checkCache failed:', e.message); }

  try {
    const enabled = caching.isEnabled();
    if (enabled) { passed++; console.log('✓ isEnabled return current state'); }
    else { failed++; console.log('✗ isEnabled failed'); }
  } catch (e: any) { failed++; console.log('✗ isEnabled failed:', e.message); }

  console.log('');
  console.log('SUMMARY: ' + passed + '/5 passed');
  if (failed > 0) process.exit(1);
}

runCachingTests();