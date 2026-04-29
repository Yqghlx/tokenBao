/**
 * DLP (Data Loss Prevention) 敏感数据脱敏模块
 * 在请求转发至上游 API 之前，自动检测并脱敏 Prompt 中的 PII (个人身份信息)
 */

/** 单条脱敏规则定义 */
interface DLPRule {
  /** 规则标识 */
  id: string;
  /** 人类可读的规则名称 */
  name: string;
  /** 检测正则表达式 */
  pattern: RegExp;
  /** 脱敏后的替换文本（仅 redact 模式使用） */
  replacement: string;
  /** 是否启用 */
  enabled: boolean;
  /** 严重程度：high = 强制脱敏不可关闭，normal = 可由用户关闭 */
  severity: 'high' | 'normal';
  /** mask = 保留首尾部分字符，redact = 完整替换为 replacement */
  maskMode: 'mask' | 'redact';
}

/** DLP 扫描结果 */
interface DLPScanResult {
  /** 脱敏后的文本 */
  text: string;
  /** 检测到的敏感信息类型及次数 */
  detections: Array<{ ruleId: string; name: string; count: number }>;
  /** 是否进行了脱敏操作 */
  modified: boolean;
}

interface DLPOptions {
  enabled: boolean;
}

const defaultOptions: DLPOptions = {
  enabled: false
};

