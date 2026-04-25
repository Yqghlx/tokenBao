interface CompressionOptions {
  enabled: boolean;
  level: 'low' | 'medium' | 'high';
}

const defaultOptions: CompressionOptions = {
  enabled: true,
  level: 'medium'
};

const replacements = [
  { pattern: /please/gi, replacement: '' },
  { pattern: /I would like you to/gi, replacement: '' },
  { pattern: /Could you/gi, replacement: '' },
  { pattern: /in JSON format/gi, replacement: 'resp: JSON' },
  { pattern: /response in JSON format/gi, replacement: 'resp: JSON' },
  { pattern: /field name is string type/gi, replacement: 'name: str' },
  { pattern: /field name is number type/gi, replacement: 'name: num' },
  { pattern: /field name is boolean type/gi, replacement: 'name: bool' },
  { pattern: /and so on/gi, replacement: 'etc' },
  { pattern: /for example/gi, replacement: 'e.g.' },
  { pattern: /that is to say/gi, replacement: 'i.e.' }
];

function getOptions(): CompressionOptions {
  return { ...defaultOptions };
}

function setOptions(options: Partial<CompressionOptions>): void {
  Object.assign(defaultOptions, options);
}

function compress(text: string): { text: string; tokensSaved: number } {
  if (!defaultOptions.enabled) {
    return { text, tokensSaved: 0 };
  }

  const originalTokens = Math.ceil(text.length / 4);
  let compressed = text;

  for (const { pattern, replacement } of replacements) {
    compressed = compressed.replace(pattern, replacement);
  }

  compressed = compressed
    .replace(/\s+/g, ' ')
    .replace(/\n\s*\n/g, '\n')
    .trim();

  const newTokens = Math.ceil(compressed.length / 4);
  
  return {
    text: compressed,
    tokensSaved: Math.max(0, originalTokens - newTokens)
  };
}

function compressPrompt(prompt: any): any {
  if (!defaultOptions.enabled || !prompt) return prompt;
  
  if (typeof prompt === 'string') {
    return compress(prompt).text;
  }
  
  if (Array.isArray(prompt)) {
    return prompt.map((block: any) => {
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