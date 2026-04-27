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
      try {
        await window.electronAPI.apiKeys.delete(id);
        setConfirmDeleteId(null);
        loadApiKeys();
        showToast('API Key 已删除', 'info');
      } catch (err) {
        console.error('删除 API Key 失败:', err);
        showToast('删除失败', 'error');
      }
    }
  };

  return (
    <div className="page">
      <h2>API Keys 管理</h2>
      <div className="api-keys-section">
        <button className="btn-primary" onClick={() => setShowAddForm(true)}>
          添加 API Key
        </button>
        
        {showAddForm && (
          <div className="add-form info-panel">
            <div className="form-group">
              <label>名称</label>
              <input
                type="text"
                value={newKey.name}
                onChange={(e) => setNewKey(prev => ({ ...prev, name: e.target.value }))}
                placeholder="例如: 我的 OpenAI Key"
              />
            </div>
            <div className="form-group">
              <label>类型</label>
              <select
                value={newKey.type}
                onChange={(e) => setNewKey(prev => ({ ...prev, type: e.target.value }))}
              >
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
              </select>
            </div>
            <div className="form-group">
              <label>API Key</label>
              <input
                type="password"
                value={newKey.key}
                onChange={(e) => setNewKey(prev => ({ ...prev, key: e.target.value }))}
                placeholder="sk-..."
              />
            </div>
            <div className="form-actions">
              <button className="btn-primary" onClick={addApiKey} disabled={saving}>
                {saving ? '保存中...' : '保存'}
              </button>
              <button className="btn-secondary" onClick={() => setShowAddForm(false)}>取消</button>
            </div>
          </div>
        )}

        <table className="data-table">

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
            {loading ? (
              <tr>
                <td colSpan={5} className="empty-state">加载中...</td>
              </tr>
            ) : apiKeys.length === 0 ? (
              <tr>
                <td colSpan={5} className="empty-state">暂无 API Keys</td>
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
                    >
                      删除
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <ConfirmDialog
        open={confirmDeleteId !== null}
        title="删除 API Key"
        message="确定要删除此 API Key 吗？删除后无法恢复。"
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