/** 内置 PII 检测规则 */
const BUILTIN_RULES: DLPRule[] = [
  // 中国身份证号码（18位，含校验位格式）
  {
    id: 'cn_id_card',
    name: '中国身份证号',
    pattern: /\b([1-9]\d{5}(?:19|20)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])\d{3}[\dXx])\b/g,
    replacement: '****IDENTITY****',
    enabled: true,
    severity: 'high',
    maskMode: 'mask'
  },
  // 中国手机号码
  {
    id: 'cn_phone',
    name: '中国手机号',
    pattern: /\b(1[3-9]\d{9})\b/g,
    replacement: '',
    enabled: true,
    severity: 'high',
    maskMode: 'mask'
  },
  // 电子邮箱
  {
    id: 'email',
    name: '电子邮箱',
    pattern: /\b([a-zA-Z0-9._%+-]+)@([a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\b/g,
    replacement: '',
    enabled: true,
    severity: 'normal',
    maskMode: 'mask'
  },
  // IPv4 地址
  {
    id: 'ipv4',
    name: 'IP 地址',
    pattern: /\b((?:\d{1,3}\.){3}\d{1,3})\b/g,
    replacement: '',
    enabled: true,
    severity: 'normal',
    maskMode: 'mask'
  },
  // AWS Access Key ID
  {
    id: 'aws_key',
    name: 'AWS Access Key',
    pattern: /\b(AKIA[0-9A-Z]{16})\b/g,
    replacement: 'AWS_KEY_REDACTED',
    enabled: true,
    severity: 'high',
    maskMode: 'redact'
  },
  // AWS Secret Access Key
  {
    id: 'aws_secret',
    name: 'AWS Secret Key',
    pattern: /\b([A-Za-z0-9/+=]{40})\b/g,
    replacement: 'AWS_SECRET_REDACTED',
    enabled: false,
    severity: 'high',
    maskMode: 'redact'
  },
  // 私钥头（PEM 格式）
  {
    id: 'private_key',
    name: '私钥',
    pattern: /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----[\s\S]{1,10000}?-----END\s+(?:RSA\s+)?PRIVATE\s+KEY-----/g,
    replacement: '----- PRIVATE KEY REDACTED -----',
    enabled: true,
    severity: 'high',
    maskMode: 'redact'
  },
  // 通用 API Key 模式（sk-、sk-ant- 等前缀的长密钥）
  {
    id: 'api_key',
    name: 'API Key',
    pattern: /\b(sk-[a-zA-Z0-9_-]{20,}|sk-ant-[a-zA-Z0-9_-]{20,})\b/g,
    replacement: 'API_KEY_REDACTED',
    enabled: true,
    severity: 'high',
    maskMode: 'redact'
  },
  // 银行卡号（15-19位连续数字，覆盖 Amex 15位、Visa/Mastercard 16位、UnionPay 16-19位）
  {
    id: 'bank_card',
    name: '银行卡号',
    pattern: /\b((?:\d{4}[\s-]?){3}\d{3,7}|\d{4}[\s-]?\d{6}[\s-]?\d{5})\b/g,
    replacement: '',
    enabled: false,
    severity: 'normal',
    maskMode: 'mask'
  },
  // 美国社会安全号码（SSN：###-##-#### 或 #########）
  {
    id: 'us_ssn',
    name: '美国社会安全号码',
    pattern: /\b(?!000|666|9\d{2})\d{3}[-\s]?(?!00)\d{2}[-\s]?(?!0000)\d{4}\b/g,
    replacement: '',
    enabled: true,
    severity: 'high',
    maskMode: 'mask'
  }
];

/** 安全阈值：单次替换操作上限，防止极端输入导致性能问题 */
const MAX_REPLACE_PER_RULE = 100;
/** 扫描文本最大长度，超出跳过避免正则回溯消耗过多 CPU */
const MAX_SCAN_TEXT_SIZE = 1_000_000;

/**
 * 预编译所有规则的 RegExp 副本，用于每次 scan 调用时重置 /g 状态
 * 避免每次 scan 都 new RegExp()，减少 GC 压力
 */
const compiledPatterns = new Map<string, RegExp>();
function getCompiledPattern(rule: DLPRule): RegExp {
  let cached = compiledPatterns.get(rule.id);
  if (!cached || cached.source !== rule.pattern.source || cached.flags !== rule.pattern.flags) {
    cached = new RegExp(rule.pattern.source, rule.pattern.flags);
    compiledPatterns.set(rule.id, cached);
  }
  // 重置 /g lastIndex，避免上次替换的位置残留
  cached.lastIndex = 0;
  return cached;
}

/**
 * 脱敏替换函数，将匹配内容按规则替换为掩码
 * 保留首尾部分字符以帮助用户识别被脱敏的内容
 */
function maskContent(match: string, rule: DLPRule): string {
  const len = match.length;
  if (len <= 4) return '****';
  if (len <= 8) return match.slice(0, 2) + '****';

  switch (rule.id) {
    case 'cn_phone':
      return match.slice(0, 3) + '****' + match.slice(-4);
    case 'email': {
      const atIdx = match.indexOf('@');
      // 防御异常匹配（无 @ 或 @ 在首位），回退到通用脱敏
      if (atIdx <= 0) return match.slice(0, 3) + '****' + match.slice(-3);
      return match.slice(0, 2) + '***' + match.slice(atIdx);
    }
    case 'cn_id_card':
      return match.slice(0, 4) + '**********' + match.slice(-4);
    case 'us_ssn':
      return '***-**-' + match.slice(-4);
    case 'ipv4': {
      const parts = match.split('.');
      // 防御异常 IP 格式
      if (parts.length !== 4) return match.slice(0, 3) + '****' + match.slice(-3);
      return parts[0] + '.***.***.' + parts[3];
    }
    default:
      return match.slice(0, 3) + '****' + match.slice(-3);
  }
}

/**
 * 扫描并脱敏文本中的 PII
 * @param text 待扫描文本
 * @returns 脱敏结果
 */
export function scan(text: string): DLPScanResult {
  if (!defaultOptions.enabled || !text) {
    return { text, detections: [], modified: false };
  }
  // 超大文本跳过扫描，避免多规则正则回溯消耗过多 CPU
  if (text.length > MAX_SCAN_TEXT_SIZE) {
    console.warn(`DLP: 文本超过 ${MAX_SCAN_TEXT_SIZE} 字符，跳过扫描`);
    return { text, detections: [], modified: false };
  }

  const detections: Array<{ ruleId: string; name: string; count: number }> = [];
  let result = text;
  let anyModified = false;

  for (const rule of BUILTIN_RULES) {
    if (!rule.enabled) continue;

    try {
      // 使用预编译的正则副本（已重置 lastIndex），避免每次 new RegExp 的开销
      const regex = getCompiledPattern(rule);
      let count = 0;
      let modified = false;

      result = result.replace(regex, (match) => {
        count++;
        if (count > MAX_REPLACE_PER_RULE) {
          if (count === MAX_REPLACE_PER_RULE + 1) {
            console.warn(`DLP: 规则 [${rule.id}] 替换次数超过 ${MAX_REPLACE_PER_RULE} 上限，后续匹配将被跳过`);
          }
          return match;
        }
        modified = true;
        return rule.maskMode === 'redact' ? rule.replacement : maskContent(match, rule);
      });

      if (modified && count > 0) {
        anyModified = true;
        detections.push({ ruleId: rule.id, name: rule.name, count: Math.min(count, MAX_REPLACE_PER_RULE) });
      }
    } catch (err) {
      // 单条规则失败不影响其他规则执行
      console.warn(`DLP 规则 [${rule.id}] 执行失败:`, (err as Error).message);
    }
  }

  return { text: result, detections, modified: anyModified };
}

export function getOptions(): DLPOptions {
  return { ...defaultOptions };
}

export function setOptions(options: Partial<DLPOptions>): void {
  Object.assign(defaultOptions, options);
}

/** 获取所有内置规则（用于前端展示） */
export function getRules(): Array<{ id: string; name: string; enabled: boolean; severity: string }> {
  return BUILTIN_RULES.map(r => ({
    id: r.id,
    name: r.name,
    enabled: r.enabled,
    severity: r.severity
  }));
}

/** 切换单条规则的启用状态 */
export function setRuleEnabled(ruleId: string, enabled: boolean): boolean {
  const rule = BUILTIN_RULES.find(r => r.id === ruleId);
  if (!rule) return false;
  rule.enabled = enabled;
  return true;
}

export default {
  getOptions,
  setOptions,
  scan,
  getRules,
  setRuleEnabled
};
