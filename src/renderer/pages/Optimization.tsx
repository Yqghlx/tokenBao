import { useState, useEffect, useCallback } from 'react';
import { showToast } from '../components/Toast';

function Optimization() {
  const [loading, setLoading] = useState(true);
  const [optimizationConfig, setOptimizationConfig] = useState({
    caching: true,
    compression: true,
    routing: true,
    batching: false
  });
  const [cacheTTL, setCacheTTL] = useState('5min');

  const loadConfig = useCallback(async () => {
    if (window.electronAPI?.optimization?.getConfig && window.electronAPI?.config?.get) {
      try {
        const [config, ttl] = await Promise.all([
          window.electronAPI.optimization.getConfig(),
          window.electronAPI.config.get('cacheTTL')
        ]);
        setOptimizationConfig(config);
        setCacheTTL(ttl || '5min');
      } catch (err) {
        console.error('获取优化配置失败:', err);
        showToast('获取优化配置失败', 'error');
      } finally {
        setLoading(false);
      }
    } else {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const updateConfig = async (key: string, value: boolean) => {
    setOptimizationConfig(prev => ({ ...prev, [key]: value }));

    if (window.electronAPI?.optimization?.setConfig) {
      try {
        await window.electronAPI.optimization.setConfig({ [key]: value });
        showToast('配置已更新', 'success');
      } catch (err) {
        console.error('保存优化配置失败:', err);
        showToast('保存配置失败', 'error');
        setOptimizationConfig(prev => ({ ...prev, [key]: !value }));
      }
    }
  };

  const updateTTL = async (value: string) => {
    setCacheTTL(value);
    if (window.electronAPI?.config?.set) {
      try {
        await window.electronAPI.config.set('cacheTTL', value);
        showToast('TTL 设置已保存', 'success');
      } catch (err) {
        console.error('保存 TTL 失败:', err);
        showToast('保存 TTL 失败', 'error');
      }
    }
  };

  if (loading) {
    return (
      <div className="page">
        <h2>优化策略配置</h2>
        <p>加载中...</p>
      </div>
    );
  }

  return (
    <div className="page">
      <h2>优化策略配置</h2>
      <div className="optimization-sections">
        <section className="optim-section">
          <h3>Prompt Caching</h3>
          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="checkbox"
                checked={optimizationConfig.caching}
                onChange={(e) => updateConfig('caching', e.target.checked)}
              />
              <span>启用 Prompt Caching</span>
            </label>
            <p style={{ fontSize: '12px', color: '#888', marginTop: '8px' }}>
              Anthropic API 支持 Prompt Caching，可节省 50-90% 的 Token 消耗
            </p>
          </div>
          <div className="form-group" style={{ marginTop: '12px' }}>
            <label>TTL 设置</label>
            <select value={cacheTTL} onChange={(e) => updateTTL(e.target.value)}>
              <option value="5min">5 分钟（1.25x 写费用）</option>
              <option value="1hour">1 小时（2x 写费用）</option>
            </select>
          </div>
        </section>

        <section className="optim-section">
          <h3>Prompt 压缩</h3>
          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="checkbox"
                checked={optimizationConfig.compression}
                onChange={(e) => updateConfig('compression', e.target.checked)}
              />
              <span>启用 Prompt 压缩</span>
            </label>
            <p style={{ fontSize: '12px', color: '#888', marginTop: '8px' }}>
              移除冗余词汇（"please"、"Could you" 等），节省 20-40% Token
            </p>
          </div>
        </section>

        <section className="optim-section">
          <h3>智能模型路由</h3>
          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="checkbox"
                checked={optimizationConfig.routing}
                onChange={(e) => updateConfig('routing', e.target.checked)}
              />
              <span>启用智能模型路由</span>
            </label>
            <p style={{ fontSize: '12px', color: '#888', marginTop: '8px' }}>
              根据任务复杂度自动选择合适的模型，节省 60-95% 成本
            </p>
          </div>
          <div className="route-rules" style={{ marginTop: '12px' }}>
            <div className="route-rule" style={{ padding: '8px', background: '#16213e', borderRadius: '4px', marginBottom: '4px' }}>
              <span>gpt-4 / gpt-4o / gpt-4.1 → gpt-4o-mini / gpt-4.1-mini</span>
              <span style={{ marginLeft: '12px', fontSize: '11px', color: '#00d4ff' }}>简单任务</span>
            </div>
            <div className="route-rule" style={{ padding: '8px', background: '#16213e', borderRadius: '4px', marginBottom: '4px' }}>
              <span>claude-opus-4 / claude-3-opus → claude-3.5-haiku / claude-3-haiku</span>
              <span style={{ marginLeft: '12px', fontSize: '11px', color: '#00d4ff' }}>分类/简单任务</span>
            </div>
          </div>
        </section>

        <section className="optim-section">
          <h3>请求批处理</h3>
          <div className="form-group">
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <input
                type="checkbox"
                checked={optimizationConfig.batching}
                onChange={(e) => updateConfig('batching', e.target.checked)}
              />
              <span>启用请求批处理（实验性）</span>
            </label>
            <p style={{ fontSize: '12px', color: '#888', marginTop: '8px' }}>
              合并多个请求批量发送，减少 API 调用次数。当前仅用于统计，不影响实际请求。
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

export default Optimization;