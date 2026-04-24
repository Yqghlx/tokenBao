// API 类型
export type ApiType = 'openai' | 'claude' | 'other';

// API Key 结构
export interface ApiKey {
  id: number;
  name: string;
  type: ApiType;
  encryptedKey: string;
  createdAt: string;
  updatedAt: string;
}

// 代理请求结构
export interface ProxyRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
}

// 代理响应结构
export interface ProxyResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

// 请求日志结构
export interface RequestLog {
  id: number;
  apiType: ApiType;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  cost: number;
  cached: boolean;
  timestamp: string;
}
