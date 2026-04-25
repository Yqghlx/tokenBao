import { useState, useEffect, useCallback } from 'react';

function Monitor() {
  const [stats, setStats] = useState({
    totalRequests: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCachedTokens: 0,
    totalCost: 0,
    byApi: {} as Record<string, { requests: number; tokens: number; cost: number }>,
    byModel: {} as Record<string, { requests: number; tokens: number; cost: number }>
  });

  const loadStats = useCallback(async () => {
    if (window.electronAPI?.stats?.summary) {
      try {
        const data = await window.electronAPI.stats.summary();
        setStats(data);
      } catch (err) {
        console.error('获取统计数据失败:', err);
      }
    }
  }, []);

  useEffect(() => {
    loadStats();
    const interval = setInterval(loadStats, 5000);
    return () => clearInterval(interval);
  }, [loadStats]);

  const todayTokens = stats.totalInputTokens + stats.totalOutputTokens;
  const monthlyTokens = todayTokens;
  const savedCost = stats.totalCachedTokens > 0 
    ? (stats.totalCachedTokens / 1000 * 0.03).toFixed(2)
    : '0.00';

  return (
    <div className="page">
      <h2>监控仪表盘</h2>
      <div className="stats-grid">
        <div className="stat-card">
          <h3>今日 Token 使用</h3>
          <p className="stat-value">{todayTokens}</p>
        </div>
        <div className="stat-card">
          <h3>本月 Token 使用</h3>
          <p className="stat-value">{monthlyTokens}</p>
        </div>
        <div className="stat-card">
          <h3>本月成本</h3>
          <p className="stat-value">$0.00</p>
        </div>
        <div className="stat-card">
          <h3>节省金额</h3>
          <p className="stat-value">$0.00</p>
        </div>
      </div>

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