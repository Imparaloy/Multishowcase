import pool from '../config/dbconn.js';
import TAG_LIST from '../data/tags.js';
import { getUnifiedFeed } from './feed.controller.js';

// แสดงหน้า groups ทั้งหมด
export async function renderGroupsPage(req, res) {
  try {
    const groupsRes = await pool.query(`
      SELECT g.*, u.display_name AS owner_name
      FROM groups g
      JOIN users u ON g.owner_id = u.user_id
      ORDER BY g.created_at DESC
    `);
    const groups = groupsRes.rows;
  const currentUser = req.user;
  return res.render('groups', { title: 'Groups', groups, currentUser, activePage: 'groups', exploreTags: TAG_LIST });
  } catch (e) {
    console.error('Failed to load groups:', e);
    return res.status(500).send('Failed to load groups');
  }
}

// สร้างกลุ่มใหม่
export async function createGroup(req, res) {
  try {
    const { name, description } = req.body || {};
    if (!name || String(name).trim().length === 0) {
      return res.status(400).json({ ok: false, message: 'กรุณากรอกชื่อกลุ่ม' });
    }
    const owner_id = req.user?.user_id;
    if (!owner_id) {
      return res.status(400).json({ ok: false, message: 'ไม่พบข้อมูลผู้ใช้' });
    }
    const groupRes = await pool.query(
      'INSERT INTO groups (name, description, owner_id) VALUES ($1, $2, $3) RETURNING *',
      [name, description, owner_id]
    );
    const group = groupRes.rows[0];
    const accept = req.headers['accept'] || '';
    if (accept.includes('application/json') || req.xhr) {
      return res.status(201).json({ ok: true, group });
    }
    return res.redirect('/groups');
  } catch (e) {
    console.error('Failed to create group:', e);
    return res.status(500).json({ ok: false, message: 'สร้างกลุ่มไม่สำเร็จ' });
  }
}

// แสดงรายละเอียดกลุ่ม
export async function renderGroupDetailsPage(req, res) {
  try {
    const { id } = req.params;
    const groupRes = await pool.query(
      `SELECT g.*, u.display_name AS owner_name FROM groups g JOIN users u ON g.owner_id = u.user_id WHERE g.group_id = $1`,
      [id]
    );
    const group = groupRes.rows[0];
    if (!group) {
      return res.status(404).send('ไม่พบกลุ่ม');
    }
    const currentUser = req.user;
    const isOwner = group.owner_id === currentUser.user_id;
    const membersRes = await pool.query(
      `SELECT gm.*, u.username, u.display_name FROM group_members gm JOIN users u ON gm.user_id = u.user_id WHERE gm.group_id = $1`,
      [id]
    );
    const members = membersRes.rows;
    const isMember = members.some(m => m.user_id === currentUser.user_id);
    const posts = await getUnifiedFeed({ groupId: id });
    const pendingRequests = [];
    const tagMap = Object.fromEntries(TAG_LIST.map(t => [t.slug, t.label]));
    return res.render('group-details', {
      title: group.name,
      group,
      currentUser,
      isOwner,
      isMember,
      pendingRequests,
      posts,
      members,
      exploreTags: TAG_LIST,
      tagMap
    });
  } catch (e) {
    console.error('Failed to load group details:', e);
    return res.status(500).send('Failed to load group details');
  }
}

// เข้าร่วมกลุ่ม
export async function joinGroupHandler(req, res) {
  try {
    const { id } = req.params; // group_id
    const user_id = req.user?.user_id;
    if (!user_id) return res.status(400).json({ ok: false, message: 'ไม่พบข้อมูลผู้ใช้' });
    const check = await pool.query('SELECT * FROM group_members WHERE group_id = $1 AND user_id = $2', [id, user_id]);
    if (check.rowCount > 0) return res.status(400).json({ ok: false, message: 'คุณเป็นสมาชิกอยู่แล้ว' });
    await pool.query('INSERT INTO group_members (group_id, user_id) VALUES ($1, $2)', [id, user_id]);
    return res.json({ ok: true, message: 'เข้าร่วมกลุ่มสำเร็จ' });
  } catch (e) {
    console.error('Failed to join group:', e);
    return res.status(500).json({ ok: false, message: 'ไม่สามารถเข้าร่วมกลุ่มได้' });
  }
}

// ออกจากกลุ่ม
export async function leaveGroupHandler(req, res) {
  try {
    const { id } = req.params;
    const user_id = req.user?.user_id;
    if (!user_id) return res.status(400).json({ ok: false, message: 'ไม่พบข้อมูลผู้ใช้' });
    const result = await pool.query('DELETE FROM group_members WHERE group_id = $1 AND user_id = $2', [id, user_id]);
    if (result.rowCount === 0) return res.status(404).json({ ok: false, message: 'ไม่พบกลุ่มหรือคุณไม่ได้เป็นสมาชิก' });
    return res.json({ ok: true, message: 'ออกจากกลุ่มเรียบร้อย' });
  } catch (e) {
    console.error('Failed to leave group:', e);
    return res.status(500).json({ ok: false, message: 'ไม่สามารถออกจากกลุ่มได้' });
  }
}

// ลบกลุ่ม
export async function deleteGroupHandler(req, res) {
  try {
    const { id } = req.params;
    const user_id = req.user?.user_id;
    const groupRes = await pool.query('SELECT * FROM groups WHERE group_id = $1', [id]);
    const group = groupRes.rows[0];
    if (!group) return res.status(404).json({ ok: false, message: 'ไม่พบกลุ่ม' });
    if (group.owner_id !== user_id) return res.status(403).json({ ok: false, message: 'คุณไม่มีสิทธิ์ลบกลุ่มนี้' });
    await pool.query('DELETE FROM groups WHERE group_id = $1', [id]);
    return res.json({ ok: true, message: 'ลบกลุ่มเรียบร้อย' });
  } catch (e) {
    console.error('Failed to delete group:', e);
    return res.status(500).json({ ok: false, message: 'ไม่สามารถลบกลุ่มได้' });
  }
}

// สร้างโพสต์ในกลุ่ม
export async function createGroupPost(req, res) {
  try {
    const { id } = req.params; // group_id
    const { title, body, category } = req.body;
    const author_id = req.user?.user_id;
    if (!author_id) return res.status(400).json({ ok: false, message: 'ไม่พบข้อมูลผู้ใช้' });
    const check = await pool.query('SELECT * FROM group_members WHERE group_id = $1 AND user_id = $2', [id, author_id]);
    if (check.rowCount === 0) return res.status(403).json({ ok: false, message: 'คุณไม่ได้เป็นสมาชิกกลุ่มนี้' });
    const postRes = await pool.query(
      'INSERT INTO posts (author_id, title, body, category, group_id, status) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [author_id, title, body, category, id, 'published']
    );
    return res.json({ ok: true, post: postRes.rows[0] });
  } catch (e) {
    console.error('Failed to create post:', e);
    return res.status(500).json({ ok: false, message: 'ไม่สามารถสร้างโพสต์ได้' });
  }
}

