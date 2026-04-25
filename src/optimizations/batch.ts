import { RequestLog } from '../services/history';

interface BatchOptions {
  enabled: boolean;
  windowMs: number;
  maxBatchSize: number;
}

const defaultOptions: BatchOptions = {
  enabled: false,
  windowMs: 5000,
  maxBatchSize: 10
};

const pendingBatch: RequestLog[] = [];

export function getOptions(): BatchOptions {
  return { ...defaultOptions };
}

export function setOptions(options: Partial<BatchOptions>): void {
  Object.assign(defaultOptions, options);
}

export function addToBatch(request: RequestLog): void {
  if (!defaultOptions.enabled) return;
  
  if (pendingBatch.length >= defaultOptions.maxBatchSize) {
    return;
  }
  
  pendingBatch.push(request);
}

export function getBatch(): RequestLog[] {
  return [...pendingBatch];
}

export function clearBatch(): void {
  pendingBatch.length = 0;
}

export function shouldBatch(): boolean {
  return defaultOptions.enabled && pendingBatch.length > 0;
}

export default {
  getOptions,
  setOptions,
  addToBatch,
  getBatch,
  clearBatch,
  shouldBatch
};