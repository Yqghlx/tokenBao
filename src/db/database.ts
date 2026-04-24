import path from 'path';
import fs from 'fs';
import Database from 'better-sqlite3';

let dbInstance: any = null;

// 获取全局数据库连接，单例模式
export function getDb(): any {
  if (dbInstance) return dbInstance;
  const dbPath = path.resolve(process.cwd(), 'data', 'tokenbao.db');
  // 确保目录存在
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  dbInstance = new (Database as any)(dbPath);
  return dbInstance;
}

// 关闭数据库连接
export function closeDb(): void {
  if (dbInstance) {
    try {
      dbInstance.close();
    } catch {
      // ignore
    }
    dbInstance = null;
  }
}
