/**
 * 简单的异步互斥锁，确保同一存储文件的读写操作串行执行
 * 防止并发写入导致数据丢失
 */
export class Mutex {
  private queue: Promise<void> = Promise.resolve();

  /** 在锁内执行异步操作，同一时刻只有一个操作运行 */
  async runExclusive<T>(fn: () => Promise<T> | T): Promise<T> {
    let resolve!: () => void;
    const prev = this.queue;
    this.queue = new Promise<void>(r => { resolve = r; });

    await prev;
    try {
      return await fn();
    } finally {
      resolve();
    }
  }
}

/** 每个存储文件一把锁 */
const locks = new Map<string, Mutex>();

export function getMutex(filename: string): Mutex {
  let m = locks.get(filename);
  if (!m) {
    m = new Mutex();
    locks.set(filename, m);
  }
  return m;
}
