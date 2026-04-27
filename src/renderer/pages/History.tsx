import { useState, useEffect, useCallback } from 'react';
import { showToast } from '../components/Toast';
import ConfirmDialog from '../components/ConfirmDialog';
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
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [totalCount, setTotalCount] = useState(0);

  const loadHistory = useCallback(async () => {
    if (window.electronAPI?.history?.list) {
      try {
        // 服务端分页：只请求当前页的数据
        const offset = (currentPage - 1) * PAGE_SIZE;
        const options: { limit: number; offset: number; apiType?: string; search?: string } = {
          limit: PAGE_SIZE,
          offset
        };
        if (filter) options.apiType = filter;
        if (search.trim()) options.search = search.trim();

        const data = await window.electronAPI.history.list(options);
        setHistory(data);

        // 通过请求 offset=0, limit=1 获取总数（或用当前页数据估算）
        // 简化方案：请求足够多的数据来计算总数
        const countOptions: { limit: number; offset: number; apiType?: string; search?: string } = {
          limit: 1,
          offset: 0
        };
        if (filter) countOptions.apiType = filter;
        if (search.trim()) countOptions.search = search.trim();
        // 用当前页结果估算：如果有 PAGE_SIZE 条，说明后面可能还有更多
        setTotalCount(data.length < PAGE_SIZE ? offset + data.length : offset + PAGE_SIZE + 1);
      } catch (err) {
        console.error('获取历史记录失败:', err);
        showToast('获取历史记录失败', 'error');
      } finally {
        setLoading(false);
      }
    } else {
      setLoading(false);
    }
  }, [currentPage, filter, search]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  usePolling(loadHistory, 15000);

  // 搜索或过滤变化时重置页码
  useEffect(() => {
    setCurrentPage(1);
  }, [search, filter]);

  const exportCsv = async () => {
    if (window.electronAPI?.history?.list) {
      try {
        // 导出时全量拉取（服务端过滤）
        const options: { limit: number; offset: number; apiType?: string; search?: string } = {
          limit: 1000,
          offset: 0
        };
        if (filter) options.apiType = filter;
        if (search.trim()) options.search = search.trim();
        const allData = await window.electronAPI.history.list(options);

        if (allData.length === 0) {
          showToast('没有数据可导出', 'error');
          return;
        }

        const headers = ['时间', 'API', '模型', '输入 Tokens', '输出 Tokens', '缓存 Tokens', '成本'];

        const escapeCsv = (value: string | number): string => {
          const str = String(value).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
          if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        };

        const rows = allData.map((item: HistoryItem) => [
          escapeCsv(item.timestamp),
          escapeCsv(item.apiType),
          escapeCsv(item.model),
          escapeCsv(item.inputTokens),
          escapeCsv(item.outputTokens),
          escapeCsv(item.cachedTokens),
          escapeCsv(item.cost.toFixed(4))
        ]);

        const csv = [headers.map(escapeCsv).join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `tokenbao-history-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      } catch (err) {
        showToast('导出失败', 'error');
      }
    }
  };

  const clearHistory = useCallback(async () => {
    if (window.electronAPI?.history?.clear) {
      try {
        await window.electronAPI.history.clear();
        setHistory([]);
        setCurrentPage(1);
        setTotalCount(0);
        showToast('历史记录已清除', 'success');
      } catch (err) {
        console.error('清除历史记录失败:', err);
        showToast('清除失败', 'error');
      }
    }
  }, []);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const safePage = Math.min(currentPage, totalPages);

  if (loading) {
    return (
      <div className="page">
        <h2>请求历史</h2>
        <div className="table-scroll">
          <div className="skeleton skeleton-row" />
          <div className="skeleton skeleton-row" />
          <div className="skeleton skeleton-row" />
          <div className="skeleton skeleton-row" />
        </div>
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
          aria-label="搜索历史记录"
        />
        <select value={filter} onChange={(e) => setFilter(e.target.value)} className="filter-select" aria-label="按 API 类型筛选">
          <option value="">所有 API</option>
          <option value="openai">OpenAI</option>
          <option value="anthropic">Anthropic</option>
        </select>
        <button className="btn-secondary" onClick={exportCsv}>导出 CSV</button>
        <button className="btn-secondary" onClick={() => setShowClearConfirm(true)}>清除历史</button>
        <span className="record-count">
          {totalCount > 0 ? `共 ${totalCount}+ 条记录` : '暂无记录'}
        </span>
      </div>
      <div className="table-scroll">
        <table className="data-table" aria-label="请求历史记录">
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
                <td colSpan={7} className="empty-state">
                  {search ? `未找到匹配 "${search}" 的记录` : '暂无请求记录'}
                </td>
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
                  <td>{item.cost > 0 ? `$${item.cost.toFixed(4)}` : '-'}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="pagination" aria-label="分页导航">
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
            disabled={history.length < PAGE_SIZE}
            onClick={() => setCurrentPage(p => p + 1)}
          >
            下一页
          </button>
        </div>
      )}

      <ConfirmDialog
        open={showClearConfirm}
        title="清除历史记录"
        message="确定要清除所有历史记录吗？此操作不可恢复。"
        confirmLabel="清除"
        danger
        onConfirm={() => {
          clearHistory();
          setShowClearConfirm(false);
        }}
        onCancel={() => setShowClearConfirm(false)}
      />
    </div>
  );
}

export default History;
