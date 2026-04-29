interface CompressionOptions {
  enabled: boolean;
  level: 'low' | 'medium' | 'high';
}

const defaultOptions: CompressionOptions = {
  enabled: true,
  level: 'medium'
};

const replacements = [
  // 冗余礼貌用语（具体模式在前，避免被通用模式先截断）
  { pattern: /please provide/gi, replacement: 'provide' },
  { pattern: /I would like you to/gi, replacement: '' },
  { pattern: /Could you/gi, replacement: '' },
  { pattern: /I need you to/gi, replacement: '' },
  { pattern: /please/gi, replacement: '' },
  // 冗余短语缩写
  { pattern: /in order to/gi, replacement: 'to' },
  { pattern: /make sure to/gi, replacement: 'ensure' },
  { pattern: /as well as/gi, replacement: '&' },
  { pattern: /for the purpose of/gi, replacement: 'to' },
  { pattern: /at this point in time/gi, replacement: 'now' },
  { pattern: /in the event that/gi, replacement: 'if' },
  { pattern: /a large number of/gi, replacement: 'many' },
  { pattern: /and so on/gi, replacement: 'etc' },
  { pattern: /for example/gi, replacement: 'e.g.' },
  { pattern: /that is to say/gi, replacement: 'i.e.' },
  // 格式描述缩写（具体模式在前）
  { pattern: /response in JSON format/gi, replacement: 'resp: JSON' },
  { pattern: /in JSON format/gi, replacement: 'resp: JSON' },
  { pattern: /field name is string type/gi, replacement: 'name: str' },
  { pattern: /field name is number type/gi, replacement: 'name: num' },
  { pattern: /field name is boolean type/gi, replacement: 'name: bool' }
];

function getOptions(): CompressionOptions {
  return { ...defaultOptions };
}

function setOptions(options: Partial<CompressionOptions>): void {
  Object.assign(defaultOptions, options);
}

/** 判断字符是否为 CJK 统一汉字、假名、韩文或全角字符 */
function isCJK(code: number): boolean {
  return (code >= 0x4E00 && code <= 0x9FFF)   // CJK 统一汉字
    || (code >= 0x3400 && code <= 0x4DBF)       // CJK 扩展 A 区
    || (code >= 0x20000 && code <= 0x2A6DF)     // CJK 扩展 B 区
    || (code >= 0x2A700 && code <= 0x2B73F)     // CJK 扩展 C 区
    || (code >= 0x2B740 && code <= 0x2B81F)     // CJK 扩展 D 区
    || (code >= 0x3040 && code <= 0x309F)       // 平假名
    || (code >= 0x30A0 && code <= 0x30FF)       // 片假名
    || (code >= 0xAC00 && code <= 0xD7AF)       // 韩文音节
    || (code >= 0xFF01 && code <= 0xFF60);      // 全角字符（标点/字母/数字）
}

function estimateTokens(text: string): number {
  // CJK 约 2 chars/token，其他约 4 chars/token
  let count = 0;
  for (const char of text) {
    // codePointAt 正确处理 CJK 扩展 B-G 区（代理对），charCodeAt 会返回高位代理导致误判
    count += isCJK(char.codePointAt(0) ?? 0) ? 0.5 : 0.25;
  }
  return Math.ceil(count);
}

/**
 * 提取 fenced code blocks 占位保护，避免空白压缩破坏代码内容
 * 返回 { protected: 替换后的文本, restore: 恢复函数 }
 */
/** 单个代码块最大长度，超长代码块截断保护防止内存膨胀 */
const MAX_CODE_BLOCK_SIZE = 200000;

function protectCodeBlocks(text: string): { protected: string; restore: (t: string) => string } {
  const blocks: string[] = [];
  // 匹配 ```...``` 围栏代码块（支持 ~~~ 和 ``` 围栏），未闭合时匹配到文本末尾以防代码被空白压缩破坏
  const fencedRegex = /(`{3}|~{3})[\s\S]*?(?:\1|$)/g;
  const protectedText = text.replace(fencedRegex, (match) => {
    const truncated = match.length > MAX_CODE_BLOCK_SIZE
      ? match.slice(0, MAX_CODE_BLOCK_SIZE) + '\n...[代码块过大，已截断]'
      : match;
    blocks.push(truncated);
    return `\x00CODE_BLOCK_${blocks.length - 1}\x00`;
  });
  return {
    protected: protectedText,
    // eslint-disable-next-line no-control-regex
    restore: (t: string) => t.replace(/\x00CODE_BLOCK_(\d+)\x00/g, (_, i) => {
      const idx = parseInt(i, 10);
      return idx >= 0 && idx < blocks.length ? blocks[idx] : '';
    })
  };
}

function compress(text: string): { text: string; tokensSaved: number } {
  if (!defaultOptions.enabled) {
    return { text, tokensSaved: 0 };
  }

  const originalTokens = estimateTokens(text);
  const { protected: protectedText, restore } = protectCodeBlocks(text);
  let compressed = protectedText;

  // 仅对非代码部分做短语替换
  for (const { pattern, replacement } of replacements) {
    compressed = compressed.replace(pattern, replacement);
  }

  // 仅对非代码部分做空白压缩
  // 先合并连续空行，再压缩水平空白，避免 \s+ 先删除换行导致段落结构丢失
  compressed = compressed
    .replace(/\n[ \t]*\n[ \t]*\n/g, '\n\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/^[ \t]+/gm, '')
    .replace(/[ \t]+$/gm, '')
    .trim();

  // 还原代码块
  compressed = restore(compressed);

  const newTokens = estimateTokens(compressed);

  // 膨胀安全检查：如果压缩后 token 数反而增加，回退到原文
  if (newTokens > originalTokens) {
    return { text, tokensSaved: 0 };
  }

  return {
    text: compressed,
    tokensSaved: Math.max(0, originalTokens - newTokens)
  };
}

export default {
  getOptions,
  setOptions,
  compress
};