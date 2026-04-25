const routing = require('../optimizations/routing').default;

function runRoutingTests() {
  let passed = 0;
  let failed = 0;

  try {
    const result = routing.detectComplexity('Classify this text as positive or negative');
    if (result === 'simple') { passed++; console.log('✓ detectComplexity simple for classify'); }
    else { failed++; console.log('✗ classify should be simple'); }
  } catch (e: any) { failed++; console.log('✗ detectComplexity failed:', e.message); }

  try {
    const result = routing.detectComplexity('Summarize this article in 3 sentences');
    if (result === 'simple') { passed++; console.log('✓ detectComplexity simple for summarize'); }
    else { failed++; console.log('✗ summarize should be simple'); }
  } catch (e: any) { failed++; console.log('✗ detectComplexity failed:', e.message); }

  try {
    const result = routing.detectComplexity('Analyze why this algorithm fails and suggest improvements');
    if (result === 'complex') { passed++; console.log('✓ detectComplexity complex for analyze'); }
    else { failed++; console.log('✗ analyze should be complex'); }
  } catch (e: any) { failed++; console.log('✗ detectComplexity failed:', e.message); }

  try {
    const result = routing.detectComplexity('Design a scalable architecture for this system');
    if (result === 'complex') { passed++; console.log('✓ detectComplexity complex for design'); }
    else { failed++; console.log('✗ design should be complex'); }
  } catch (e: any) { failed++; console.log('✗ detectComplexity failed:', e.message); }

  try {
    const result = routing.routeModel('openai', 'gpt-4', 'Classify this feedback');
    if (result === 'gpt-3.5-turbo') { passed++; console.log('✓ routeModel downgrade gpt-4 for simple'); }
    else { failed++; console.log('✗ gpt-4 should downgrade for simple'); }
  } catch (e: any) { failed++; console.log('✗ routeModel failed:', e.message); }

  try {
    const result = routing.routeModel('openai', 'gpt-4', 'Design a new feature');
    if (result === 'gpt-4') { passed++; console.log('✓ routeModel keep gpt-4 for complex'); }
    else { failed++; console.log('✗ gpt-4 should stay for complex'); }
  } catch (e: any) { failed++; console.log('✗ routeModel failed:', e.message); }

  try {
    const result = routing.routeModel('anthropic', 'claude-3-opus', 'Summarize this text');
    if (result === 'claude-3-haiku') { passed++; console.log('✓ routeModel downgrade claude-3-opus for simple'); }
    else { failed++; console.log('✗ claude-3-opus should downgrade'); }
  } catch (e: any) { failed++; console.log('✗ routeModel failed:', e.message); }

  try {
    routing.setOptions({ enabled: false });
    const result = routing.routeModel('openai', 'gpt-4', 'Simple task');
    routing.setOptions({ enabled: true });
    if (result === 'gpt-4') { passed++; console.log('✓ routeModel return original when disabled'); }
    else { failed++; console.log('✗ disabled routing failed'); }
  } catch (e: any) { failed++; console.log('✗ routeModel disabled failed:', e.message); }

  console.log('');
  console.log('SUMMARY: ' + passed + '/8 passed');
  if (failed > 0) process.exit(1);
}

runRoutingTests();