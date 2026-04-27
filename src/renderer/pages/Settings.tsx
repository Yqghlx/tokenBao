import { useState, useEffect, useCallback } from 'react';
import { showToast } from '../components/Toast';

function Settings() {
  const [proxyPort, setProxyPort] = useState('3000');
  const [dataRetentionDays, setDataRetentionDays] = useState('30');
  const [cacheTTL, setCacheTTL] = useState('5min');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadSettings = useCallback(async () => {
    if (window.electronAPI?.config?.getAll) {
      try {
        const config = await window.electronAPI.config.getAll();
        setProxyPort(config.proxyPort || '3000');
        setDataRetentionDays(config.dataRetentionDays || '30');
        setCacheTTL(config.cacheTTL || '5min');
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

  const resetSettings = async () => {
    if (window.electronAPI?.config?.reset) {
      try {
        await window.electronAPI.config.reset();
        await loadSettings();
        showToast('已恢复默认设置', 'success');
      } catch (err) {
        console.error('重置设置失败:', err);
        showToast('重置失败', 'error');
      }
    }
  };

  const saveSettings = async () => {
    const port = parseInt(proxyPort, 10);
    if (isNaN(port) || port < 1024 || port > 65535) {
      showToast('端口范围应为 1024-65535', 'error');
      return;
    }

    const days = parseInt(dataRetentionDays, 10);
    if (isNaN(days) || days < 1 || days > 365) {
      showToast('数据保留天数应为 1-365', 'error');
      return;
    }

    if (window.electronAPI?.config?.set) {
      setSaving(true);
      try {
        await window.electronAPI.config.set('proxyPort', proxyPort);
        await window.electronAPI.config.set('dataRetentionDays', dataRetentionDays);
        await window.electronAPI.config.set('cacheTTL', cacheTTL);
        showToast('设置已保存', 'success');
      } catch (err) {
        console.error('保存设置失败:', err);
        showToast('保存失败', 'error');
      } finally {
        setSaving(false);
      }
    }
  };

  if (loading) {
    return <div className="page"><h2>设置</h2><p>加载中...</p></div>;
  }

  return (
    <div className="page">
      <h2>设置</h2>
      <div className="settings-form">
        <div className="form-group">
          <label>代理端口</label>
          <input
            type="number"
            value={proxyPort}
            onChange={(e) => setProxyPort(e.target.value)}
            min={1024}
            max={65535}
            disabled={loading}
          />
          <span className="toggle-desc">范围: 1024-65535</span>
        </div>
        <div className="form-group">
          <label>数据保留天数</label>
          <input
            type="number"
            value={dataRetentionDays}
            onChange={(e) => setDataRetentionDays(e.target.value)}
            min={1}
            max={365}
            disabled={loading}
          />
        </div>
        <div className="form-group">
          <label>缓存 TTL</label>
          <select
            value={cacheTTL}
            onChange={(e) => setCacheTTL(e.target.value)}
            disabled={loading}
          >
            <option value="5min">5 分钟</option>
            <option value="1hour">1 小时</option>
          </select>
        </div>
        <button className="btn-primary" onClick={saveSettings} disabled={saving || loading}>
          {saving ? '保存中...' : '保存设置'}
        </button>
        <button className="btn-secondary" onClick={resetSettings} disabled={saving || loading} style={{ marginLeft: '8px' }}>
          恢复默认
        </button>
      </div>
    </div>
  );
}

export default Settings;
