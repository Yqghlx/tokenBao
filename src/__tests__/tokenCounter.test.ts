const tokenCounter = require('../utils/tokenCounter').default;

function runTokenCounterTests() {
  let passed = 0;
  let failed = 0;

  try {
    const result = tokenCounter.estimateTokens('Hello world');
    if (result === 3) { passed++; console.log('✓ estimateTokens correct count'); }
    else { failed++; console.log('✗ estimateTokens failed: expected 3, got ' + result); }
  } catch (e: any) { failed++; console.log('✗ estimateTokens failed:', e.message); }

  try {
    const result = tokenCounter.estimateTokens('');
    if (result === 0) { passed++; console.log('✓ estimateTokens handle empty'); }
    else { failed++; console.log('✗ estimateTokens empty failed'); }
  } catch (e: any) { failed++; console.log('✗ estimateTokens failed:', e.message); }

  try {
    const messages = [{ role: 'user', content: 'Hello' }, { role: 'assistant', content: 'Hi there' }];
    const result = tokenCounter.countMessages(messages);
    if (result > 0) { passed++; console.log('✓ countMessages count array'); }
    else { failed++; console.log('✗ countMessages failed'); }
  } catch (e: any) { failed++; console.log('✗ countMessages failed:', e.message); }

  try {
    const messages = [{ role: 'user', content: [{ type: 'text', text: 'Hello' }, { type: 'image', data: 'base64' }] }];
    const result = tokenCounter.countMessages(messages);
    if (result > 0) { passed++; console.log('✓ countMessages handle nested content'); }
    else { failed++; console.log('✗ countMessages nested failed'); }
  } catch (e: any) { failed++; console.log('✗ countMessages failed:', e.message); }

  try {
    const result = tokenCounter.estimateCost(1000, 500, 'gpt-4');
    if (Math.abs(result - 0.06) < 0.001) { passed++; console.log('✓ estimateCost gpt-4'); }
    else { failed++; console.log('✗ estimateCost gpt-4 failed: ' + result); }
  } catch (e: any) { failed++; console.log('✗ estimateCost failed:', e.message); }

  try {
    const result = tokenCounter.estimateCost(1000, 500, 'gpt-3.5-turbo');
    if (Math.abs(result - 0.002) < 0.001) { passed++; console.log('✓ estimateCost gpt-3.5-turbo'); }
    else { failed++; console.log('✗ estimateCost gpt-3.5 failed: ' + result); }
  } catch (e: any) { failed++; console.log('✗ estimateCost failed:', e.message); }

  try {
    const result = tokenCounter.calculateSavings(1000, 500, 'gpt-4');
    if (result > 0) { passed++; console.log('✓ calculateSavings positive value'); }
    else { failed++; console.log('✗ calculateSavings failed'); }
  } catch (e: any) { failed++; console.log('✗ calculateSavings failed:', e.message); }

  try {
    const result = tokenCounter.countTokens('Test', 'openai');
    if (result > 0) { passed++; console.log('✓ countTokens works for different apiType'); }
    else { failed++; console.log('✗ countTokens apiType failed'); }
  } catch (e: any) { failed++; console.log('✗ countTokens failed:', e.message); }

  console.log('');
  console.log('SUMMARY: ' + passed + '/8 passed');
  if (failed > 0) process.exit(1);
}

runTokenCounterTests();