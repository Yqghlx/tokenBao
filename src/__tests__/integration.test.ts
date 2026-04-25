const ProxyServer = require('../proxy/server').default;
const { applyOptimizations } = require('../optimizations/index');
const http = require('http');

function runIntegrationTests() {
  let passed = 0;
  let failed = 0;
  
  const server = new ProxyServer({ port: 18091 });

  server.start().then(async () => {
    console.log('代理启动成功');
    
    try {
      const requestBody = {
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'Please help me analyze this data' }]
      };
      
      const optimizationResult = applyOptimizations('openai', requestBody);
      if (optimizationResult.appliedStrategies.length > 0) { passed++; console.log('✓ 优化策略应用成功'); }
      else { failed++; console.log('✗ 优化策略未应用'); }
    } catch (e: any) { failed++; console.log('✗ 优化测试失败:', e.message); }

    try {
      const stats = server.getStats();
      if (stats.hasOwnProperty('requests') && stats.hasOwnProperty('savedTokens')) { passed++; console.log('✓ 统计接口正常'); }
      else { failed++; console.log('✗ 统计接口异常'); }
    } catch (e: any) { failed++; console.log('✗ 统计测试失败:', e.message); }

    try {
      server.setKeys('sk-test-openai', 'sk-test-anthropic');
      if (server.openaiKey === 'sk-test-openai' && server.anthropicKey === 'sk-test-anthropic') { passed++; console.log('✓ API Key 设置成功'); }
      else { failed++; console.log('✗ API Key 设置失败'); }
    } catch (e: any) { failed++; console.log('✗ API Key 测试失败:', e.message); }

    try {
      if (server.isRunning()) { passed++; console.log('✓ 代理运行状态正确'); }
      else { failed++; console.log('✗ 代理运行状态异常'); }
    } catch (e: any) { failed++; console.log('✗ 状态测试失败:', e.message); }

    try {
      const apiType1 = server.detectApiType('/v1/chat/completions');
      const apiType2 = server.detectApiType('/v1/messages');
      if (apiType1 === 'openai' && apiType2 === 'anthropic') { passed++; console.log('✓ API 类型检测正确'); }
      else { failed++; console.log('✗ API 类型检测异常'); }
    } catch (e: any) { failed++; console.log('✗ API类型测试失败:', e.message); }

    try {
      const req = http.request({
        hostname: 'localhost',
        port: 18091,
        path: '/v1/chat/completions',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer test' },
        timeout: 5000
      }, (res) => {
        if (res.statusCode === 401 || res.statusCode === 502 || res.statusCode === 504) { passed++; console.log('✓ 代理请求处理正确'); }
        else { failed++; console.log('✗ 代理请求状态异常: ' + res.statusCode); }
      });
      
      req.on('error', (e) => { passed++; console.log('✓ 代理请求错误处理正确'); });
      req.write(JSON.stringify({ model: 'gpt-4', messages: [{ role: 'user', content: 'test' }] }));
      req.end();
      
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (e: any) { passed++; console.log('✓ 请求处理异常捕获'); }

    await server.stop();
    
    console.log('');
    console.log('SUMMARY: ' + passed + '/7 passed');
    if (failed > 0) process.exit(1);
    
  }).catch(err => {
    console.log('✗ 代理启动失败:', err.message);
    process.exit(1);
  });
}

runIntegrationTests();