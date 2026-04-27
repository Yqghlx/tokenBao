import { useState, useEffect, useCallback, useMemo } from 'react';
import { showToast } from '../components/Toast';
import { usePolling } from '../hooks/usePolling';

/**
 * 缓存节省估算：缓存 token 的费用是非缓存的 10%（即节省 90%）
 * Anthropic Prompt Caching 官方定价：缓存读取 = 输入价格 × 0.1
 */
const CACHE_SAVINGS_RATIO = 0.9;

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

  const loadStats = useCallback(async () => {
    if (window.electronAPI?.stats?.summary) {
      try {
        const data = await window.electronAPI.stats.summary();
        setStats(data);
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

  const totalTokens = useMemo(() =>
    stats.totalInputTokens + stats.totalOutputTokens,
    [stats.totalInputTokens, stats.totalOutputTokens]
  );

  const cacheSavings = useMemo(() => {
    // cachedTokens 是 inputTokens 的子集，不应重复计算
    if (stats.totalInputTokens === 0 || stats.totalCost === 0) return 0;
    // 用 token 比例估算缓存部分对应的输入费用，乘以节省比例
    const inputCost = stats.totalCost * (stats.totalInputTokens / totalTokens);
    const cacheRatio = stats.totalCachedTokens / stats.totalInputTokens;
    return inputCost * cacheRatio * CACHE_SAVINGS_RATIO;
  }, [stats.totalCachedTokens, stats.totalInputTokens, stats.totalCost, totalTokens]);

  /** 导出统计数据为 JSON 文件 */
  const exportStats = useCallback(() => {
    const data = {
      exportedAt: new Date().toISOString(),
      summary: {
        totalRequests: stats.totalRequests,
        totalTokens,
        totalCost: stats.totalCost,
        cacheSavings
      },
      byApi: stats.byApi,
      byModel: stats.byModel
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tokenbao-stats-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('统计数据已导出', 'success');
  }, [stats, totalTokens, cacheSavings]);

  if (loading) {
    return (
      <div className="page">
        <h2>监控仪表盘</h2>
        <div className="stats-grid">
          <div className="skeleton skeleton-card" />
          <div className="skeleton skeleton-card" />
          <div className="skeleton skeleton-card" />
          <div className="skeleton skeleton-card" />
        </div>
      </div>
    );
  }

  const savedCost = cacheSavings.toFixed(2);
  const actualCost = stats.totalCost.toFixed(4);

  return (
    <div className="page">
      <div className="page-header">
        <h2>监控仪表盘</h2>
        <div className="page-header-actions">
          {stats.totalRequests > 0 && (
            <button className="btn-secondary btn-sm" onClick={exportStats}>导出数据</button>
          )}
          <button className="btn-secondary btn-sm" onClick={loadStats} aria-label="刷新统计数据">刷新</button>
        </div>
      </div>

      {stats.totalRequests === 0 ? (
        <div className="empty-placeholder">
          <p className="title">暂无统计数据</p>
          <p className="desc">启动代理并发送请求后，统计数据将在此处展示</p>
        </div>
      ) : (
        <>
          <div className="stats-grid" aria-live="polite" aria-atomic="true">
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
              <p className="stat-detail">缓存 Tokens: {stats.totalCachedTokens.toLocaleString()}</p>
            </div>
          </div>

          {stats.totalCachedTokens > 0 && (
            <div className="stats-grid">
              <div className="stat-card cache-card">
                <h3>Prompt Caching 效果</h3>
                <p className="stat-value">{stats.totalCachedTokens.toLocaleString()}</p>
                <p className="stat-detail">缓存读取 Tokens</p>
              </div>
              <div className="stat-card cache-card">
                <h3>缓存节省费用</h3>
                <p className="stat-value">${cacheSavings.toFixed(4)}</p>
                <p className="stat-detail">基于实际成本保守估算</p>
              </div>
            </div>
          )}

          <div className="stats-details">
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
