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

  it('队列溢出时应拒绝新操作', async () => {
    const mutex = new Mutex();
    // 用一个长时间持有锁的操作阻塞队列
    let releaseBlocker!: () => void;
    const blocker = mutex.runExclusive(() => new Promise<void>(r => { releaseBlocker = r; }));

    // 填满队列（100 个等待 + 1 个运行中）
    const waiters: Promise<unknown>[] = [blocker];
    for (let i = 0; i < 100; i++) {
      waiters.push(mutex.runExclusive(() => Promise.resolve(i)));
    }

    // 第 102 个操作应被拒绝
    await expect(mutex.runExclusive(() => 'overflow'))
      .rejects.toThrow('Mutex 队列已满');

    // 释放阻塞操作，让队列清空
    releaseBlocker();
    await Promise.allSettled(waiters);

    // 队列清空后应恢复正常
    const result = await mutex.runExclusive(() => 'ok');
    expect(result).toBe('ok');
  });

  it('异常后 queueSize 应正确递减', async () => {
    const mutex = new Mutex();
    const failures: Promise<unknown>[] = [];
    for (let i = 0; i < 10; i++) {
      failures.push(
        mutex.runExclusive(() => { throw new Error('fail'); }).catch(() => {})
      );
    }
    await Promise.all(failures);

    // 所有异常处理完毕后应能正常执行
    const result = await mutex.runExclusive(() => 'clean');
    expect(result).toBe('clean');
  });

  it('并发异常不应阻塞后续正常操作', async () => {
    const mutex = new Mutex();
    const results: string[] = [];

    const promises = [
      mutex.runExclusive(() => { throw new Error('e1'); }).catch(() => results.push('caught1')),
      mutex.runExclusive(() => { throw new Error('e2'); }).catch(() => results.push('caught2')),
      mutex.runExclusive(() => 'ok').then(r => results.push(r))
    ];

    await Promise.all(promises);
    expect(results).toContain('caught1');
    expect(results).toContain('caught2');
    expect(results).toContain('ok');
  });
});
