import { saveJson, loadJson, listJsonFiles } from '../utils/storage';

describe('storage 模块', () => {
  const testFile = 'test-storage-unit.json';
  const testData = { name: 'test', value: 123, nested: { key: 'value' } };

  test('saveJson 应成功写入文件', () => {
    saveJson(testFile, testData);
  });

  test('loadJson 应正确读取已保存的数据', () => {
    const loaded = loadJson(testFile, testData);
    expect(loaded.name).toBe('test');
    expect(loaded.value).toBe(123);
  });

  test('loadJson 文件不存在时应返回默认值', () => {
    const defaultData = { default: true };
    const loaded = loadJson('non-existent-unit.json', defaultData);
    expect(loaded.default).toBe(true);
  });

  test('listJsonFiles 应列出 json 文件', () => {
    const files = listJsonFiles();
    expect(files.some(f => f.includes('test-storage-unit'))).toBe(true);
  });
});
