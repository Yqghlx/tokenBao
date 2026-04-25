const compression = require('../optimizations/compression').default;

function runCompressionTests() {
  let passed = 0;
  let failed = 0;

  try {
    const result = compression.compress('Please help me with this task');
    if (!result.text.includes('Please') && result.tokensSaved > 0) {
      passed++;
      console.log('✓ compress should remove "please"');
    } else {
      failed++;
      console.log('✗ compress did not remove "please"');
    }
  } catch (e: any) {
    failed++;
    console.log('✗ compress test failed:', e.message);
  }

  try {
    const result = compression.compress('Could you please analyze this data');
    if (!result.text.includes('Could you')) {
      passed++;
      console.log('✓ compress should remove "Could you"');
    } else {
      failed++;
      console.log('✗ compress did not remove "Could you"');
    }
  } catch (e: any) {
    failed++;
    console.log('✗ compress test failed:', e.message);
  }

  try {
    const result = compression.compress('Return response in JSON format');
    if (result.text.includes('resp: JSON')) {
      passed++;
      console.log('✓ compress should replace "in JSON format"');
    } else {
      failed++;
      console.log('✗ compress did not replace JSON format');
    }
  } catch (e: any) {
    failed++;
    console.log('✗ compress test failed:', e.message);
  }

  try {
    const result = compression.compress('');
    if (result.text === '' && result.tokensSaved === 0) {
      passed++;
      console.log('✓ compress should handle empty string');
    } else {
      failed++;
      console.log('✗ compress empty string failed');
    }
  } catch (e: any) {
    failed++;
    console.log('✗ compress test failed:', e.message);
  }

  try {
    const prompt = [
      { type: 'text', text: 'Please help me' },
      { type: 'image', data: 'base64...' }
    ];
    const result = compression.compressPrompt(prompt);
    if (!result[0].text.includes('Please') && result[1].type === 'image') {
      passed++;
      console.log('✓ compressPrompt should handle array format');
    } else {
      failed++;
      console.log('✗ compressPrompt array failed');
    }
  } catch (e: any) {
    failed++;
    console.log('✗ compressPrompt test failed:', e.message);
  }

  try {
    compression.setOptions({ enabled: false });
    const result = compression.compress('Please help me');
    compression.setOptions({ enabled: true });
    if (result.text === 'Please help me' && result.tokensSaved === 0) {
      passed++;
      console.log('✓ compress should be disabled when enabled=false');
    } else {
      failed++;
      console.log('✗ compress disabled test failed');
    }
  } catch (e: any) {
    failed++;
    console.log('✗ compress test failed:', e.message);
  }

  console.log('');
  console.log('SUMMARY: ' + passed + '/6 passed');
  
  if (failed > 0) {
    process.exit(1);
  }
}

runCompressionTests();