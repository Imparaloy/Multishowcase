// dbconn.js
import pkg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

const { Pool } = pkg;

// ใช้ Pool เพื่อจัดการ connection หลายอันพร้อมกัน (เหมาะกับเว็บเซิร์ฟเวอร์)
const pool = new Pool({
  host: process.env.PGHOST,
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
  port: process.env.PGPORT || 5432,
  ssl: process.env.RDS_SSL === 'true' || process.env.NODE_ENV === 'production'
  ? { rejectUnauthorized: false }
  : false,
});

// ทดสอบการเชื่อมต่อ
(async () => {
  try {
    const client = await pool.connect();
    console.log('✅ Connected to PostgreSQL');
    client.release();
  } catch (err) {
    console.error('❌ Database connection error:', err);
  }
})();

export default pool;
