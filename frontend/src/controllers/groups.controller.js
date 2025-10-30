import pool from '../config/dbconn.js';
import TAG_LIST from '../data/tags.js';
import { getUnifiedFeed } from './feed.controller.js';
import { createPost as createStandalonePost } from './posts.controller.js';
import { loadCurrentUser } from '../utils/session-user.js';

const BASE_GROUP_SELECT = `
  SELECT
    g.group_id,
    g.name,
    g.description,
    g.owner_id,
    g.created_at,
    g.updated_at,
    u.username        AS owner_username,
    COALESCE(u.display_name, u.username) AS owner_display_name,
    COALESCE(
      json_agg(
        jsonb_build_object(
          'user_id',     gm.user_id,
          'username',    member.username,
          'display_name',COALESCE(member.display_name, member.username),
          'joined_at',   gm.created_at
        )
        ORDER BY gm.created_at
      ) FILTER (WHERE gm.user_id IS NOT NULL),
      '[]'
    ) AS members,
    COUNT(gm.user_id) FILTER (WHERE gm.user_id IS NOT NULL) AS member_count
  FROM groups g
  JOIN users u ON u.user_id = g.owner_id
  LEFT JOIN group_members gm ON gm.group_id = g.group_id
  LEFT JOIN users member ON member.user_id = gm.user_id
`;

function parseJsonArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function formatGroupRow(row) {
  const membersRaw = parseJsonArray(row.members);
  const members = membersRaw
    .map((member) => {
      const userId = member?.user_id || null;
      const username = member?.username || null;
      const displayName = member?.display_name || member?.displayName || username;

      if (!userId && !username) return null;

      return {
        user_id: userId,
        username,
        displayName,
        display_name: displayName,
        joined_at: member?.joined_at || null,
        role: userId && row.owner_id && userId === row.owner_id ? 'owner' : 'member'
      };
    })
    .filter(Boolean);

  const ownerExists = members.some((member) => member.user_id === row.owner_id);
  if (!ownerExists) {
    const ownerDisplayName = row.owner_display_name || row.owner_username;
    members.unshift({
      user_id: row.owner_id,
      username: row.owner_username,
      displayName: ownerDisplayName,
      display_name: ownerDisplayName,
      joined_at: row.created_at,
      role: 'owner'
    });
  }

  return {
    id: row.group_id,
    group_id: row.group_id,
    name: row.name,
    description: row.description || '',
    ownerId: row.owner_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.owner_username,
    ownerDisplayName: row.owner_display_name,
    members,
    memberCount: members.length,
    tags: []
  };
}

async function fetchGroups({ groupId } = {}) {
  const values = [];
  let whereClause = '';

  if (groupId) {
    values.push(groupId);
    whereClause = `WHERE g.group_id = $${values.length}`;
  }

  const query = `
    ${BASE_GROUP_SELECT}
    ${whereClause}
    GROUP BY g.group_id, g.name, g.description, g.owner_id, g.created_at, g.updated_at, u.user_id, u.username, u.display_name
    ORDER BY g.created_at DESC
  `;

  const { rows } = await pool.query(query, values);
  return rows.map(formatGroupRow);
}

