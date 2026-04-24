import type { ProxyRequest, ProxyResponse, RequestLog } from './api';
import type { BudgetConfig, CustomRule } from './db';

// IPC 通道枚举
export type IpcChannel = 'CONFIG_UPDATE' | 'BUDGET_UPDATE' | 'RULE_UPDATE' | 'PROXY_REQUEST' | 'PROXY_RESPONSE' | 'LOG';

// Config 更新消息
export interface IpcConfigMessage {
  channel: 'CONFIG_UPDATE';
  payload: {
    key: string;
    value: string;
    updatedAt?: string;
  };
}

// Budget 更新消息
export interface IpcBudgetMessage {
  channel: 'BUDGET_UPDATE';
  payload: BudgetConfig;
}

// Rule 更新消息
export interface IpcRuleMessage {
  channel: 'RULE_UPDATE';
  payload: CustomRule;
}

// Proxy 请求消息
export interface IpcProxyRequestMessage {
  channel: 'PROXY_REQUEST';
  payload: ProxyRequest;
}

// Proxy 响应消息
export interface IpcProxyResponseMessage {
  channel: 'PROXY_RESPONSE';
  payload: ProxyResponse;
}

// 日志消息
export interface IpcLogMessage {
  channel: 'LOG';
  payload: RequestLog;
}

export type IpcMessage =
  | IpcConfigMessage
  | IpcBudgetMessage
  | IpcRuleMessage
  | IpcProxyRequestMessage
  | IpcProxyResponseMessage
  | IpcLogMessage;
