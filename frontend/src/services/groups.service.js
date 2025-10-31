import pool from '../config/dbconn.js';

// ดึงข้อมูลกลุ่มทั้งหมด
export async function getAllGroups() {
  const res = await pool.query(`
    SELECT g.*, u.display_name AS owner_name
    FROM groups g
    JOIN users u ON g.owner_id = u.user_id
    ORDER BY g.created_at DESC
  `);
  return res.rows;
}

// ดึงข้อมูลกลุ่มตาม group_id
export async function getGroupById(group_id) {
  const res = await pool.query(
    `SELECT g.*, u.display_name AS owner_name
     FROM groups g
     JOIN users u ON g.owner_id = u.user_id
     WHERE g.group_id = $1`,
    [group_id]
  );
  return res.rows[0];
}

// สร้างกลุ่มใหม่
export async function createGroup({ name, description, owner_id }) {
  const res = await pool.query(
    'INSERT INTO groups (name, description, owner_id) VALUES ($1, $2, $3) RETURNING *',
    [name, description, owner_id]
  );
  return res.rows[0];
}

// ลบกลุ่ม (owner เท่านั้น)
export async function deleteGroup(group_id, owner_id) {
  // ตรวจสอบสิทธิ์ก่อน
  const group = await getGroupById(group_id);
  if (!group || group.owner_id !== owner_id) return false;
  await pool.query('DELETE FROM groups WHERE group_id = $1', [group_id]);
  return true;
}

// เข้าร่วมกลุ่ม
export async function joinGroup(group_id, user_id) {
  const membership = await pool.query(
    'SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2',
    [group_id, user_id]
  );

  if (membership.rowCount > 0) {
    return { ok: true, status: 'member', message: 'คุณเป็นสมาชิกอยู่แล้ว' };
  }

  const { rows } = await pool.query(
    `SELECT request_id, status
     FROM group_join_requests
     WHERE group_id = $1 AND user_id = $2`,
    [group_id, user_id]
  );

  const existing = rows[0] || null;

  if (existing) {
    if (existing.status === 'pending') {
      return { ok: true, status: 'pending', message: 'คุณได้ส่งคำขอเข้าร่วมแล้ว' };
    }

    if (existing.status === 'approved') {
      await pool.query(
        `INSERT INTO group_members (group_id, user_id)
         VALUES ($1, $2)
         ON CONFLICT (group_id, user_id) DO NOTHING`,
        [group_id, user_id]
      );
      return { ok: true, status: 'member', message: 'คุณเป็นสมาชิกอยู่แล้ว' };
    }

    await pool.query(
      `UPDATE group_join_requests
       SET status = 'pending', created_at = now(), responded_at = NULL
       WHERE request_id = $1`,
      [existing.request_id]
    );

    return { ok: true, status: 'pending', message: 'ส่งคำขอเข้าร่วมอีกครั้งแล้ว' };
  }

  const inserted = await pool.query(
    `INSERT INTO group_join_requests (group_id, user_id, status)
     VALUES ($1, $2, 'pending')
     RETURNING request_id`,
    [group_id, user_id]
  );

  return {
    ok: true,
    status: 'pending',
    requestId: inserted.rows[0]?.request_id || null,
    message: 'ส่งคำขอเข้าร่วมกลุ่มแล้ว'
  };
}

// ออกจากกลุ่ม
export async function leaveGroup(group_id, user_id) {
  const res = await pool.query(
    'DELETE FROM group_members WHERE group_id = $1 AND user_id = $2',
    [group_id, user_id]
  );
  return res.rowCount > 0;
}

// ดึงสมาชิกกลุ่ม
export async function getGroupMembers(group_id) {
  const res = await pool.query(
    `SELECT gm.*, u.username, u.display_name
     FROM group_members gm
     JOIN users u ON gm.user_id = u.user_id
     WHERE gm.group_id = $1`,
    [group_id]
  );
  return res.rows;
}

// ดึงโพสต์ในกลุ่ม
export async function getGroupPosts(group_id) {
  const res = await pool.query(
    `SELECT p.*, u.username, u.display_name
     FROM posts p
     JOIN users u ON p.author_id = u.user_id
     WHERE p.group_id = $1
     ORDER BY p.created_at DESC`,
    [group_id]
  );
  return res.rows;
}

// สร้างโพสต์ในกลุ่ม
export async function createGroupPost({ group_id, author_id, title, body, category }) {
  const res = await pool.query(
    'INSERT INTO posts (author_id, title, body, category, group_id, status) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
    [author_id, title, body, category, group_id, 'published']
  );
  return res.rows[0];
}
