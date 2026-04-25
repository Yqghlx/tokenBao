const cryptoModule = require('../utils/crypto');

function runCryptoTests() {
  let passed = 0;
  let failed = 0;

  try {
    const original = 'sk-test-key-123456';
    const encrypted = cryptoModule.encrypt(original);
    const decrypted = cryptoModule.decrypt(encrypted);
    if (decrypted === original) {
      passed++;
      console.log('✓ encrypt and decrypt should work correctly');
    } else {
      failed++;
      console.log('✗ encrypt and decrypt failed');
    }
  } catch (e: any) {
    failed++;
    console.log('✗ encrypt and decrypt failed:', e.message);
  }

  try {
    const original = 'test-key';
    const encrypted1 = cryptoModule.encrypt(original);
    const encrypted2 = cryptoModule.encrypt(original);
    if (encrypted1 !== encrypted2) {
      passed++;
      console.log('✓ encrypt should produce different outputs');
    } else {
      failed++;
      console.log('✗ encrypt produces same output');
    }
  } catch (e: any) {
    failed++;
    console.log('✗ encrypt uniqueness test failed:', e.message);
  }

  try {
    cryptoModule.decrypt('invalid-format');
    failed++;
    console.log('✗ decrypt should throw for invalid format');
  } catch (e: any) {
    if (e.message.includes('Invalid ciphertext format')) {
      passed++;
      console.log('✓ decrypt should throw for invalid format');
    } else {
      failed++;
      console.log('✗ wrong error message');
    }
  }

  try {
    const id1 = cryptoModule.generateId();
    const id2 = cryptoModule.generateId();
    if (id1 !== id2 && id1.length === 32) {
      passed++;
      console.log('✓ generateId should produce unique IDs');
    } else {
      failed++;
      console.log('✗ generateId uniqueness test failed');
    }
  } catch (e: any) {
    failed++;
    console.log('✗ generateId test failed:', e.message);
  }

  try {
    const original = '中文密钥测试';
    const encrypted = cryptoModule.encrypt(original);
    const decrypted = cryptoModule.decrypt(encrypted);
    if (decrypted === original) {
      passed++;
      console.log('✓ encrypt should handle Chinese characters');
    } else {
      failed++;
      console.log('✗ Chinese character test failed');
    }
  } catch (e: any) {
    failed++;
    console.log('✗ Chinese character test failed:', e.message);
  }

  console.log('');
  console.log('SUMMARY: ' + passed + '/5 passed');
  
  if (failed > 0) {
    process.exit(1);
  }
}

runCryptoTests();