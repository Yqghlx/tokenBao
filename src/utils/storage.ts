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
  } catch (err) {
    console.error(`加载 ${filename} 失败:`, err);
  }
  return defaultValue;
}

export function saveJson<T>(filename: string, data: T): void {
  const filePath = getFilePath(filename);
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
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