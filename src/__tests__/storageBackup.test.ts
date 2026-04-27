import * as fs from 'fs';
import * as path from 'path';
import { loadJson, saveJson } from '../utils/storage';

const TEST_DIR = path.join(process.cwd(), 'test-data');
const TEST_FILE = '__test_backup__.json';
const TEST_PATH = path.join(TEST_DIR, TEST_FILE);
const BACKUP_PATH = TEST_PATH + '.bak';

// 每次测试前清理
beforeEach(() => {
  [TEST_PATH, BACKUP_PATH].forEach(f => {
    if (fs.existsSync(f)) fs.unlinkSync(f);
  });
});

afterAll(() => {
  [TEST_PATH, BACKUP_PATH].forEach(f => {
    if (fs.existsSync(f)) fs.unlinkSync(f);
  });
});

describe('storage 备份恢复', () => {
  it('loadJson 成功后应创建备份文件', () => {
    saveJson(TEST_FILE, { name: 'test' });
    expect(fs.existsSync(TEST_PATH)).toBe(true);
    expect(fs.existsSync(BACKUP_PATH)).toBe(false);

    const data = loadJson(TEST_FILE, {});
    expect(data).toEqual({ name: 'test' });
    expect(fs.existsSync(BACKUP_PATH)).toBe(true);

    const backup = JSON.parse(fs.readFileSync(BACKUP_PATH, 'utf-8'));
    expect(backup).toEqual({ name: 'test' });
  });

  it('主文件损坏时应从备份恢复', () => {
    // 先保存正常数据
    saveJson(TEST_FILE, { version: 1 });
    // 加载一次以创建备份
    loadJson(TEST_FILE, {});

    // 损坏主文件
    fs.writeFileSync(TEST_PATH, '{ invalid json !!!', 'utf-8');

    // 应从备份恢复
    const data = loadJson<{ version: number }>(TEST_FILE, { version: 0 });
    expect(data.version).toBe(1);

    // 主文件应已被恢复
    const restored = JSON.parse(fs.readFileSync(TEST_PATH, 'utf-8'));
    expect(restored.version).toBe(1);
  });

  it('主文件和备份都损坏时应返回默认值', () => {
    fs.writeFileSync(TEST_PATH, 'corrupted', 'utf-8');
    fs.writeFileSync(BACKUP_PATH, 'also corrupted', 'utf-8');

    const data = loadJson(TEST_FILE, { fallback: true });
    expect(data).toEqual({ fallback: true });
  });

  it('文件不存在时应返回默认值', () => {
    const data = loadJson('__nonexistent__.json', { default: true });
    expect(data).toEqual({ default: true });
  });
});
