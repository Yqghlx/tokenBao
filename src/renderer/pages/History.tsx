import { useState, useEffect, useCallback, useRef } from 'react';
import { showToast } from '../components/Toast';
import ConfirmDialog from '../components/ConfirmDialog';
import { usePolling } from '../hooks/usePolling';
import { formatMoney } from '../utils/format';

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
const SEARCH_DEBOUNCE_MS = 300;
const EXPORT_LIMIT = 1000;
const BLOB_RELEASE_DELAY_MS = 1000;

function History() {
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [filter, setFilter] = useState('');
  const [search, setSearch] = useState('');
  // 防抖搜索值：按键输入 300ms 后才触发实际查询，减少 IPC 调用
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [totalCount, setTotalCount] = useState(0);
  const [exporting, setExporting] = useState(false);
  // 用 ref 追踪 totalCount，避免作为 loadHistory 依赖导致循环更新
  const totalCountRef = useRef(0);
  // 追踪待释放的 blob URL，组件卸载时清理
  const pendingBlobUrlRef = useRef<string | null>(null);

  const loadHistory = useCallback(async () => {
    if (window.electronAPI?.history?.list) {
      try {
        // 计算安全页码，防止数据减少后请求空页
        const safeP = Math.min(currentPage, Math.max(1, Math.ceil(totalCountRef.current / PAGE_SIZE)) || 1);
        const offset = (safeP - 1) * PAGE_SIZE;
        const options: { limit: number; offset: number; apiType?: string; search?: string } = {
          limit: PAGE_SIZE,
          offset
        };
        if (filter) options.apiType = filter;
        if (debouncedSearch.trim()) options.search = debouncedSearch.trim();

        const data = await window.electronAPI.history.list(options);
        setHistory(data);

        // 并行请求精确总数
        if (window.electronAPI?.history?.count) {
          const countOptions: { apiType?: string; search?: string } = {};
          if (filter) countOptions.apiType = filter;
          if (debouncedSearch.trim()) countOptions.search = debouncedSearch.trim();
          const count = await window.electronAPI.history.count(countOptions);
          totalCountRef.current = count;
          setTotalCount(count);
          // 数据减少导致当前页超出范围时自动回退
          const maxPage = Math.max(1, Math.ceil(count / PAGE_SIZE));
          if (currentPage > maxPage) setCurrentPage(maxPage);
        } else {
          const estimatedTotal = data.length < PAGE_SIZE ? offset + data.length : offset + PAGE_SIZE + 1;
          totalCountRef.current = estimatedTotal;
          setTotalCount(estimatedTotal);
        }
      } catch (err) {
        console.error('获取历史记录失败:', err);
        showToast('获取历史记录失败', 'error');
      } finally {
        setLoading(false);
      }
    } else {
      setLoading(false);
    }
  }, [currentPage, filter, debouncedSearch]);

  // 搜索防抖：300ms 无新输入后才更新搜索值
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    loadHistory();
    return () => {
      if (pendingBlobUrlRef.current) {
        URL.revokeObjectURL(pendingBlobUrlRef.current);
      }
    };
  }, [loadHistory]);

  usePolling(loadHistory, 15000);

  // 搜索或过滤变化时重置页码
  useEffect(() => {
    setCurrentPage(1);
  }, [search, filter]);

  const exportCsv = async () => {
    if (exporting) return;
    if (window.electronAPI?.history?.list) {
      setExporting(true);
      try {
        // 导出时全量拉取（服务端过滤）
        const options: { limit: number; offset: number; apiType?: string; search?: string } = {
          limit: EXPORT_LIMIT,
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
          let str = String(value).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
          // 防止 CSV 注入：以公式触发字符开头的单元格加前缀
          if (/^[=+\-\t\r@]/.test(str)) {
            str = "'" + str;
          }
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
          escapeCsv(formatMoney(item.cost, 4))
        ]);

        const csv = [headers.map(escapeCsv).join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `tokenbao-history-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        // 追踪 blob URL，组件卸载时可清理；延迟释放确保浏览器完成下载
        pendingBlobUrlRef.current = url;
        setTimeout(() => { URL.revokeObjectURL(url); pendingBlobUrlRef.current = null; }, BLOB_RELEASE_DELAY_MS);
        showToast(`已导出 ${allData.length} 条记录`, 'success');
      } catch (err) {
        showToast('导出失败', 'error');
      } finally {
        setExporting(false);
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
  const pageStart = totalCount > 0 ? (safePage - 1) * PAGE_SIZE + 1 : 0;
  const pageEnd = Math.min(safePage * PAGE_SIZE, totalCount);

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
        <button className="btn-secondary" onClick={exportCsv} disabled={exporting}>{exporting ? '导出中...' : '导出 CSV'}</button>
        <button className="btn-secondary" onClick={() => setShowClearConfirm(true)}>清除历史</button>
        <span className="record-count">
          {totalCount > 0 ? `共 ${totalCount} 条记录` : '暂无记录'}
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
                  <td>{item.cost > 0 ? `$${formatMoney(item.cost, 4)}` : '-'}</td>
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
            显示 {pageStart}-{pageEnd} / 共 {totalCount} 条
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
