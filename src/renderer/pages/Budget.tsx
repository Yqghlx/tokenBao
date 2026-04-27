import { useState, useEffect, useCallback } from 'react';
import { showToast } from '../components/Toast';
import { usePolling } from '../hooks/usePolling';

function Budget() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{
    daily: { limit: number; spent: number; remaining: number; percentage: number };
    monthly: { limit: number; spent: number; remaining: number; percentage: number };
  }>({
    daily: { limit: 10, spent: 0, remaining: 10, percentage: 0 },
    monthly: { limit: 100, spent: 0, remaining: 100, percentage: 0 }
  });
  const [dailyLimit, setDailyLimit] = useState('10');
  const [monthlyLimit, setMonthlyLimit] = useState('100');

  const loadBudget = useCallback(async () => {
    if (window.electronAPI?.budget?.status) {
      try {
        const data = await window.electronAPI.budget.status();
        setStatus(data);
        setDailyLimit(String(data.daily.limit));
        setMonthlyLimit(String(data.monthly.limit));
      } catch (err) {
        console.error('加载预算状态失败:', err);
      } finally {
        setLoading(false);
      }
    } else {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBudget();
  }, [loadBudget]);

  usePolling(loadBudget, 15000);

  const saveBudget = async (type: 'daily' | 'monthly', value: string) => {
    const limit = parseFloat(value);
    if (isNaN(limit) || limit < 0) {
      showToast('预算限额不能为负数', 'error');
      return;
    }

    if (window.electronAPI?.budget?.set) {
      setSaving(true);
      try {
        await window.electronAPI.budget.set(type, limit);
        await loadBudget();
        showToast(`${type === 'daily' ? '日' : '月'}预算已更新`, 'success');
      } catch (err) {
        console.error('保存预算失败:', err);
        showToast('保存失败', 'error');
      } finally {
        setSaving(false);
      }
    }
  };

  const resetSpent = async (type: 'daily' | 'monthly') => {
    if (window.electronAPI?.budget?.set) {
      try {
        // 通过设置相同限额触发重置（服务端 resetSpent）
        const limit = type === 'daily' ? status.daily.limit : status.monthly.limit;
        await window.electronAPI.budget.set(type, limit);
        await loadBudget();
        showToast(`${type === 'daily' ? '日' : '月'}支出已重置`, 'success');
      } catch (err) {
        console.error('重置失败:', err);
        showToast('重置失败', 'error');
      }
    }
  };

  if (loading) {
    return <div className="page"><h2>预算管理</h2><p>加载中...</p></div>;
  }

  const renderProgressBar = (percentage: number) => {
    const color = percentage >= 100 ? '#ef4444' : percentage >= 80 ? '#f59e0b' : '#22c55e';
    return (
      <div style={{ width: '100%', height: '8px', background: '#1a1a2e', borderRadius: '4px', marginTop: '8px', overflow: 'hidden' }}>
        <div style={{
          width: `${Math.min(100, percentage)}%`,
          height: '100%',
          background: color,
          borderRadius: '4px',
          transition: 'width 0.5s ease'
        }} />
      </div>
    );
  };

  const renderBudgetCard = (
    title: string,
    type: 'daily' | 'monthly',
    limit: string,
    setLimit: (v: string) => void,
    budgetStatus: { limit: number; spent: number; remaining: number; percentage: number }
  ) => (
    <div className="stat-card">
      <h3>{title}</h3>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '4px' }}>
        <span style={{ fontSize: '28px', fontWeight: 600, color: budgetStatus.percentage >= 100 ? '#ef4444' : '#00d4ff' }}>
          ${budgetStatus.spent.toFixed(2)}
        </span>
        <span style={{ fontSize: '14px', color: '#666' }}>
          / ${budgetStatus.limit.toFixed(2)}
        </span>
      </div>
      <p style={{ fontSize: '12px', color: '#888', marginBottom: '2px' }}>
        剩余: ${budgetStatus.remaining.toFixed(2)} ({budgetStatus.percentage}% 已使用)
      </p>
      {renderProgressBar(budgetStatus.percentage)}
      {budgetStatus.percentage >= 80 && (
        <p style={{ fontSize: '12px', color: budgetStatus.percentage >= 100 ? '#ef4444' : '#f59e0b', marginTop: '8px' }}>
          {budgetStatus.percentage >= 100 ? '预算已超支！' : '预算即将用尽'}
        </p>
      )}
      <div style={{ display: 'flex', gap: '8px', marginTop: '16px', alignItems: 'center' }}>
        <input
          type="number"
          value={limit}
          onChange={(e) => setLimit(e.target.value)}
          min={0}
          step={1}
          style={{ width: '100px', padding: '6px 8px', borderRadius: '4px', border: '1px solid #333', background: '#1a1a2e', color: '#eee', fontSize: '14px' }}
        />
        <span style={{ fontSize: '12px', color: '#666' }}>$</span>
        <button className="btn-primary" onClick={() => saveBudget(type, limit)} disabled={saving} style={{ padding: '6px 12px', fontSize: '13px' }}>
          保存
        </button>
        <button className="btn-secondary" onClick={() => resetSpent(type)} disabled={saving} style={{ padding: '6px 12px', fontSize: '13px' }}>
          重置支出
        </button>
      </div>
    </div>
  );

  return (
    <div className="page">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <h2 style={{ margin: 0 }}>预算管理</h2>
        <button className="btn-secondary" onClick={loadBudget}>刷新</button>
      </div>

      <div className="stats-grid">
        {renderBudgetCard('日预算', 'daily', dailyLimit, setDailyLimit, status.daily)}
        {renderBudgetCard('月预算', 'monthly', monthlyLimit, setMonthlyLimit, status.monthly)}
      </div>

      <div style={{ marginTop: '24px', padding: '16px', background: '#16213e', borderRadius: '8px' }}>
        <h3 style={{ marginBottom: '12px' }}>预算说明</h3>
        <ul style={{ fontSize: '14px', lineHeight: '1.8', paddingLeft: '20px', color: '#a0a0a0' }}>
          <li>日预算每天自动重置，月预算每月自动重置</li>
          <li>预算基于代理转发的 API 请求实际费用计算</li>
          <li>达到 80% 时显示警告，100% 时显示超支提醒</li>
          <li>「重置支出」可手动清零当前周期的支出记录</li>
        </ul>
      </div>
    </div>
  );
}

export default Budget;
