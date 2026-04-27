interface CompressionOptions {
  enabled: boolean;
  level: 'low' | 'medium' | 'high';
}

const defaultOptions: CompressionOptions = {
  enabled: true,
  level: 'medium'
};

const replacements = [
  // 冗余礼貌用语
  { pattern: /please/gi, replacement: '' },
  { pattern: /I would like you to/gi, replacement: '' },
  { pattern: /Could you/gi, replacement: '' },
  { pattern: /I need you to/gi, replacement: '' },
  { pattern: /please provide/gi, replacement: 'provide' },
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
  // 格式描述缩写
  { pattern: /in JSON format/gi, replacement: 'resp: JSON' },
  { pattern: /response in JSON format/gi, replacement: 'resp: JSON' },
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

function estimateTokens(text: string): number {
  // 英文约 4 chars/token，中文约 2 chars/token
  let count = 0;
  for (const char of text) {
    count += char.charCodeAt(0) > 127 ? 0.5 : 0.25;
  }
  return Math.ceil(count);
}

/**
 * 提取 fenced code blocks 占位保护，避免空白压缩破坏代码内容
 * 返回 { protected: 替换后的文本, restore: 恢复函数 }
 */
function protectCodeBlocks(text: string): { protected: string; restore: (t: string) => string } {
  const blocks: string[] = [];
  // 匹配 ```...``` 围栏代码块（支持 ~~~ 和 ``` 围栏）
  const fencedRegex = /(`{3}|~{3})[\s\S]*?\1/g;
  const protectedText = text.replace(fencedRegex, (match) => {
    blocks.push(match);
    return `\x00CODE_BLOCK_${blocks.length - 1}\x00`;
  });
  return {
    protected: protectedText,
    restore: (t: string) => t.replace(/\x00CODE_BLOCK_(\d+)\x00/g, (_, i) => blocks[parseInt(i)])
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
  compressed = compressed
    .replace(/\s+/g, ' ')
    .replace(/\n\s*\n/g, '\n')
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

interface ContentBlock {
  type: string;
  text?: string;
  [key: string]: unknown;
}

function compressPrompt(prompt: string | ContentBlock[]): string | ContentBlock[] {
  if (!defaultOptions.enabled || !prompt) return prompt;

  if (typeof prompt === 'string') {
    return compress(prompt).text;
  }

  if (Array.isArray(prompt)) {
    return prompt.map((block) => {
      if (block.type === 'text' && block.text) {
        return { ...block, text: compress(block.text).text };
      }
      return block;
    });
  }

  return prompt;
}

export default {
  getOptions,
  setOptions,
  compress,
  compressPrompt
};