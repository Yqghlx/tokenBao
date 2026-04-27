import { useState, useEffect, useCallback } from 'react';
import { showToast } from '../components/Toast';
import ConfirmDialog from '../components/ConfirmDialog';

interface RuleItem {
  id: number;
  name: string;
  type: 'replace' | 'filter' | 'route';
  pattern: string;
  replacement: string;
  enabled: boolean;
  priority: number;
}

function Optimization() {
  const [loading, setLoading] = useState(true);
  const [optimizationConfig, setOptimizationConfig] = useState({
    caching: true,
    compression: true,
    routing: true,
    batching: false
  });
  const [cacheTTL, setCacheTTL] = useState('5min');
  const [rules, setRules] = useState<RuleItem[]>([]);
  const [showRuleForm, setShowRuleForm] = useState(false);
  const [newRule, setNewRule] = useState({ name: '', pattern: '', replacement: '', priority: 0 });
  const [operatingRuleId, setOperatingRuleId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<RuleItem | null>(null);

  const loadConfig = useCallback(async () => {
    try {
      const results = await Promise.allSettled([
        window.electronAPI?.optimization?.getConfig?.(),
        window.electronAPI?.config?.get?.('cacheTTL'),
        window.electronAPI?.rules?.list?.()
      ]);
      if (results[0].status === 'fulfilled' && results[0].value) {
        setOptimizationConfig(results[0].value);
      }
      if (results[1].status === 'fulfilled') {
        setCacheTTL(results[1].value || '5min');
      }
      if (results[2].status === 'fulfilled' && Array.isArray(results[2].value)) {
        setRules(results[2].value as RuleItem[]);
      }
    } catch (err) {
      console.error('获取优化配置失败:', err);
      showToast('获取优化配置失败', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  const updateConfig = async (key: string, value: boolean) => {
    setOptimizationConfig(prev => ({ ...prev, [key]: value }));

    if (window.electronAPI?.optimization?.setConfig) {
      try {
        await window.electronAPI.optimization.setConfig({ [key]: value });
        showToast('配置已更新', 'success');
      } catch (err) {
        console.error('保存优化配置失败:', err);
        showToast('保存配置失败', 'error');
        setOptimizationConfig(prev => ({ ...prev, [key]: !value }));
      }
    }
  };

  const updateTTL = async (value: string) => {
    setCacheTTL(value);
    if (window.electronAPI?.config?.set) {
      try {
        await window.electronAPI.config.set('cacheTTL', value);
        showToast('TTL 设置已保存', 'success');
      } catch (err) {
        console.error('保存 TTL 失败:', err);
        showToast('保存 TTL 失败', 'error');
      }
    }
  };

  /** 切换单条规则启用/禁用 */
  const toggleRule = async (rule: RuleItem) => {
    setOperatingRuleId(rule.id);
    try {
      await window.electronAPI?.rules?.update?.(rule.id, { enabled: !rule.enabled });
      loadConfig();
    } finally {
      setOperatingRuleId(null);
    }
  };

  /** 确认删除规则 */
  const confirmDeleteRule = async () => {
    if (!deleteTarget) return;
    setOperatingRuleId(deleteTarget.id);
    try {
      await window.electronAPI?.rules?.delete?.(deleteTarget.id);
      loadConfig();
      showToast('规则已删除', 'info');
    } finally {
      setOperatingRuleId(null);
      setDeleteTarget(null);
    }
  };

  /** 批量启用/禁用所有规则 */
  const setAllRules = async (enabled: boolean) => {
    for (const rule of rules) {
      if (rule.enabled !== enabled) {
        await window.electronAPI?.rules?.update?.(rule.id, { enabled });
      }
    }
    loadConfig();
    showToast(enabled ? '已启用全部规则' : '已禁用全部规则', 'success');
  };

  if (loading) {
    return (
      <div className="page">
        <h2>优化策略配置</h2>
        <div className="optimization-sections">
          <div className="skeleton skeleton-card" />
          <div className="skeleton skeleton-card" />
          <div className="skeleton skeleton-card" />
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <h2>优化策略配置</h2>
      <div className="optimization-sections">
        <section className="optim-section">
          <h3>Prompt Caching</h3>
          <div className="form-group">
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={optimizationConfig.caching}
                onChange={(e) => updateConfig('caching', e.target.checked)}
                aria-label="启用 Prompt Caching"
              />
              <span>启用 Prompt Caching</span>
            </label>
            <span className="feature-desc">Anthropic API 支持 Prompt Caching，可节省 50-90% 的 Token 消耗</span>
          </div>
          <div className="form-group">
            <label>TTL 设置</label>
            <select value={cacheTTL} onChange={(e) => updateTTL(e.target.value)} aria-label="缓存 TTL">
              <option value="5min">5 分钟（1.25x 写费用）</option>
              <option value="1hour">1 小时（2x 写费用）</option>
            </select>
          </div>
        </section>

        <section className="optim-section">
          <h3>Prompt 压缩</h3>
          <div className="form-group">
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={optimizationConfig.compression}
                onChange={(e) => updateConfig('compression', e.target.checked)}
                aria-label="启用 Prompt 压缩"
              />
              <span>启用 Prompt 压缩</span>
            </label>
            <span className="feature-desc">移除冗余词汇（"please"、"Could you" 等），节省 20-40% Token</span>
          </div>
        </section>

        <section className="optim-section">
          <h3>智能模型路由</h3>
          <div className="form-group">
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={optimizationConfig.routing}
                onChange={(e) => updateConfig('routing', e.target.checked)}
                aria-label="启用智能模型路由"
              />
              <span>启用智能模型路由</span>
            </label>
            <span className="feature-desc">根据任务复杂度自动选择合适的模型，节省 60-95% 成本</span>
          </div>
          <div className="route-rules">
            <div className="route-example">
              <span>gpt-4 / gpt-4o / gpt-4.1 → gpt-4o-mini / gpt-4.1-mini</span>
              <span className="tag">简单任务</span>
            </div>
            <div className="route-example">
              <span>claude-opus-4 / claude-3-opus → claude-3.5-haiku / claude-3-haiku</span>
              <span className="tag">分类/简单任务</span>
            </div>
          </div>
        </section>

        <section className="optim-section">
          <h3>请求批处理</h3>
          <div className="form-group">
            <label className="toggle">
              <input
                type="checkbox"
                checked={optimizationConfig.batching}
                onChange={(e) => updateConfig('batching', e.target.checked)}
                aria-label="启用请求批处理"
              />
              <span>启用请求批处理（实验性）</span>
            </label>
            <span className="feature-desc">合并多个请求批量发送，减少 API 调用次数。当前仅用于统计，不影响实际请求。</span>
          </div>
        </section>

        <section className="optim-section">
          <h3>自定义替换规则</h3>
          <span className="feature-desc">通过正则表达式替换请求内容中的文本，优先级越高越先执行。</span>
          <div className="form-actions">
            <button className="btn-primary btn-sm" onClick={() => setShowRuleForm(true)}>
              添加规则
            </button>
            {rules.length > 0 && (
              <>
                <button className="btn-secondary btn-sm" onClick={() => setAllRules(true)}>全部启用</button>
                <button className="btn-secondary btn-sm" onClick={() => setAllRules(false)}>全部禁用</button>
              </>
            )}
          </div>

          {showRuleForm && (
            <div className="info-panel">
              <div className="form-group">
                <label>规则名称</label>
                <input type="text" value={newRule.name} onChange={(e) => setNewRule(p => ({ ...p, name: e.target.value }))} placeholder="例如: 移除问候语" />
              </div>
              <div className="form-group">
                <label>正则表达式</label>
                <input type="text" value={newRule.pattern} onChange={(e) => setNewRule(p => ({ ...p, pattern: e.target.value }))} placeholder="例如: /hello/gi" />
              </div>
              <div className="form-group">
                <label>替换文本</label>
                <input type="text" value={newRule.replacement} onChange={(e) => setNewRule(p => ({ ...p, replacement: e.target.value }))} placeholder="留空则为删除" />
              </div>
              <div className="form-group">
                <label>优先级（数字越大越先执行）</label>
                <input type="number" value={newRule.priority} onChange={(e) => {
                  const val = parseInt(e.target.value);
                  setNewRule(p => ({ ...p, priority: isNaN(val) ? 0 : val }));
                }} />
              </div>
              <div className="form-actions">
                <button className="btn-primary btn-sm" onClick={async () => {
                  if (!newRule.name || !newRule.pattern) {
                    showToast('请填写规则名称和正则表达式', 'error');
                    return;
                  }
                  const result = await window.electronAPI?.rules?.add?.({
                    name: newRule.name, type: 'replace', pattern: newRule.pattern,
                    replacement: newRule.replacement, enabled: true, priority: newRule.priority
                  });
                  if (result?.success) {
                    setShowRuleForm(false);
                    setNewRule({ name: '', pattern: '', replacement: '', priority: 0 });
                    loadConfig();
                    showToast('规则已添加', 'success');
                  } else {
                    showToast(result?.error || '添加失败', 'error');
                  }
                }}>保存</button>
                <button className="btn-secondary btn-sm" onClick={() => setShowRuleForm(false)}>取消</button>
              </div>
            </div>
          )}

          {rules.length === 0 ? (
            <p className="toggle-desc">暂无自定义规则</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>名称</th>
                  <th>正则</th>
                  <th>替换</th>
                  <th>优先级</th>
                  <th>状态</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {rules.map(rule => (
                  <tr key={rule.id}>
                    <td>{rule.name}</td>
                    <td><code className="inline-code">{rule.pattern}</code></td>
                    <td>{rule.replacement || '(删除)'}</td>
                    <td>{rule.priority}</td>
                    <td>{rule.enabled ? '启用' : '禁用'}</td>
                    <td>
                      <button
                        className="btn-secondary btn-sm"
                        onClick={() => toggleRule(rule)}
                        disabled={operatingRuleId === rule.id}
                      >
                        {operatingRuleId === rule.id ? '...' : (rule.enabled ? '禁用' : '启用')}
                      </button>
                      <button
                        className="btn-secondary btn-sm"
                        onClick={() => setDeleteTarget(rule)}
                        disabled={operatingRuleId === rule.id}
                      >
                        删除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        title="删除规则"
        message={`确定要删除规则「${deleteTarget?.name}」吗？此操作不可撤销。`}
        confirmLabel="删除"
        danger
        onConfirm={confirmDeleteRule}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
}

export default Optimization;
