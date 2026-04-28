import { useState, useEffect, useCallback, useMemo } from 'react';
import { showToast } from '../components/Toast';
import { usePolling } from '../hooks/usePolling';
import { formatMoney } from '../utils/format';

/** 将秒数格式化为可读时长 */
function formatUptime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0秒';
  if (seconds < 60) return `${Math.floor(seconds)}秒`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}分${Math.floor(seconds % 60)}秒`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}时${m}分`;
}

function ControlPanel() {
  const [proxyStatus, setProxyStatus] = useState({
    running: false,
    port: 0,
    requests: 0,
    savedTokens: 0
  });
  const [budgetStatus, setBudgetStatus] = useState({
    spent: 0,
    limit: 100,
    remaining: 100
  });
  const [statsData, setStatsData] = useState({
    totalRequests: 0,
    totalCachedTokens: 0,
    cacheRate: 0
  });
  const [optimizations, setOptimizations] = useState({
    caching: true,
    compression: true,
    routing: true,
    batching: false
  });
  const [loading, setLoading] = useState(true);
  const [togglingProxy, setTogglingProxy] = useState(false);
  const [health, setHealth] = useState({ uptime: 0, activeConnections: 0 });

  const loadProxyStatus = useCallback(async () => {
    if (window.electronAPI?.proxy?.status) {
      try {
        const status = await window.electronAPI.proxy.status();
        let port = status.port;
        if (!port && window.electronAPI?.config?.get) {
          const configPort = await window.electronAPI.config.get('proxyPort');
          const parsed = configPort ? parseInt(configPort, 10) : NaN;
          port = Number.isFinite(parsed) && parsed >= 1024 && parsed <= 65535 ? parsed : 3000;
        }
        setProxyStatus(prev => ({
          ...prev,
          running: status.running,
          port,
          requests: status.requests
        }));
      } catch (err) {
        console.error('获取代理状态失败:', err);
      }
    }
  }, []);

  const loadBudgetStatus = useCallback(async () => {
    if (window.electronAPI?.budget?.status) {
      try {
        const raw = await window.electronAPI.budget.status();
        // 安全提取 monthly 字段，防止 API 返回结构变化
        const monthly = typeof raw === 'object' && raw !== null && 'monthly' in raw
          ? (raw as Record<string, unknown>).monthly
          : null;
        const m = typeof monthly === 'object' && monthly !== null
          ? monthly as Record<string, unknown>
          : {};
        setBudgetStatus({
          spent: typeof m.spent === 'number' ? m.spent : 0,
          limit: typeof m.limit === 'number' ? m.limit : 100,
          remaining: typeof m.remaining === 'number' ? m.remaining : 100
        });
      } catch (err) {
        console.error('获取预算状态失败:', err);
      }
    }
  }, []);

  const loadStats = useCallback(async () => {
    if (window.electronAPI?.stats?.summary) {
      try {
        const stats = await window.electronAPI.stats.summary();
        const totalTokens = stats.totalInputTokens + stats.totalOutputTokens;
        const cacheRate = totalTokens > 0
          ? Math.round((stats.totalCachedTokens / totalTokens) * 100)
          : 0;
        setStatsData({
          totalRequests: stats.totalRequests,
          totalCachedTokens: stats.totalCachedTokens,
          cacheRate
        });
        if (stats.byApi) {
          const savedTokens = Object.values(stats.byApi)
            .reduce((sum: number, api) => sum + (api.tokens || 0), 0);
          setProxyStatus(prev => ({ ...prev, savedTokens }));
        }
      } catch (err) {
        console.error('获取统计数据失败:', err);
      }
    }
  }, []);

  const loadOptimizations = useCallback(async () => {
    if (window.electronAPI?.optimization?.getConfig) {
      try {
        const config = await window.electronAPI.optimization.getConfig();
        setOptimizations({
          caching: config.caching ?? true,
          compression: config.compression ?? true,
          routing: config.routing ?? true,
          batching: config.batching ?? false
        });
      } catch (err) {
        console.error('获取优化配置失败:', err);
      }
    }
  }, []);

  useEffect(() => {
    const loadAll = async () => {
      const results = await Promise.allSettled([
        loadProxyStatus(),
        loadBudgetStatus(),
        loadStats(),
        loadOptimizations()
      ]);
      const failed = results.filter(r => r.status === 'rejected');
      if (failed.length > 0 && failed.length < results.length) {
        showToast(`${failed.length} 项数据加载失败，部分数据可能不准确`, 'error');
      } else if (failed.length === results.length) {
        showToast('数据加载失败，请检查应用状态', 'error');
      }
      setLoading(false);
    };
    loadAll();
  }, [loadProxyStatus, loadBudgetStatus, loadStats, loadOptimizations]);

  const pollStats = useCallback(() => {
    loadProxyStatus();
    loadStats();
    if (window.electronAPI?.proxy?.health) {
      window.electronAPI.proxy.health().then(h => {
        if (h.status === 'healthy') {
          setHealth({ uptime: h.uptime, activeConnections: h.activeConnections });
        }
      }).catch(err => {
        console.warn('健康检查轮询失败:', err);
      });
    }
  }, [loadProxyStatus, loadStats]);

  usePolling(pollStats, 3000);

  const startProxy = useCallback(async () => {
    setTogglingProxy(true);
    try {
      if (window.electronAPI?.proxy?.start) {
        const result = await window.electronAPI.proxy.start(proxyStatus.port);
        if (result.success) {
          setProxyStatus(prev => ({ ...prev, running: true }));
          showToast(`代理已启动，API 地址: http://localhost:${result.port || proxyStatus.port}`, 'success');
        } else {
          showToast('启动失败: ' + (result.error || '未知错误'), 'error');
        }
      }
    } catch (err) {
      console.error('启动代理失败:', err);
      showToast('启动代理失败', 'error');
    } finally {
      setTogglingProxy(false);
    }
  }, [proxyStatus.port]);

  const stopProxy = useCallback(async () => {
    setTogglingProxy(true);
    try {
      if (window.electronAPI?.proxy?.stop) {
        const result = await window.electronAPI.proxy.stop();
        if (result.success) {
          setProxyStatus(prev => ({ ...prev, running: false, requests: 0 }));
          showToast('代理已停止', 'info');
        }
      }
    } catch (err) {
      console.error('停止代理失败:', err);
      showToast('停止代理失败', 'error');
    } finally {
      setTogglingProxy(false);
    }
  }, []);

  const toggleOptimization = useCallback(async (key: string) => {
    const newValue = !optimizations[key as keyof typeof optimizations];
    setOptimizations(prev => ({ ...prev, [key]: newValue }));

    if (window.electronAPI?.optimization?.setConfig) {
      try {
        await window.electronAPI.optimization.setConfig({ [key]: newValue });
      } catch (err) {
        console.error('保存优化配置失败:', err);
        showToast('保存配置失败', 'error');
        setOptimizations(prev => ({ ...prev, [key]: !newValue }));
      }
    }
  }, [optimizations]);

  /** 预算使用百分比 */
  const budgetPercent = useMemo(() =>
    budgetStatus.limit > 0 ? Math.min(100, Math.round((budgetStatus.spent / budgetStatus.limit) * 100)) : 0,
    [budgetStatus.spent, budgetStatus.limit]
  );

  if (loading) {
    return (
      <div className="page">
        <h2>控制面板</h2>
        <div className="status-cards">
          <div className="skeleton skeleton-card" />
          <div className="skeleton skeleton-card" />
          <div className="skeleton skeleton-card" />
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <h2>控制面板</h2>

      <div className="status-cards">
        <div className="status-card">
          <h3>代理状态</h3>
          <p className={`status-value ${proxyStatus.running ? 'running' : ''}`} aria-live="polite">
            {proxyStatus.running ? '运行中' : '已停止'}
          </p>
          <span className="status-label">端口: {proxyStatus.port}</span>
          <div className="proxy-controls">
            {!proxyStatus.running ? (
              <button className="btn-primary" onClick={startProxy} disabled={togglingProxy}>
                {togglingProxy ? '启动中...' : '启动代理'}
              </button>
            ) : (
              <button className="btn-secondary" onClick={stopProxy} disabled={togglingProxy}>
                {togglingProxy ? '停止中...' : '停止代理'}
              </button>
            )}
          </div>
          {proxyStatus.running && (
            <div className="proxy-tip">
              将 API 地址改为: http://localhost:{proxyStatus.port}
            </div>
          )}
          {proxyStatus.requests > 0 && (
            <div className="proxy-request-count">
              已处理 {proxyStatus.requests} 个请求
            </div>
          )}
          {proxyStatus.running && (
            <div className="proxy-health-info">
              <span>运行: {formatUptime(health.uptime)}</span>
              <span>活跃连接: {health.activeConnections}</span>
            </div>
          )}
        </div>

        <div className="status-card">
          <h3>本月成本</h3>
          <p className="status-value" aria-live="polite">${formatMoney(budgetStatus.spent)}</p>
          <span className="status-label">预算: ${formatMoney(budgetStatus.limit)}</span>
          {budgetStatus.limit > 0 && (
            <div className="progress-bar" role="progressbar" aria-valuenow={budgetPercent} aria-valuemin={0} aria-valuemax={100} aria-label={`预算使用 ${budgetPercent}%`}>
              <div
                className="progress-bar-fill"
                style={{
                  width: `${budgetPercent}%`,
                  background: budgetPercent > 80 ? '#ef4444' : budgetPercent > 50 ? '#f59e0b' : '#4ade80'
                }}
              />
            </div>
          )}
        </div>

        <div className="status-card">
          <h3>节省 Tokens</h3>
          <p className="status-value">{statsData.totalCachedTokens}</p>
          <span className="status-label">缓存命中率: {statsData.cacheRate}%</span>
        </div>
      </div>

      <div className="controls-section">
        <h3>优化策略</h3>
        <div className="toggle-group">
          <label className="toggle">
            <input
              type="checkbox"
              checked={optimizations.caching}
              onChange={() => toggleOptimization('caching')}
              aria-label="Prompt Caching 优化开关"
            />
            <span>Prompt Caching</span>
            <span className="toggle-desc">(节省 50-90%)</span>
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={optimizations.compression}
              onChange={() => toggleOptimization('compression')}
              aria-label="Prompt 压缩优化开关"
            />
            <span>Prompt 压缩</span>
            <span className="toggle-desc">(节省 20-40%)</span>
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={optimizations.routing}
              onChange={() => toggleOptimization('routing')}
              aria-label="智能模型路由优化开关"
            />
            <span>智能模型路由</span>
            <span className="toggle-desc">(节省 60-95%)</span>
          </label>
          <label className="toggle">
            <input
              type="checkbox"
              checked={optimizations.batching}
              onChange={() => toggleOptimization('batching')}
              aria-label="请求批处理优化开关"
            />
            <span>请求批处理</span>
          </label>
        </div>
      </div>

      <div className="usage-guide info-panel">
        <h3>使用说明</h3>
        <ol>
          <li>点击「启动代理」按钮启动本地代理服务器</li>
          <li>将你的 API 调用地址从 <code className="inline-code">https://api.openai.com</code> 改为 <code className="inline-code">http://localhost:{proxyStatus.port}</code></li>
          <li>代理会自动应用优化策略并记录统计数据</li>
          <li>在「监控仪表盘」查看节省效果</li>
        </ol>
      </div>
    </div>
  );
}

export default ControlPanel;
