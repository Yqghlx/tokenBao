import { useState, useEffect, useCallback } from 'react';
import { showToast } from '../components/Toast';
import ConfirmDialog from '../components/ConfirmDialog';

interface ApiKeyItem {
  id: number;
  name: string;
  type: string;
  createdAt: string;
  updatedAt: string;
}

function ApiKeys() {
  const [apiKeys, setApiKeys] = useState<ApiKeyItem[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [newKey, setNewKey] = useState({ name: '', type: 'openai', key: '' });

  const loadApiKeys = useCallback(async () => {
    if (window.electronAPI?.apiKeys?.list) {
      try {
        const keys = await window.electronAPI.apiKeys.list();
        setApiKeys(keys);
      } catch (err) {
        console.error('获取 API Keys 失败:', err);
        showToast('加载 API Keys 失败', 'error');
      } finally {
        setLoading(false);
      }
    } else {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadApiKeys();
  }, [loadApiKeys]);

  const addApiKey = async () => {
    if (!newKey.name || !newKey.key) {
      showToast('请填写名称和 Key', 'error');
      return;
    }

    if (newKey.type === 'openai' && !newKey.key.startsWith('sk-')) {
      showToast('OpenAI API Key 应以 sk- 开头', 'error');
      return;
    }

    if (newKey.type === 'anthropic' && !newKey.key.startsWith('sk-ant-')) {
      showToast('Anthropic API Key 应以 sk-ant- 开头', 'error');
      return;
    }

    if (window.electronAPI?.apiKeys?.add) {
      setSaving(true);
      try {
        await window.electronAPI.apiKeys.add(newKey.name, newKey.type, newKey.key);
        setNewKey({ name: '', type: 'openai', key: '' });
        setShowAddForm(false);
        loadApiKeys();
        showToast('API Key 已添加', 'success');
      } catch (err) {
        const msg = err instanceof Error ? err.message : '添加失败';
        showToast(msg, 'error');
      } finally {
        setSaving(false);
      }
    }
  };

  const deleteApiKey = async (id: number) => {
    if (window.electronAPI?.apiKeys?.delete) {
      setDeletingId(id);
      try {
        await window.electronAPI.apiKeys.delete(id);
        setConfirmDeleteId(null);
        loadApiKeys();
        showToast('API Key 已删除', 'info');
      } catch (err) {
        console.error('删除 API Key 失败:', err);
        showToast('删除失败', 'error');
      } finally {
        setDeletingId(null);
      }
    }
  };

  if (loading) {
    return (
      <div className="page">
        <h2>API Keys 管理</h2>
        <div className="stats-grid">
          <div className="skeleton skeleton-card" />
          <div className="skeleton skeleton-card" />
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="page-header">
        <h2>API Keys 管理</h2>
        <button className="btn-primary" onClick={() => setShowAddForm(true)} aria-label="添加 API Key">
          添加 API Key
        </button>
      </div>

      {showAddForm && (
        <div className="add-form info-panel" role="form" aria-label="添加 API Key 表单">
          <div className="form-group">
            <label htmlFor="key-name">名称</label>
            <input
              id="key-name"
              type="text"
              value={newKey.name}
              onChange={(e) => setNewKey(prev => ({ ...prev, name: e.target.value }))}
              placeholder="例如: 我的 OpenAI Key"
              aria-required="true"
            />
          </div>
          <div className="form-group">
            <label htmlFor="key-type">类型</label>
            <select
              id="key-type"
              value={newKey.type}
              onChange={(e) => setNewKey(prev => ({ ...prev, type: e.target.value, key: '' }))}
            >
              <option value="openai">OpenAI</option>
              <option value="anthropic">Anthropic</option>
            </select>
          </div>
          <div className="form-group">
            <label htmlFor="key-value">API Key</label>
            <input
              id="key-value"
              type="password"
              value={newKey.key}
              onChange={(e) => setNewKey(prev => ({ ...prev, key: e.target.value }))}
              placeholder="sk-..."
              aria-required="true"
            />
          </div>
          <div className="form-actions">
            <button className="btn-primary" onClick={addApiKey} disabled={saving} aria-label={saving ? '保存中' : '保存 API Key'}>
              {saving ? '保存中...' : '保存'}
            </button>
            <button className="btn-secondary" onClick={() => setShowAddForm(false)}>取消</button>
          </div>
        </div>
      )}

      <table className="data-table" aria-label="API Keys 列表">
        <thead>
          <tr>
            <th>名称</th>
            <th>类型</th>
            <th>Key</th>
            <th>创建时间</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {apiKeys.length === 0 ? (
            <tr>
              <td colSpan={5} className="empty-state">暂无 API Keys，点击上方按钮添加</td>
            </tr>
          ) : (
            apiKeys.map((key) => (
              <tr key={key.id}>
                <td>{key.name}</td>
                <td>{key.type}</td>
                <td>••••••••</td>
                <td>{new Date(key.createdAt).toLocaleDateString()}</td>
                <td>
                  <button
                    className="btn-secondary btn-sm"
                    onClick={() => setConfirmDeleteId(key.id)}
                    disabled={deletingId !== null}
                    aria-label={`删除 ${key.name}`}
                  >
                    {deletingId === key.id ? '删除中...' : '删除'}
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      <ConfirmDialog
        open={confirmDeleteId !== null}
        title="删除 API Key"
        message={(() => {
          const key = apiKeys.find(k => k.id === confirmDeleteId);
          return key ? `确定要删除「${key.name}」(${key.type}) 吗？删除后无法恢复。` : '确定要删除此 API Key 吗？';
        })()}
        confirmLabel="删除"
        danger
        onConfirm={() => {
          if (confirmDeleteId !== null) deleteApiKey(confirmDeleteId);
        }}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </div>
  );
}

export default ApiKeys;