// แสดงหน้า groups ทั้งหมด
export async function renderGroupsPage(req, res) {
  try {
  const currentUser = await loadCurrentUser(req, { res });
    const groups = await fetchGroups();

    return res.render('groups', {
      title: 'Groups',
      groups,
      currentUser,
      activePage: 'groups',
      exploreTags: TAG_LIST
    });
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
  const currentUser = await loadCurrentUser(req, { res });
    const owner_id = currentUser?.user_id;
    if (!owner_id) {
      return res.status(400).json({ ok: false, message: 'ไม่พบข้อมูลผู้ใช้' });
    }
    const groupRes = await pool.query(
      'INSERT INTO groups (name, description, owner_id) VALUES ($1, $2, $3) RETURNING *',
      [name.trim(), description || null, owner_id]
    );
    const group = groupRes.rows[0];

    let formattedGroup = null;
    if (group) {
      await pool.query(
        `INSERT INTO group_members (group_id, user_id)
         VALUES ($1, $2)
         ON CONFLICT (group_id, user_id) DO NOTHING`,
        [group.group_id, owner_id]
      );

      const fetched = await fetchGroups({ groupId: group.group_id });
      formattedGroup = fetched[0] || null;
    }

    const accept = req.headers['accept'] || '';
    const responseGroup = formattedGroup || {
      id: group.group_id,
      group_id: group.group_id,
      name: group.name,
      description: group.description || '',
      ownerId: owner_id,
      createdAt: group.created_at,
      updatedAt: group.updated_at,
      createdBy: currentUser?.username || null,
      ownerDisplayName: currentUser?.display_name || currentUser?.username || null,
      members: [
        {
          user_id: owner_id,
          username: currentUser?.username || null,
          displayName: currentUser?.display_name || currentUser?.username || null,
          display_name: currentUser?.display_name || currentUser?.username || null,
          joined_at: group.created_at,
          role: 'owner'
        }
      ],
      memberCount: 1,
      tags: []
    };

    if (accept.includes('application/json') || req.xhr) {
      return res.status(201).json({ ok: true, group: responseGroup });
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
  const currentUser = await loadCurrentUser(req, { res });

    const [group] = await fetchGroups({ groupId: id });
    if (!group) {
      return res.status(404).send('ไม่พบกลุ่ม');
    }

    const isOwner = currentUser ? group.ownerId === currentUser.user_id : false;
    const members = Array.isArray(group.members) ? group.members : [];
    const isMember = currentUser ? members.some((m) => m.user_id === currentUser.user_id) : false;

    const posts = await getUnifiedFeed({
      groupId: id,
      statuses: ['published', 'unpublish']
    });

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
  const currentUser = await loadCurrentUser(req, { res });
    const user_id = currentUser?.user_id;
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
  const currentUser = await loadCurrentUser(req, { res });
    const user_id = currentUser?.user_id;

    if (!user_id) {
      return res.status(400).json({ ok: false, message: 'ไม่พบข้อมูลผู้ใช้' });
    }

    const result = await pool.query(
      'DELETE FROM group_members WHERE group_id = $1 AND user_id = $2',
      [id, user_id]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ ok: false, message: 'ไม่พบกลุ่มหรือคุณไม่ได้เป็นสมาชิก' });
    }

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
  const currentUser = await loadCurrentUser(req, { res });
    const user_id = currentUser?.user_id;

    if (!user_id) {
      return res.status(400).json({ ok: false, message: 'ไม่พบข้อมูลผู้ใช้' });
    }

    const { rows } = await pool.query('SELECT * FROM groups WHERE group_id = $1', [id]);
    const group = rows[0];

    if (!group) {
      return res.status(404).json({ ok: false, message: 'ไม่พบกลุ่ม' });
    }

    if (group.owner_id !== user_id) {
      return res.status(403).json({ ok: false, message: 'คุณไม่มีสิทธิ์ลบกลุ่มนี้' });
    }

    await pool.query('DELETE FROM groups WHERE group_id = $1', [id]);

    return res.json({ ok: true, message: 'ลบกลุ่มเรียบร้อย' });
  } catch (e) {
    console.error('Failed to delete group:', e);
    return res.status(500).json({ ok: false, message: 'ไม่สามารถลบกลุ่มได้' });
  }
}

// สร้างโพสต์ในกลุ่ม
export async function createGroupPost(req, res) {
  const { id } = req.params;

  try {
  const currentUser = await loadCurrentUser(req, { res });
    const author_id = currentUser?.user_id;

    if (!author_id) {
      return res.status(400).json({ ok: false, message: 'ไม่พบข้อมูลผู้ใช้' });
    }

    const [group] = await fetchGroups({ groupId: id });
    if (!group) {
      return res.status(404).json({ ok: false, message: 'ไม่พบกลุ่ม' });
    }

    const isOwner = group.ownerId === author_id;
    const isMember = group.members?.some((member) => member.user_id === author_id) || false;

    if (!isOwner && !isMember) {
      return res.status(403).json({ ok: false, message: 'คุณไม่ได้เป็นสมาชิกกลุ่มนี้' });
    }

    req.body = { ...req.body, group_id: id };

    return await createStandalonePost(req, res);
  } catch (e) {
    console.error('Failed to create post in group:', e);
    return res.status(500).json({ ok: false, message: 'ไม่สามารถสร้างโพสต์ได้' });
  }
}


