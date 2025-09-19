// db.js
import 'dotenv/config';
import fs from 'fs';
import pkg from 'pg';
const { Pool } = pkg;

const ssl =
  process.env.DB_SSL === 'true'
    ? {
        ca: fs.readFileSync('./rds-combined-ca-bundle.pem', 'utf8'),
        rejectUnauthorized: true,
      }
    : false;

export const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  max: 10,               // ปรับตามภาระงาน/ขนาด RDS
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 5_000,
  keepAlive: true,
  ssl,
});

// hook ปิดคอนเนกชันตอนโปรเซสจะจบ
process.on('SIGINT', async () => {
  try { await pool.end(); } finally { process.exit(0); }
});
