import { useState, useEffect, useCallback, useMemo } from 'react';
import { showToast } from '../components/Toast';
import { usePolling } from '../hooks/usePolling';

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

const PAGE_SIZE = 20;

function History() {
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [filter, setFilter] = useState('');
  const [search, setSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  const loadHistory = useCallback(async () => {
    if (window.electronAPI?.history?.list) {
      try {
        const options = filter ? { apiType: filter, limit: 500 } : { limit: 500 };
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
  }, [loadHistory]);

  usePolling(loadHistory, 15000);

  // 搜索过滤 + 分页
  const filteredHistory = useMemo(() => {
    let items = history;
    if (search.trim()) {
      const keyword = search.toLowerCase();
      items = items.filter(item =>
        item.model.toLowerCase().includes(keyword) ||
        item.apiType.toLowerCase().includes(keyword)
      );
    }
    return items;
  }, [history, search]);

  const totalPages = Math.max(1, Math.ceil(filteredHistory.length / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);
  const pagedHistory = filteredHistory.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE
  );

  // 搜索或过滤变化时重置页码
  useEffect(() => {
    setCurrentPage(1);
  }, [search, filter]);

  const exportCsv = () => {
    if (filteredHistory.length === 0) {
      showToast('没有数据可导出', 'error');
      return;
    }

    const headers = ['时间', 'API', '模型', '输入 Tokens', '输出 Tokens', '缓存 Tokens', '成本'];

    // 标准 CSV 转义：字段含逗号/引号/换行时用双引号包裹，内部引号双写
    const escapeCsv = (value: string | number): string => {
      const str = String(value);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const rows = filteredHistory.map(item => [
      escapeCsv(item.timestamp),
      escapeCsv(item.apiType),
      escapeCsv(item.model),
      escapeCsv(item.inputTokens),
      escapeCsv(item.outputTokens),
      escapeCsv(item.cachedTokens),
      escapeCsv(item.cost.toFixed(4))
    ]);

    const csv = [headers.map(escapeCsv).join(','), ...rows.map(r => r.join(','))].join('\n');
    // 添加 BOM 以确保 Excel 正确识别 UTF-8 编码
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tokenbao-history-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const clearHistory = async () => {
    if (!window.confirm('确定要清除所有历史记录吗？此操作不可恢复。')) return;

    if (window.electronAPI?.history?.clear) {
      try {
        await window.electronAPI.history.clear();
        setHistory([]);
        setCurrentPage(1);
        showToast('历史记录已清除', 'success');
      } catch (err) {
        console.error('清除历史记录失败:', err);
        showToast('清除失败', 'error');
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
      <div className="history-toolbar">
        <input
          type="text"
          className="search-input"
          placeholder="搜索模型名或 API 类型..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={filter} onChange={(e) => setFilter(e.target.value)} className="filter-select">
          <option value="">所有 API</option>
          <option value="openai">OpenAI</option>
          <option value="anthropic">Anthropic</option>
        </select>
        <button className="btn-secondary" onClick={exportCsv}>导出 CSV</button>
        <button className="btn-secondary" onClick={clearHistory}>清除历史</button>
        <span className="record-count">
          共 {filteredHistory.length} 条记录
        </span>
      </div>
      <div className="table-scroll">
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
            {pagedHistory.length === 0 ? (
              <tr>
                <td colSpan={7} className="empty-state">
                  {search ? `未找到匹配 "${search}" 的记录` : '暂无请求记录'}
                </td>
              </tr>
            ) : (
              pagedHistory.map((item) => (
                <tr key={item.id}>
                  <td>{new Date(item.timestamp).toLocaleString()}</td>
                  <td>{item.apiType}</td>
                  <td>{item.model}</td>
                  <td>{item.inputTokens}</td>
                  <td>{item.outputTokens}</td>
                  <td>{item.cachedTokens}</td>
                  <td>{item.cost > 0 ? `$${item.cost.toFixed(4)}` : '-'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="pagination">
          <button
            className="btn-secondary"
            disabled={safePage <= 1}
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
          >
            上一页
          </button>
          <span className="pagination-info">
            {safePage} / {totalPages}
          </span>
          <button
            className="btn-secondary"
            disabled={safePage >= totalPages}
            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
          >
            下一页
          </button>
        </div>
      )}
    </div>
  );
}

export default History;