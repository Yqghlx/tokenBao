import fs from 'fs';
import path from 'path';
import { getDb, closeDb } from './database';

function runInit() {
  const dbPath = path.resolve(process.cwd(), 'data', 'tokenbao.db');
  const exists = fs.existsSync(dbPath);
  const schemaPath = path.resolve(process.cwd(), 'src', 'db', 'schema.sql');
  if (!fs.existsSync(schemaPath)) {
    console.error('Schema file not found:', schemaPath);
    return;
  }
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');

  // 打开或创建数据库
  const db = getDb();

  // 只在数据库文件不存在时执行初始化
  if (!exists) {
    const statements = schemaSql
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    for (const stmt of statements) {
      try {
        db.exec(stmt + ';');
      } catch (e) {
        console.error('Failed to execute schema statement:', stmt, e);
      }
    }
    console.log('Database schema initialized.');
  } else {
    console.log('Database file already exists. Skipping schema initialization.');
  }

  closeDb();
}

// 直接执行脚本时运行初始化逻辑
(async () => {
  try {
    runInit();
  } catch (err) {
    console.error('DB init failed:', err);
  }
})();
