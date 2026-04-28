import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { showToast } from '../components/Toast';
import { usePolling } from '../hooks/usePolling';
import { formatMoney } from '../utils/format';

/**
 * 缓存节省估算：缓存 token 的费用是非缓存的 10%（即节省 90%）
 * Anthropic Prompt Caching 官方定价：缓存读取 = 输入价格 × 0.1
 */
const CACHE_SAVINGS_RATIO = 0.9;

/** 安全格式化费用（4 位小数），用于统计展示 */
function formatCost(value: number): string {
  return formatMoney(value, 4);
}

function Monitor() {
  const pendingBlobUrlRef = useRef<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [stats, setStats] = useState({
    totalRequests: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCachedTokens: 0,
    totalCost: 0,
    byApi: {} as Record<string, { requests: number; tokens: number; cost: number }>,
    byModel: {} as Record<string, { requests: number; tokens: number; cost: number }>,
    cacheMetrics: { hits: 0, misses: 0, size: 0, hitRate: 0 }
  });

  const loadStats = useCallback(async () => {
    if (window.electronAPI?.stats?.summary) {
      try {
        const data = await window.electronAPI.stats.summary();
        setStats(prev => ({
          ...prev,
          ...data,
          cacheMetrics: data.cacheMetrics || prev.cacheMetrics
        }));
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
    return () => {
      // 组件卸载时释放未清理的 blob URL
      if (pendingBlobUrlRef.current) {
        URL.revokeObjectURL(pendingBlobUrlRef.current);
      }
    };
  }, [loadStats]);

  usePolling(loadStats, 10000);

  const totalTokens = useMemo(() =>
    stats.totalInputTokens + stats.totalOutputTokens,
    [stats.totalInputTokens, stats.totalOutputTokens]
  );

  const cacheSavings = useMemo(() => {
    // cachedTokens 是 inputTokens 的子集，不应重复计算
    if (stats.totalInputTokens === 0 || stats.totalCost === 0 || totalTokens === 0) return 0;
    // 用 token 比例估算缓存部分对应的输入费用，乘以节省比例
    const inputCost = stats.totalCost * (stats.totalInputTokens / totalTokens);
    const cacheRatio = stats.totalCachedTokens / stats.totalInputTokens;
    const savings = inputCost * cacheRatio * CACHE_SAVINGS_RATIO;
    // 防止 stats 数据被污染时产生 NaN/Infinity
    return Number.isFinite(savings) && savings >= 0 ? savings : 0;
  }, [stats.totalCachedTokens, stats.totalInputTokens, stats.totalCost, totalTokens]);

  /** 导出统计数据为 JSON 文件 */
  const exportStats = useCallback(() => {
    try {
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
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // 追踪 blob URL，组件卸载时可清理；延迟释放确保浏览器完成下载
      pendingBlobUrlRef.current = url;
      setTimeout(() => { URL.revokeObjectURL(url); pendingBlobUrlRef.current = null; }, 1000);
      showToast('统计数据已导出', 'success');
    } catch (err) {
      console.error('导出统计数据失败:', err);
      showToast('导出失败', 'error');
    }
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

  const savedCost = (Number.isFinite(cacheSavings) ? cacheSavings : 0).toFixed(2);
  const actualCost = formatCost(stats.totalCost);

  /** ROI 效率指标 */
  const avgCostPerRequest = useMemo(() => {
    if (stats.totalRequests === 0) return 0;
    const avg = stats.totalCost / stats.totalRequests;
    return Number.isFinite(avg) ? avg : 0;
  }, [stats.totalCost, stats.totalRequests]);

  const savingsRate = useMemo(() => {
    const totalWithSavings = stats.totalCost + cacheSavings;
    if (totalWithSavings === 0) return 0;
    const rate = (cacheSavings / totalWithSavings) * 100;
    return Number.isFinite(rate) ? Math.min(rate, 100) : 0;
  }, [cacheSavings, stats.totalCost]);

  /** 模型成本排名（按费用降序） */
  const modelRanking = useMemo(() =>
    Object.entries(stats.byModel)
      .map(([model, data]) => ({ model, ...data }))
      .sort((a, b) => b.cost - a.cost)
      .slice(0, 10),
    [stats.byModel]
  );

  return (
    <div className="page">
      <div className="page-header">
        <h2>监控仪表盘</h2>
        <div className="page-header-actions">
          {stats.totalRequests > 0 && (
            <button className="btn-secondary btn-sm" onClick={exportStats}>导出数据</button>
          )}
          <button className="btn-secondary btn-sm" onClick={() => { setRefreshing(true); loadStats().finally(() => setRefreshing(false)); }} aria-label="刷新统计数据" disabled={refreshing}>{refreshing ? '刷新中...' : '刷新'}</button>
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
                <h3>缓存命中率</h3>
                <p className="stat-value">{stats.cacheMetrics.hitRate}%</p>
                <p className="stat-detail">命中 {stats.cacheMetrics.hits} / 未命中 {stats.cacheMetrics.misses} | 缓存条目 {stats.cacheMetrics.size}</p>
              </div>
              <div className="stat-card cache-card">
                <h3>缓存节省费用</h3>
                <p className="stat-value">${formatCost(cacheSavings)}</p>
                <p className="stat-detail">基于实际成本保守估算</p>
              </div>
            </div>
          )}

          {/* ROI 效率指标 */}
          <div className="stats-grid">
            <div className="stat-card">
              <h3>节省率</h3>
              <p className="stat-value">{savingsRate.toFixed(1)}%</p>
              <p className="stat-detail">优化策略为您节省的费用比例</p>
            </div>
            <div className="stat-card">
              <h3>平均每请求成本</h3>
              <p className="stat-value">${formatCost(avgCostPerRequest)}</p>
              <p className="stat-detail">基于 {stats.totalRequests} 次请求</p>
            </div>
            <div className="stat-card">
              <h3>平均每请求 Tokens</h3>
              <p className="stat-value">{stats.totalRequests > 0 ? Math.round(totalTokens / stats.totalRequests).toLocaleString() : '0'}</p>
              <p className="stat-detail">输入+输出合计</p>
            </div>
          </div>

          {/* 模型成本排名 */}
          {modelRanking.length > 0 && (
            <div className="stats-details">
              <h3>模型成本排名</h3>
              <table className="data-table" aria-label="模型成本排名">
                <thead>
                  <tr>
                    <th>模型</th>
                    <th>请求数</th>
                    <th>Tokens</th>
                    <th>费用</th>
                    <th>占比</th>
                  </tr>
                </thead>
                <tbody>
                  {modelRanking.map((item) => {
                    const costPercent = stats.totalCost > 0 ? (item.cost / stats.totalCost * 100) : 0;
                    return (
                      <tr key={item.model}>
                        <td>{item.model}</td>
                        <td>{item.requests}</td>
                        <td>{item.tokens.toLocaleString()}</td>
                        <td>${formatCost(item.cost)}</td>
                        <td>
                          <div className="cost-bar-container">
                            <div className="cost-bar-fill" style={{ width: `${Math.min(costPercent, 100)}%` }} />
                            <span className="cost-bar-label">{costPercent.toFixed(1)}%</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
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
                        请求: {data.requests} | Tokens: {data.tokens.toLocaleString()} | 费用: ${formatCost(data.cost)}
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
                        请求: {data.requests} | Tokens: {data.tokens.toLocaleString()} | 费用: ${formatCost(data.cost)}
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
