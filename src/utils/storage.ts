import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

let dataDir: string;

function getDataDir(): string {
  if (!dataDir) {
    const isElectron = process.versions?.electron !== undefined;
    
    if (isElectron) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const electron = require('electron');
        const app = electron.app;
        dataDir = path.join(app.getPath('userData'), 'data');
      } catch (e) {
        dataDir = path.join(os.homedir(), '.tokenbao', 'data');
      }
    } else {
      dataDir = path.join(process.cwd(), 'test-data');
    }
    
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
  }
  return dataDir;
}

function getFilePath(filename: string): string {
  return path.join(getDataDir(), filename);
}

export function loadJson<T>(filename: string, defaultValue: T): T {
  const filePath = getFilePath(filename);
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      return JSON.parse(content) as T;
    }
    // 文件不存在，返回默认值（正常情况）
  } catch (err) {
    // 文件损坏时记录警告，返回默认值以防止应用崩溃
    console.warn(`加载 ${filename} 失败，使用默认值:`, err);
  }
  return defaultValue;
}

export function saveJson<T>(filename: string, data: T): void {
  const filePath = getFilePath(filename);
  try {
    const content = JSON.stringify(data, null, 2);
    // 原子写入：先写临时文件再重命名，防止写入中断导致数据损坏
    const tmpPath = filePath + '.tmp';
    fs.writeFileSync(tmpPath, content, 'utf-8');
    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    console.error(`保存 ${filename} 失败:`, err);
  }
}

export function deleteJson(filename: string): boolean {
  const filePath = getFilePath(filename);
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
  } catch (err) {
    console.error(`删除 ${filename} 失败:`, err);
  }
  return false;
}

export function listJsonFiles(): string[] {
  const dataDir = getDataDir();
  try {
    return fs.readdirSync(dataDir).filter(f => f.endsWith('.json'));
  } catch (err) {
    console.error('列出文件失败:', err);
    return [];
  }
}