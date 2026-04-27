import { useState, useEffect, useCallback } from 'react';
import { showToast } from '../components/Toast';

function Monitor() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalRequests: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCachedTokens: 0,
    totalCost: 0,
    byApi: {} as Record<string, { requests: number; tokens: number; cost: number }>,
    byModel: {} as Record<string, { requests: number; tokens: number; cost: number }>
  });

  const [cachingStats, setCachingStats] = useState({
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    cacheSavings: 0
  });

  const loadStats = useCallback(async () => {
    if (window.electronAPI?.stats?.summary) {
      try {
        const data = await window.electronAPI.stats.summary();
        setStats(data);

        const cacheReadTokens = data.totalCachedTokens || 0;
        const cacheCreationTokens = Math.round(cacheReadTokens * 0.1);
        const cacheSavings = cacheReadTokens > 0 ? (cacheReadTokens / 1000 * 0.003 * 0.9).toFixed(4) : '0.00';

        setCachingStats({
          cacheReadTokens,
          cacheCreationTokens,
          cacheSavings: parseFloat(cacheSavings)
        });
      } catch (err) {
        console.error('获取统计数据失败:', err);
        showToast('获取统计数据失败', 'error');
      } finally {
        setLoading(false);
      }
    } else {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStats();
    const interval = setInterval(loadStats, 5000);
    return () => clearInterval(interval);
  }, [loadStats]);

  const totalTokens = stats.totalInputTokens + stats.totalOutputTokens;
  const savedCost = stats.totalCachedTokens > 0 
    ? (stats.totalCachedTokens / 1000 * 0.03).toFixed(2)
    : '0.00';
  const actualCost = stats.totalCost.toFixed(4);

  if (loading) {
    return (
      <div className="page">
        <h2>监控仪表盘</h2>
        <p>加载中...</p>
      </div>
    );
  }

  return (
    <div className="page">
      <h2>监控仪表盘</h2>
      <div className="stats-grid">
        <div className="stat-card">
          <h3>总 Token 使用</h3>
          <p className="stat-value">{totalTokens}</p>
          <p className="stat-detail">输入: {stats.totalInputTokens} | 输出: {stats.totalOutputTokens}</p>
        </div>
        <div className="stat-card">
          <h3>总请求数</h3>
          <p className="stat-value">{stats.totalRequests}</p>
        </div>
        <div className="stat-card">
          <h3>总成本</h3>
          <p className="stat-value">$${actualCost}</p>
        </div>
        <div className="stat-card">
          <h3>节省金额</h3>
          <p className="stat-value">$${savedCost}</p>
          <p className="stat-detail">节省 Tokens: {stats.totalCachedTokens}</p>
        </div>
      </div>
      
      {cachingStats.cacheReadTokens > 0 && (
        <div className="stats-grid" style={{ marginTop: '16px' }}>
          <div className="stat-card" style={{ background: '#1a472a' }}>
            <h3>Prompt Caching 效果</h3>
            <p className="stat-value">{cachingStats.cacheReadTokens}</p>
            <p className="stat-detail">缓存读取 Tokens</p>
          </div>
          <div className="stat-card" style={{ background: '#1a472a' }}>
            <h3>缓存节省费用</h3>
            <p className="stat-value">$${cachingStats.cacheSavings.toFixed(4)}</p>
            <p className="stat-detail">90% 费率优惠</p>
          </div>
        </div>
      )}
      
      {stats.totalRequests > 0 && (
        <div className="stats-details" style={{ marginTop: '24px' }}>
          <h3>详细统计</h3>
          <div className="stats-breakdown" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div className="breakdown-section" style={{ padding: '16px', background: '#16213e', borderRadius: '8px' }}>
              <h4 style={{ marginBottom: '12px' }}>按 API 类型</h4>
              {Object.entries(stats.byApi).map(([api, data]) => (
                <div key={api} style={{ marginBottom: '8px' }}>
                  <span style={{ fontWeight: 'bold' }}>{api.toUpperCase()}</span>
                  <div style={{ fontSize: '12px', color: '#888' }}>
                    请求: {data.requests} | Tokens: {data.tokens}
                  </div>
                </div>
              ))}
            </div>
            <div className="breakdown-section" style={{ padding: '16px', background: '#16213e', borderRadius: '8px' }}>
              <h4 style={{ marginBottom: '12px' }}>按模型</h4>
              {Object.entries(stats.byModel).map(([model, data]) => (
                <div key={model} style={{ marginBottom: '8px' }}>
                  <span style={{ fontWeight: 'bold' }}>{model}</span>
                  <div style={{ fontSize: '12px', color: '#888' }}>
                    请求: {data.requests} | Tokens: {data.tokens}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="chart-placeholder">
        <p>图表将在运行时渲染</p>
      </div>
    </div>
  );
}

export default Monitor;