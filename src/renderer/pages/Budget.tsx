import { useState, useEffect, useCallback, useRef } from 'react';
import { showToast } from '../components/Toast';
import ConfirmDialog from '../components/ConfirmDialog';
import { usePolling } from '../hooks/usePolling';
import { formatMoney } from '../utils/format';

function Budget() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Set<string>>(new Set());
  const [confirmReset, setConfirmReset] = useState<{ type: 'daily' | 'monthly'; label: string } | null>(null);
  // 用 ref 追踪正在编辑的字段，避免作为依赖导致 loadBudget 重建和轮询重注册
  const editingFieldRef = useRef<'daily' | 'monthly' | null>(null);
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
        // 轮询时只更新未在编辑的字段，避免覆盖用户输入
        if (editingFieldRef.current !== 'daily') setDailyLimit(String(data.daily.limit));
        if (editingFieldRef.current !== 'monthly') setMonthlyLimit(String(data.monthly.limit));
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
    if (!Number.isFinite(limit) || limit <= 0) {
      showToast('预算限额必须为正数', 'error');
      return;
    }

    if (window.electronAPI?.budget?.set) {
      setSaving(prev => new Set(prev).add(type));
      try {
        await window.electronAPI.budget.set(type, limit);
        await loadBudget();
        showToast(`${type === 'daily' ? '日' : '月'}预算已更新`, 'success');
      } catch (err) {
        console.error('保存预算失败:', err);
        showToast('保存失败', 'error');
      } finally {
        setSaving(prev => { const next = new Set(prev); next.delete(type); return next; });
      }
    }
  };

  const resetSpent = async (type: 'daily' | 'monthly') => {
    if (window.electronAPI?.budget?.resetSpent) {
      try {
        await window.electronAPI.budget.resetSpent(type);
        await loadBudget();
        showToast(`${type === 'daily' ? '日' : '月'}支出已重置`, 'success');
      } catch (err) {
        console.error('重置失败:', err);
        showToast('重置失败', 'error');
      }
    }
  };

  if (loading) {
    return (
      <div className="page">
        <h2>预算管理</h2>
        <div className="stats-grid">
          <div className="skeleton skeleton-card" />
          <div className="skeleton skeleton-card" />
        </div>
      </div>
    );
  }

  const renderProgressBar = (percentage: number) => {
    const color = percentage >= 100 ? '#ef4444' : percentage >= 80 ? '#f59e0b' : '#22c55e';
    return (
      <div className="progress-bar" role="progressbar" aria-valuenow={Math.min(100, Math.round(percentage))} aria-valuemin={0} aria-valuemax={100} aria-valuetext={`${Math.round(percentage)}% 已使用`} aria-label={`预算使用 ${Math.round(percentage)}%`}>
        <div className="progress-bar-fill" style={{ width: `${Math.min(100, percentage)}%`, background: color }} />
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
      <div className="budget-values">
        <span className={`budget-amount ${budgetStatus.percentage >= 100 ? 'over-budget' : ''}`}>
          ${formatMoney(budgetStatus.spent)}
        </span>
        <span className="budget-limit">
          / ${formatMoney(budgetStatus.limit)}
        </span>
      </div>
      <p className="budget-remaining">
        剩余: ${formatMoney(budgetStatus.remaining)} ({budgetStatus.percentage}% 已使用)
      </p>
      {renderProgressBar(budgetStatus.percentage)}
      {budgetStatus.percentage >= 80 && (
        <p className={`budget-warning ${budgetStatus.percentage >= 100 ? 'danger' : 'warn'}`}>
          {budgetStatus.percentage >= 100 ? '预算已超支！' : '预算即将用尽'}
        </p>
      )}
      <div className="budget-edit-row">
        <input
          type="number"
          className="budget-input"
          value={limit}
          onChange={(e) => setLimit(e.target.value)}
          onFocus={() => { editingFieldRef.current = type; }}
          onBlur={() => { editingFieldRef.current = null; }}
          min={0}
          step={1}
        />
        <span className="budget-input-suffix">$</span>
        <button className="btn-primary btn-sm" onClick={() => saveBudget(type, limit)} disabled={saving.has(type)}>
          保存
        </button>
        <button className="btn-secondary btn-sm" onClick={() => setConfirmReset({ type, label: type === 'daily' ? '日' : '月' })} disabled={saving.has(type)}>
          重置支出
        </button>
      </div>
    </div>
  );

  return (
    <div className="page">
      <div className="page-header">
        <h2>预算管理</h2>
        <button className="btn-secondary" onClick={loadBudget} disabled={saving.size > 0}>刷新</button>
      </div>

      <div className="stats-grid">
        {renderBudgetCard('日预算', 'daily', dailyLimit, setDailyLimit, status.daily)}
        {renderBudgetCard('月预算', 'monthly', monthlyLimit, setMonthlyLimit, status.monthly)}
      </div>

      <div className="info-panel">
        <h3>预算说明</h3>
        <ul>
          <li>日预算每天自动重置，月预算每月自动重置</li>
          <li>预算基于代理转发的 API 请求实际费用计算</li>
          <li>达到 80% 时显示警告，100% 时自动拦截新请求（返回 429）</li>
          <li>「重置支出」可手动清零当前周期的支出记录</li>
        </ul>
      </div>

      <ConfirmDialog
        open={confirmReset !== null}
        title="重置支出"
        message={`确定要重置${confirmReset?.label || ''}支出记录吗？此操作不可撤销。`}
        confirmLabel="重置"
        danger
        onConfirm={() => {
          if (confirmReset) resetSpent(confirmReset.type);
          setConfirmReset(null);
        }}
        onCancel={() => setConfirmReset(null)}
      />
    </div>
  );
}

export default Budget;
