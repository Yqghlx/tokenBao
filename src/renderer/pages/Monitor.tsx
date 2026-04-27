import { useState, useEffect, useCallback } from 'react';
import { showToast } from '../components/Toast';
import { usePolling } from '../hooks/usePolling';

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
    cacheSavings: 0
  });

  const loadStats = useCallback(async () => {
    if (window.electronAPI?.stats?.summary) {
      try {
        const data = await window.electronAPI.stats.summary();
        setStats(data);

        // 缓存节省费用：使用服务端记录的总成本和缓存 token 计算
        // GPT-4o 输入价格 $0.0025/1K tokens，缓存读取 50% 折扣
        const cacheReadTokens = data.totalCachedTokens || 0;
        const estimatedSavingsPerToken = 0.0025 / 1000 * 0.5;
        const cacheSavings = cacheReadTokens * estimatedSavingsPerToken;

        setCachingStats({ cacheReadTokens, cacheSavings });
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
  }, [loadStats]);

  usePolling(loadStats, 10000);

  const totalTokens = stats.totalInputTokens + stats.totalOutputTokens;
  // 节省费用估算：基于 GPT-4o 输入价格 × 50% 缓存折扣
  const estimatedSavingsPerToken = 0.0025 / 1000 * 0.5;
  const savedCost = stats.totalCachedTokens > 0
    ? (stats.totalCachedTokens * estimatedSavingsPerToken).toFixed(2)
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
      <div className="page-header">
        <h2>监控仪表盘</h2>
        <button className="btn-secondary" onClick={loadStats}>刷新</button>
      </div>

      {stats.totalRequests === 0 ? (
        <div className="empty-placeholder">
          <p className="title">暂无统计数据</p>
          <p className="desc">启动代理并发送请求后，统计数据将在此处展示</p>
        </div>
      ) : (
        <>
          <div className="stats-grid">
            <div className="stat-card">
              <h3>总 Token 使用</h3>
              <p className="stat-value">{totalTokens.toLocaleString()}</p>
              <p className="stat-detail">输入: {stats.totalInputTokens.toLocaleString()} | 输出: {stats.totalOutputTokens.toLocaleString()}</p>
            </div>
            <div className="stat-card">
              <h3>总请求数</h3>
              <p className="stat-value">{stats.totalRequests}</p>
            </div>
            <div className="stat-card">
              <h3>总成本</h3>
              <p className="stat-value">${actualCost}</p>
            </div>
            <div className="stat-card">
              <h3>节省金额</h3>
              <p className="stat-value">${savedCost}</p>
              <p className="stat-detail">节省 Tokens: {stats.totalCachedTokens.toLocaleString()}</p>
            </div>
          </div>

          {cachingStats.cacheReadTokens > 0 && (
            <div className="stats-grid" style={{ marginTop: '16px' }}>
              <div className="stat-card cache-card">
                <h3>Prompt Caching 效果</h3>
                <p className="stat-value">{cachingStats.cacheReadTokens.toLocaleString()}</p>
                <p className="stat-detail">缓存读取 Tokens</p>
              </div>
              <div className="stat-card cache-card">
                <h3>缓存节省费用</h3>
                <p className="stat-value">${cachingStats.cacheSavings.toFixed(4)}</p>
                <p className="stat-detail">90% 费率优惠</p>
              </div>
            </div>
          )}

          <div className="stats-details" style={{ marginTop: '24px' }}>
            <h3>详细统计</h3>
            <div className="stats-breakdown">
              <div className="breakdown-section">
                <h4>按 API 类型</h4>
                {Object.keys(stats.byApi).length === 0 ? (
                  <p className="breakdown-item-detail">暂无数据</p>
                ) : (
                  Object.entries(stats.byApi).map(([api, data]) => (
                    <div key={api} className="breakdown-item">
                      <span className="breakdown-item-label">{api.toUpperCase()}</span>
                      <div className="breakdown-item-detail">
                        请求: {data.requests} | Tokens: {data.tokens.toLocaleString()} | 费用: ${data.cost.toFixed(4)}
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="breakdown-section">
                <h4>按模型</h4>
                {Object.keys(stats.byModel).length === 0 ? (
                  <p className="breakdown-item-detail">暂无数据</p>
                ) : (
                  Object.entries(stats.byModel).map(([model, data]) => (
                    <div key={model} className="breakdown-item">
                      <span className="breakdown-item-label">{model}</span>
                      <div className="breakdown-item-detail">
                        请求: {data.requests} | Tokens: {data.tokens.toLocaleString()} | 费用: ${data.cost.toFixed(4)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default Monitor;
