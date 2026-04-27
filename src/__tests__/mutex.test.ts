import { Mutex, getMutex } from '../utils/mutex';

describe('Mutex 写入串行化', () => {
  it('应串行执行异步操作', async () => {
    const mutex = new Mutex();
    const order: number[] = [];

    const p1 = mutex.runExclusive(async () => {
      await new Promise(r => setTimeout(r, 30));
      order.push(1);
    });
    const p2 = mutex.runExclusive(async () => {
      order.push(2);
    });

    await Promise.all([p1, p2]);
    // p1 先注册，即使 p2 同步也必须等 p1 完成
    expect(order).toEqual([1, 2]);
  });

  it('应正确传递返回值', async () => {
    const mutex = new Mutex();
    const result = await mutex.runExclusive(() => 42);
    expect(result).toBe(42);
  });

  it('应在异常时释放锁', async () => {
    const mutex = new Mutex();
    try {
      await mutex.runExclusive(() => { throw new Error('boom'); });
    } catch { /* 预期异常 */ }

    // 锁应已释放，后续操作不应挂起
    const result = await mutex.runExclusive(() => 'ok');
    expect(result).toBe('ok');
  });

  it('getMutex 应为相同文件名返回同一实例', () => {
    const m1 = getMutex('test.json');
    const m2 = getMutex('test.json');
    expect(m1).toBe(m2);
  });

  it('getMutex 应为不同文件名返回不同实例', () => {
    const m1 = getMutex('a.json');
    const m2 = getMutex('b.json');
    expect(m1).not.toBe(m2);
  });

  it('应串行执行三个以上的操作', async () => {
    const mutex = new Mutex();
    const order: number[] = [];

    await Promise.all([
      mutex.runExclusive(async () => { order.push(1); }),
      mutex.runExclusive(async () => { order.push(2); }),
      mutex.runExclusive(async () => { order.push(3); }),
    ]);

    expect(order).toHaveLength(3);
    expect(order).toContain(1);
    expect(order).toContain(2);
    expect(order).toContain(3);
  });

  it('同步返回值应正确传递', async () => {
    const mutex = new Mutex();
    const result = await mutex.runExclusive(() => ({ key: 'value' }));
    expect(result).toEqual({ key: 'value' });
  });

  it('连续异常后锁应仍然可用', async () => {
    const mutex = new Mutex();
    for (let i = 0; i < 3; i++) {
      try {
        await mutex.runExclusive(() => { throw new Error(`err${i}`); });
      } catch { /* 预期异常 */ }
    }
    const result = await mutex.runExclusive(() => 'recovered');
    expect(result).toBe('recovered');
  });
});
