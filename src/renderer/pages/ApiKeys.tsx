import { useState, useEffect, useCallback } from 'react';

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
  const [newKey, setNewKey] = useState({ name: '', type: 'openai', key: '' });

  const loadApiKeys = useCallback(async () => {
    if (window.electronAPI?.apiKeys?.list) {
      try {
        const keys = await window.electronAPI.apiKeys.list();
        setApiKeys(keys);
      } catch (err) {
        console.error('获取 API Keys 失败:', err);
      }
    }
  }, []);

  useEffect(() => {
    loadApiKeys();
  }, [loadApiKeys]);

  const addApiKey = async () => {
    if (!newKey.name || !newKey.key) {
      alert('请填写名称和 Key');
      return;
    }

    if (newKey.type === 'openai' && !newKey.key.startsWith('sk-')) {
      alert('OpenAI API Key 应以 sk- 开头');
      return;
    }

    if (newKey.type === 'anthropic' && newKey.key.length < 20) {
      alert('Anthropic API Key 长度过短');
      return;
    }

    if (window.electronAPI?.apiKeys?.add) {
      try {
        await window.electronAPI.apiKeys.add(newKey.name, newKey.type, newKey.key);
        setNewKey({ name: '', type: 'openai', key: '' });
        setShowAddForm(false);
        loadApiKeys();

        alert('API Key 已添加');
      } catch (err) {
        console.error('添加 API Key 失败:', err);
        alert('添加失败');
      }
    }
  };

  const deleteApiKey = async (id: number) => {
    if (!window.confirm('确定要删除此 API Key吗？')) return;

    if (window.electronAPI?.apiKeys?.delete) {
      try {
        await window.electronAPI.apiKeys.delete(id);
        loadApiKeys();
      } catch (err) {
        console.error('删除 API Key 失败:', err);
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
          <div className="add-form" style={{ marginTop: '16px', padding: '16px', background: '#16213e', borderRadius: '8px' }}>
            <div className="form-group" style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', marginBottom: '4px' }}>名称</label>
              <input 
                type="text" 
                value={newKey.name}
                onChange={(e) => setNewKey(prev => ({ ...prev, name: e.target.value }))}
                placeholder="例如: 我的 OpenAI Key"
                style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #333' }}
              />
            </div>
            <div className="form-group" style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', marginBottom: '4px' }}>类型</label>
              <select 
                value={newKey.type}
                onChange={(e) => setNewKey(prev => ({ ...prev, type: e.target.value }))}
                style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #333' }}
              >
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: '12px' }}>
              <label style={{ display: 'block', marginBottom: '4px' }}>API Key</label>
              <input 
                type="password" 
                value={newKey.key}
                onChange={(e) => setNewKey(prev => ({ ...prev, key: e.target.value }))}
                placeholder="sk-..."
                style={{ width: '100%', padding: '8px', borderRadius: '4px', border: '1px solid #333' }}
              />
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="btn-primary" onClick={addApiKey}>保存</button>
              <button className="btn-secondary" onClick={() => setShowAddForm(false)}>取消</button>
            </div>
          </div>
        )}

        <table className="data-table" style={{ marginTop: '16px' }}>
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
                      className="btn-secondary" 
                      onClick={() => deleteApiKey(key.id)}
                      style={{ padding: '4px 8px', fontSize: '12px' }}
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
    </div>
  );
}

export default ApiKeys;