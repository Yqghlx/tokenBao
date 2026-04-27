import { useState, useEffect, useCallback } from 'react';
import { showToast } from '../components/Toast';

interface HistoryItem {
  id: number;
  apiType: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  cost: number;
  cached: boolean;
  timestamp: string;
}

function History() {
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [filter, setFilter] = useState('');

  const loadHistory = useCallback(async () => {
    if (window.electronAPI?.history?.list) {
      try {
        const options = filter ? { apiType: filter, limit: 50 } : { limit: 50 };
        const data = await window.electronAPI.history.list(options);
        setHistory(data);
      } catch (err) {
        console.error('获取历史记录失败:', err);
        showToast('获取历史记录失败', 'error');
      } finally {
        setLoading(false);
      }
    } else {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    loadHistory();
    const interval = setInterval(loadHistory, 10000);
    return () => clearInterval(interval);
  }, [loadHistory]);

  const exportCsv = () => {
    if (history.length === 0) {
      showToast('没有数据可导出', 'error');
      return;
    }
    
    const headers = ['时间', 'API', '模型', '输入 Tokens', '输出 Tokens', '缓存 Tokens', '成本'];
    const rows = history.map(item => [
      item.timestamp,
      item.apiType,
      item.model,
      item.inputTokens,
      item.outputTokens,
      item.cachedTokens,
      item.cost.toFixed(4)
    ]);
    
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tokenbao-history-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const clearHistory = async () => {
    if (!window.confirm('确定要清除所有历史记录吗？')) return;
    
    if (window.electronAPI?.history?.clear) {
      try {
        await window.electronAPI.history.clear();
        setHistory([]);
      } catch (err) {
        console.error('清除历史记录失败:', err);
      }
    }
  };

  if (loading) {
    return (
      <div className="page">
        <h2>请求历史</h2>
        <p>加载中...</p>
      </div>
    );
  }

  return (
    <div className="page">
      <h2>请求历史</h2>
      <div className="history-filters">
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">所有 API</option>
          <option value="openai">OpenAI</option>
          <option value="anthropic">Anthropic</option>
        </select>
        <button className="btn-secondary" onClick={exportCsv}>导出 CSV</button>
        <button className="btn-secondary" onClick={clearHistory} style={{ marginLeft: '8px' }}>清除历史</button>
      </div>
      <table className="data-table">
        <thead>
          <tr>
            <th>时间</th>
            <th>API</th>
            <th>模型</th>
            <th>输入 Tokens</th>
            <th>输出 Tokens</th>
            <th>缓存 Tokens</th>
            <th>成本</th>
          </tr>
        </thead>
        <tbody>
          {history.length === 0 ? (
            <tr>
              <td colSpan={7} className="empty-state">暂无请求记录</td>
            </tr>
          ) : (
            history.map((item) => (
              <tr key={item.id}>
                <td>{new Date(item.timestamp).toLocaleString()}</td>
                <td>{item.apiType}</td>
                <td>{item.model}</td>
                <td>{item.inputTokens}</td>
                <td>{item.outputTokens}</td>
                <td>{item.cachedTokens}</td>
                <td>$0.00</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

export default History;