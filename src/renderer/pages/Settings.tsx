import { useState, useEffect, useCallback, useMemo } from 'react';
import { showToast } from '../components/Toast';
import ConfirmDialog from '../components/ConfirmDialog';

function Settings() {
  const [proxyPort, setProxyPort] = useState('3000');
  const [dataRetentionDays, setDataRetentionDays] = useState('30');
  const [cacheTTL, setCacheTTL] = useState('5min');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [portError, setPortError] = useState('');
  const [daysError, setDaysError] = useState('');
  // 保存已提交的值用于变更检测
  const [savedValues, setSavedValues] = useState({ proxyPort: '3000', dataRetentionDays: '30', cacheTTL: '5min' });

  const loadSettings = useCallback(async () => {
    if (window.electronAPI?.config?.getAll) {
      try {
        const config = await window.electronAPI.config.getAll();
        const values = {
          proxyPort: config.proxyPort || '3000',
          dataRetentionDays: config.dataRetentionDays || '30',
          cacheTTL: config.cacheTTL || '5min'
        };
        setProxyPort(values.proxyPort);
        setDataRetentionDays(values.dataRetentionDays);
        setCacheTTL(values.cacheTTL);
        setSavedValues(values);
      } catch (err) {
        console.error('加载设置失败:', err);
      } finally {
        setLoading(false);
      }
    } else {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  /** 实时校验端口输入 */
  const handlePortChange = (value: string) => {
    setProxyPort(value);
    const port = parseInt(value, 10);
    if (value && (!Number.isFinite(port) || port < 1024 || port > 65535)) {
      setPortError('端口范围应为 1024-65535');
    } else {
      setPortError('');
    }
  };

  /** 实时校验保留天数输入 */
  const handleDaysChange = (value: string) => {
    setDataRetentionDays(value);
    const days = parseInt(value, 10);
    if (value && (!Number.isFinite(days) || days < 1 || days > 365)) {
      setDaysError('天数范围应为 1-365');
    } else if (value && days < 7) {
      setDaysError('低于 7 天可能导致历史记录不足');
    } else {
      setDaysError('');
    }
  };

  const resetSettings = async () => {
    if (window.electronAPI?.config?.reset) {
      try {
        await window.electronAPI.config.reset();
        await loadSettings();
        setPortError('');
        setDaysError('');
        showToast('已恢复默认设置', 'success');
      } catch (err) {
        console.error('重置设置失败:', err);
        showToast('重置失败', 'error');
      }
    }
  };

  const saveSettings = async () => {
    const port = parseInt(proxyPort, 10);
    if (!Number.isFinite(port) || port < 1024 || port > 65535) {
      setPortError('端口范围应为 1024-65535');
      return;
    }

    const days = parseInt(dataRetentionDays, 10);
    if (!Number.isFinite(days) || days < 1 || days > 365) {
      setDaysError('天数范围应为 1-365');
      return;
    }

    if (window.electronAPI?.config?.set) {
      setSaving(true);
      const original = { proxyPort, dataRetentionDays, cacheTTL };
      try {
        const results = await Promise.allSettled([
          window.electronAPI.config.set('proxyPort', proxyPort),
          window.electronAPI.config.set('dataRetentionDays', dataRetentionDays),
          window.electronAPI.config.set('cacheTTL', cacheTTL)
        ]);
        const failed = results.filter(r => r.status === 'rejected');
        if (failed.length > 0) {
          // 部分失败时回滚 UI 状态
          setProxyPort(original.proxyPort);
          setDataRetentionDays(original.dataRetentionDays);
          setCacheTTL(original.cacheTTL);
          showToast(`${failed.length} 个设置保存失败`, 'error');
        } else {
          setSavedValues({ proxyPort, dataRetentionDays, cacheTTL });
          showToast('设置已保存', 'success');
        }
      } catch (err) {
        console.error('保存设置失败:', err);
        showToast('保存失败', 'error');
      } finally {
        setSaving(false);
      }
    }
  };

  if (loading) {
    return (
      <div className="page">
        <h2>设置</h2>
        <div className="settings-form">
          <div className="form-group">
            <div className="skeleton skeleton-text" />
            <div className="skeleton skeleton-row" />
          </div>
          <div className="form-group">
            <div className="skeleton skeleton-text" />
            <div className="skeleton skeleton-row" />
          </div>
          <div className="form-group">
            <div className="skeleton skeleton-text" />
            <div className="skeleton skeleton-row" />
          </div>
        </div>
      </div>
    );
  }

  const hasError = portError || daysError;
  const isDirty = useMemo(() =>
    String(proxyPort) !== String(savedValues.proxyPort) || String(dataRetentionDays) !== String(savedValues.dataRetentionDays) || String(cacheTTL) !== String(savedValues.cacheTTL),
    [proxyPort, dataRetentionDays, cacheTTL, savedValues]
  );

  // 有未保存变更时阻止页面关闭/刷新
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  return (
    <div className="page">
      <h2>设置</h2>
      <div className="settings-form">
        <div className="form-group">
          <label htmlFor="setting-proxy-port">代理端口</label>
          <input
            id="setting-proxy-port"
            type="number"
            value={proxyPort}
            onChange={(e) => handlePortChange(e.target.value)}
            min={1024}
            max={65535}
            aria-label="代理端口号"
          />
          {portError ? (
            <span className="form-error">{portError}</span>
          ) : (
            <span className="toggle-desc">范围: 1024-65535</span>
          )}
        </div>
        <div className="form-group">
          <label htmlFor="setting-retention-days">数据保留天数</label>
          <input
            id="setting-retention-days"
            type="number"
            value={dataRetentionDays}
            onChange={(e) => handleDaysChange(e.target.value)}
            min={1}
            max={365}
            aria-label="数据保留天数"
          />
          {daysError && <span className="form-error">{daysError}</span>}
        </div>
        <div className="form-group">
          <label htmlFor="setting-cache-ttl">缓存 TTL</label>
          <select
            id="setting-cache-ttl"
            value={cacheTTL}
            onChange={(e) => setCacheTTL(e.target.value)}
            aria-label="缓存 TTL"
          >
            <option value="5min">5 分钟</option>
            <option value="1hour">1 小时</option>
          </select>
        </div>
        <button className="btn-primary" onClick={saveSettings} disabled={saving || !!hasError || !isDirty}>
          {saving ? '保存中...' : '保存设置'}
        </button>
        <button className="btn-secondary" onClick={() => setShowResetConfirm(true)} disabled={saving}>
          恢复默认
        </button>
      </div>

      <ConfirmDialog
        open={showResetConfirm}
        title="恢复默认设置"
        message={
          <div>
            <p>此操作将恢复以下设置为默认值：</p>
            <ul style={{ margin: '8px 0', paddingLeft: '20px', lineHeight: 1.8 }}>
              <li>代理端口 → 3000</li>
              <li>数据保留天数 → 30</li>
              <li>缓存 TTL → 5 分钟</li>
            </ul>
            <p>API Keys 和预算设置不受影响。</p>
          </div>
        }
        confirmLabel="恢复默认"
        danger
        onConfirm={resetSettings}
        onCancel={() => setShowResetConfirm(false)}
      />
    </div>
  );
}

export default Settings;
