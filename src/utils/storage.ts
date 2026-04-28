import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { promisify } from 'util';

const writeFileAsync = promisify(fs.writeFile);
const renameAsync = promisify(fs.rename);
const openAsync = promisify(fs.open);
const closeAsync = promisify(fs.close);
const fsyncAsync = promisify(fs.fsync);

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

    // 清理上次进程崩溃残留的临时文件
    cleanupStaleTempFiles();
  }
  return dataDir;
}

/** 清理 .tmp 残留文件（原子写入中断后遗留），避免磁盘垃圾积累 */
function cleanupStaleTempFiles(): void {
  try {
    const files = fs.readdirSync(dataDir);
    for (const file of files) {
      if (file.endsWith('.tmp')) {
        const tmpPath = path.join(dataDir, file);
        try {
          fs.unlinkSync(tmpPath);
          console.warn(`清理残留临时文件: ${file}`);
        } catch {
          // 清理失败不影响正常功能
        }
      }
    }
  } catch {
    // 目录读取失败不影响正常功能
  }
}

function getFilePath(filename: string): string {
  return path.join(getDataDir(), filename);
}

export function loadJson<T>(filename: string, defaultValue: T): T {
  const filePath = getFilePath(filename);
  const backupPath = filePath + '.bak';
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(content) as T;
      // 结构验证：期望对象类型但实际为数组或原始类型时回退默认值
      if (typeof defaultValue === 'object' && defaultValue !== null && !Array.isArray(defaultValue)) {
        if (typeof data !== 'object' || data === null || Array.isArray(data)) {
          console.warn(`加载 ${filename} 结构异常（期望对象，实际为 ${Array.isArray(data) ? '数组' : typeof data}），使用默认值`);
          return structuredClone(defaultValue) as T;
        }
      }
      // 加载成功后创建备份，供未来损坏时恢复
      try {
        fs.writeFileSync(backupPath, content, 'utf-8');
      } catch (backupErr) {
        console.warn(`创建 ${filename} 备份失败:`, (backupErr as Error).message);
      }
      return data;
    }
    // 文件不存在，返回默认值（正常情况）
  } catch (err) {
    // 主文件损坏，尝试从备份恢复
    console.warn(`加载 ${filename} 失败，尝试从备份恢复:`, err);
    try {
      if (fs.existsSync(backupPath)) {
        const backupContent = fs.readFileSync(backupPath, 'utf-8');
        const restored = JSON.parse(backupContent) as T;
        // 恢复时同样验证结构
        if (typeof defaultValue === 'object' && defaultValue !== null && !Array.isArray(defaultValue)) {
          if (typeof restored !== 'object' || restored === null || Array.isArray(restored)) {
            console.warn(`备份 ${filename} 结构也异常，使用默认值`);
            return structuredClone(defaultValue) as T;
          }
        }
        // 恢复成功，用备份数据覆盖损坏的主文件
        fs.writeFileSync(filePath, backupContent, 'utf-8');
        console.log(`从备份恢复 ${filename} 成功`);
        return restored;
      }
    } catch (backupErr) {
      console.error(`备份恢复 ${filename} 也失败，数据已丢失:`, backupErr);
    }
  }
  // 所有恢复路径均失败，返回默认值并记录严重警告
  console.error(`严重: ${filename} 数据丢失，已恢复为默认值`);
  return structuredClone(defaultValue) as T;
}

export function saveJson<T>(filename: string, data: T): void {
  const filePath = getFilePath(filename);
  const content = JSON.stringify(data, null, 2);
  // 原子写入：先写临时文件再 fsync 再重命名，防止写入中断导致数据损坏
  const tmpPath = filePath + '.tmp';
  const fd = fs.openSync(tmpPath, 'w');
  try {
    fs.writeFileSync(fd, content, 'utf-8');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmpPath, filePath);
}

/**
 * 异步原子写入，不阻塞事件循环，适用于高并发场景
 */
export async function saveJsonAsync<T>(filename: string, data: T): Promise<void> {
  const filePath = getFilePath(filename);
  const content = JSON.stringify(data, null, 2);
  const tmpPath = filePath + '.tmp';
  await writeFileAsync(tmpPath, content, 'utf-8');
  // fsync 确保数据落盘后再 rename，防止系统崩溃导致数据丢失
  const fd = await openAsync(tmpPath, 'r');
  try {
    await fsyncAsync(fd);
  } finally {
    await closeAsync(fd);
  }
  await renameAsync(tmpPath, filePath);
}

export function deleteJson(filename: string): boolean {
  const filePath = getFilePath(filename);
  try {
    let deleted = false;
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      deleted = true;
    }
    // 同步清理备份文件，避免恢复脏数据
    const backupPath = filePath + '.bak';
    if (fs.existsSync(backupPath)) {
      fs.unlinkSync(backupPath);
      deleted = true;
    }
    return deleted;
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