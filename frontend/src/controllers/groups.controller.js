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

  const ownerExists = members.some((member) => member.user_id && member.user_id === row.owner_id);
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

async function fetchPendingJoinRequests(groupId) {
  const { rows } = await pool.query(
    `SELECT
       r.request_id,
       r.user_id,
       r.status,
       r.created_at,
       u.username,
       COALESCE(u.display_name, u.username) AS display_name
     FROM group_join_requests r
     JOIN users u ON u.user_id = r.user_id
     WHERE r.group_id = $1 AND r.status = 'pending'
     ORDER BY r.created_at ASC`,
    [groupId]
  );

  return rows.map((row) => ({
    requestId: row.request_id,
    userId: row.user_id,
    username: row.username,
    displayName: row.display_name,
    status: row.status,
    requestedAt: row.created_at
  }));
}

async function findLatestJoinRequest(groupId, userId) {
  if (!groupId || !userId) return null;

  // First get the user's UUID from their cognito_sub or username
  const userResult = await pool.query(
    'SELECT user_id FROM users WHERE cognito_sub = $1 OR username = $1 LIMIT 1',
    [userId]
  );
  
  if (userResult.rows.length === 0) return null;
  const userUuid = userResult.rows[0].user_id;

  const { rows } = await pool.query(
    `SELECT request_id, status, created_at, responded_at
     FROM group_join_requests
     WHERE group_id = $1 AND user_id = $2
     ORDER BY created_at DESC
     LIMIT 1`,
    [groupId, userUuid]
  );

  return rows[0] || null;
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
    const latestJoinRequest = !isOwner && !isMember && currentUser
      ? await findLatestJoinRequest(id, currentUser.user_id)
      : null;

    const canSeeUnpublished = Boolean(currentUser);
    const statuses = canSeeUnpublished ? ['published', 'unpublish'] : ['published'];
    const posts = await getUnifiedFeed({
      groupId: id,
      statuses,
      viewerId: canSeeUnpublished ? currentUser.user_id : null
    });

    const pendingRequests = isOwner ? await fetchPendingJoinRequests(id) : [];
    const joinRequestStatus = latestJoinRequest?.status || null;
    const tagMap = Object.fromEntries(TAG_LIST.map(t => [t.slug, t.label]));
    return res.render('group-details', {
      title: group.name,
      group,
      currentUser,
      isOwner,
      isMember,
      pendingRequests,
      joinRequestStatus,
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

    const { rows: groupRows } = await pool.query('SELECT owner_id FROM groups WHERE group_id = $1', [id]);
    const group = groupRows[0];
    if (!group) {
      return res.status(404).json({ ok: false, message: 'ไม่พบกลุ่ม' });
    }

    if (group.owner_id === user_id) {
      return res.status(400).json({ ok: false, message: 'คุณเป็นเจ้าของกลุ่มอยู่แล้ว' });
    }

    const membershipCheck = await pool.query('SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2', [id, user_id]);
    if (membershipCheck.rowCount > 0) {
      return res.json({ ok: true, message: 'คุณเป็นสมาชิกของกลุ่มนี้อยู่แล้ว', status: 'member' });
    }

    const { rows: requestRows } = await pool.query(
      `SELECT request_id, status
       FROM group_join_requests
       WHERE group_id = $1 AND user_id = $2`,
      [id, user_id]
    );

    const existingRequest = requestRows[0] || null;

    if (existingRequest) {
      if (existingRequest.status === 'pending') {
        return res.json({ ok: true, message: 'คุณได้ส่งคำขอเข้าร่วมแล้ว กรุณารอการอนุมัติ', status: 'pending' });
      }

      if (existingRequest.status === 'approved') {
        await pool.query(
          `INSERT INTO group_members (group_id, user_id)
           VALUES ($1, $2)
           ON CONFLICT (group_id, user_id) DO NOTHING`,
          [id, user_id]
        );
        return res.json({ ok: true, message: 'คุณเป็นสมาชิกของกลุ่มนี้แล้ว', status: 'member' });
      }

      await pool.query(
        `UPDATE group_join_requests
         SET status = 'pending', created_at = now(), responded_at = NULL
         WHERE request_id = $1`,
        [existingRequest.request_id]
      );

      return res.json({ ok: true, message: 'ส่งคำขอเข้าร่วมกลุ่มอีกครั้งเรียบร้อย', status: 'pending' });
    }

    await pool.query(
      'INSERT INTO group_join_requests (group_id, user_id, status) VALUES ($1, $2, $3)',
      [id, user_id, 'pending']
    );

    return res.json({ ok: true, message: 'ส่งคำขอเข้าร่วมกลุ่มแล้ว กรุณารอการอนุมัติ', status: 'pending' });
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

    // Check if user is the owner
    const { rows: groupRows } = await pool.query(
      'SELECT owner_id FROM groups WHERE group_id = $1',
      [id]
    );

    if (groupRows.length === 0) {
      return res.status(404).json({ ok: false, message: 'ไม่พบกลุ่ม' });
    }

    const group = groupRows[0];
    
    // If user is the owner, check if there are other members to transfer ownership to
    if (group.owner_id === user_id) {
      const { rows: memberRows } = await pool.query(
        `SELECT user_id, username, display_name
         FROM group_members gm
         JOIN users u ON u.user_id = gm.user_id
         WHERE gm.group_id = $1 AND gm.user_id != $2
         ORDER BY gm.created_at ASC
         LIMIT 1`,
        [id, user_id]
      );

      if (memberRows.length > 0) {
        // Transfer ownership to the oldest member
        const newOwner = memberRows[0];
        await pool.query('BEGIN');
        
        // Update group ownership
        await pool.query(
          'UPDATE groups SET owner_id = $1 WHERE group_id = $2',
          [newOwner.user_id, id]
        );
        
        // Remove old owner from members
        await pool.query(
          'DELETE FROM group_members WHERE group_id = $1 AND user_id = $2',
          [id, user_id]
        );
        
        await pool.query('COMMIT');
        
        return res.json({
          ok: true,
          message: `ออกจากกลุ่มเรียบร้อย และได้โอนย้ายตำแหน่งเจ้าของกลุ่มให้กับ ${newOwner.display_name || newOwner.username}`
        });
      } else {
        // If no other members, delete the group
        await pool.query('DELETE FROM groups WHERE group_id = $1', [id]);
        return res.json({
          ok: true,
          message: 'ออกจากกลุ่มเรียบร้อย และได้ลบกลุ่มเนื่องจากไม่มีสมาชิกคนอื่น'
        });
      }
    } else {
      // Regular member leaving
      const result = await pool.query(
        'DELETE FROM group_members WHERE group_id = $1 AND user_id = $2',
        [id, user_id]
      );

      if (result.rowCount === 0) {
        return res.status(404).json({ ok: false, message: 'ไม่พบกลุ่มหรือคุณไม่ได้เป็นสมาชิก' });
      }

      return res.json({ ok: true, message: 'ออกจากกลุ่มเรียบร้อย' });
    }
  } catch (e) {
    console.error('Failed to leave group:', e);
    try {
      await pool.query('ROLLBACK');
    } catch (rollbackErr) {
      console.error('Rollback failed:', rollbackErr);
    }
    return res.status(500).json({ ok: false, message: 'ไม่สามารถออกจากกลุ่มได้' });
  }
}

async function assertGroupOwner(groupId, userId) {
  const { rows } = await pool.query('SELECT owner_id FROM groups WHERE group_id = $1', [groupId]);
  const group = rows[0];
  if (!group) {
    return { ok: false, reason: 'not_found' };
  }
  if (group.owner_id !== userId) {
    return { ok: false, reason: 'forbidden' };
  }
  return { ok: true, ownerId: group.owner_id };
}

export async function approveJoinRequestHandler(req, res) {
  const { id, requestId } = req.params;

  try {
  const currentUser = await loadCurrentUser(req, { res });
    const user_id = currentUser?.user_id;

    if (!user_id) {
      return res.status(401).json({ ok: false, message: 'กรุณาเข้าสู่ระบบ' });
    }

    const ownership = await assertGroupOwner(id, user_id);
    if (!ownership.ok) {
      if (ownership.reason === 'not_found') {
        return res.status(404).json({ ok: false, message: 'ไม่พบกลุ่ม' });
      }
      return res.status(403).json({ ok: false, message: 'คุณไม่มีสิทธิ์อนุมัติคำขอของกลุ่มนี้' });
    }

    await pool.query('BEGIN');

    const { rows } = await pool.query(
      `SELECT request_id, user_id, status
       FROM group_join_requests
       WHERE request_id = $1 AND group_id = $2
       FOR UPDATE`,
      [requestId, id]
    );

    const request = rows[0];
    if (!request) {
      await pool.query('ROLLBACK');
      return res.status(404).json({ ok: false, message: 'ไม่พบคำขอ' });
    }

    if (request.status !== 'pending') {
      await pool.query('ROLLBACK');
      return res.status(400).json({ ok: false, message: 'คำขอถูกดำเนินการไปแล้ว' });
    }

    await pool.query(
      `UPDATE group_join_requests
       SET status = 'approved', responded_at = now()
       WHERE request_id = $1`,
      [requestId]
    );

    await pool.query(
      `INSERT INTO group_members (group_id, user_id)
       VALUES ($1, $2)
       ON CONFLICT (group_id, user_id) DO NOTHING`,
      [id, request.user_id]
    );

    await pool.query('COMMIT');

    return res.json({ ok: true, message: 'อนุมัติคำขอเรียบร้อย' });
  } catch (e) {
    console.error('Failed to approve join request:', e);
    try {
      await pool.query('ROLLBACK');
    } catch (rollbackErr) {
      console.error('Rollback failed:', rollbackErr);
    }
    return res.status(500).json({ ok: false, message: 'ไม่สามารถอนุมัติคำขอได้' });
  }
}

export async function rejectJoinRequestHandler(req, res) {
  const { id, requestId } = req.params;

  try {
  const currentUser = await loadCurrentUser(req, { res });
    const user_id = currentUser?.user_id;

    if (!user_id) {
      return res.status(401).json({ ok: false, message: 'กรุณาเข้าสู่ระบบ' });
    }

    const ownership = await assertGroupOwner(id, user_id);
    if (!ownership.ok) {
      if (ownership.reason === 'not_found') {
        return res.status(404).json({ ok: false, message: 'ไม่พบกลุ่ม' });
      }
      return res.status(403).json({ ok: false, message: 'คุณไม่มีสิทธิ์ปฏิเสธคำขอของกลุ่มนี้' });
    }

    await pool.query('BEGIN');

    const { rows } = await pool.query(
      `SELECT request_id, user_id, status
       FROM group_join_requests
       WHERE request_id = $1 AND group_id = $2
       FOR UPDATE`,
      [requestId, id]
    );

    const request = rows[0];
    if (!request) {
      await pool.query('ROLLBACK');
      return res.status(404).json({ ok: false, message: 'ไม่พบคำขอ' });
    }

    if (request.status !== 'pending') {
      await pool.query('ROLLBACK');
      return res.status(400).json({ ok: false, message: 'คำขอถูกดำเนินการไปแล้ว' });
    }

    await pool.query(
      `UPDATE group_join_requests
       SET status = 'rejected', responded_at = now()
       WHERE request_id = $1`,
      [requestId]
    );

    await pool.query('COMMIT');

    return res.json({ ok: true, message: 'ปฏิเสธคำขอเรียบร้อย' });
  } catch (e) {
    console.error('Failed to reject join request:', e);
    try {
      await pool.query('ROLLBACK');
    } catch (rollbackErr) {
      console.error('Rollback failed:', rollbackErr);
    }
    return res.status(500).json({ ok: false, message: 'ไม่สามารถปฏิเสธคำขอได้' });
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

    // Check if group exists
    const { rows: groupRows } = await pool.query(
      'SELECT owner_id FROM groups WHERE group_id = $1',
      [id]
    );

    if (groupRows.length === 0) {
      return res.status(404).json({ ok: false, message: 'ไม่พบกลุ่ม' });
    }

    const group = groupRows[0];
    const isOwner = group.owner_id === author_id;

    // Check if user is a member
    const { rows: memberRows } = await pool.query(
      'SELECT 1 FROM group_members WHERE group_id = $1 AND user_id = $2',
      [id, author_id]
    );

    const isMember = memberRows.length > 0;

    if (!isOwner && !isMember) {
      return res.status(403).json({ ok: false, message: 'คุณไม่ได้เป็นสมาชิกกลุ่มนี้' });
    }

    // Set group_id in request body and create post
    req.body = { ...req.body, group_id: id };

    // Use the existing createPost function from posts.controller
    return await createStandalonePost(req, res);
  } catch (e) {
    console.error('Failed to create post in group:', e);
    return res.status(500).json({ ok: false, message: 'ไม่สามารถสร้างโพสต์ได้' });
  }
}

// Change member role (Owner only)
export async function changeMemberRoleHandler(req, res) {
  try {
    const { id, username } = req.params;
    const { role } = req.body;
    
    const currentUser = await loadCurrentUser(req, { res });
    const user_id = currentUser?.user_id;

    if (!user_id) {
      return res.status(401).json({ ok: false, message: 'กรุณาเข้าสู่ระบบ' });
    }

    // Validate role
    if (!['member', 'owner'].includes(role)) {
      return res.status(400).json({ ok: false, message: 'บทบาทไม่ถูกต้อง' });
    }

    // Check if current user is the group owner
    const ownership = await assertGroupOwner(id, user_id);
    if (!ownership.ok) {
      if (ownership.reason === 'not_found') {
        return res.status(404).json({ ok: false, message: 'ไม่พบกลุ่ม' });
      }
      return res.status(403).json({ ok: false, message: 'คุณไม่มีสิทธิ์เปลี่ยนบทบาทในกลุ่มนี้' });
    }

    // Get the target user's ID from username
    const { rows: userRows } = await pool.query(
      'SELECT user_id FROM users WHERE username = $1',
      [username]
    );

    if (userRows.length === 0) {
      return res.status(404).json({ ok: false, message: 'ไม่พบผู้ใช้' });
    }

    const targetUserId = userRows[0].user_id;

    // Prevent owner from changing their own role
    if (targetUserId === user_id) {
      return res.status(400).json({ ok: false, message: 'ไม่สามารถเปลี่ยนบทบาทของตัวเองได้' });
    }

    await pool.query('BEGIN');

    if (role === 'owner') {
      // Transfer ownership
      await pool.query(
        'UPDATE groups SET owner_id = $1 WHERE group_id = $2',
        [targetUserId, id]
      );
      
      // Ensure new owner is in group_members
      await pool.query(
        `INSERT INTO group_members (group_id, user_id)
         VALUES ($1, $2)
         ON CONFLICT (group_id, user_id) DO NOTHING`,
        [id, targetUserId]
      );
      
      // Add old owner as a member if not already
      await pool.query(
        `INSERT INTO group_members (group_id, user_id)
         VALUES ($1, $2)
         ON CONFLICT (group_id, user_id) DO NOTHING`,
        [id, user_id]
      );
    } else {
      // Just ensure they're a member (role is determined by owner_id comparison)
      await pool.query(
        `INSERT INTO group_members (group_id, user_id)
         VALUES ($1, $2)
         ON CONFLICT (group_id, user_id) DO NOTHING`,
        [id, targetUserId]
      );
    }

    await pool.query('COMMIT');

    return res.json({ ok: true, message: 'เปลี่ยนบทบาทเรียบร้อย' });
  } catch (e) {
    console.error('Failed to change member role:', e);
    try {
      await pool.query('ROLLBACK');
    } catch (rollbackErr) {
      console.error('Rollback failed:', rollbackErr);
    }
    return res.status(500).json({ ok: false, message: 'ไม่สามารถเปลี่ยนบทบาทได้' });
  }
}

// Remove member from group (Owner only)
export async function removeMemberHandler(req, res) {
  try {
    const { id, username } = req.params;
    
    const currentUser = await loadCurrentUser(req, { res });
    const user_id = currentUser?.user_id;

    if (!user_id) {
      return res.status(401).json({ ok: false, message: 'กรุณาเข้าสู่ระบบ' });
    }

    // Check if current user is the group owner
    const ownership = await assertGroupOwner(id, user_id);
    if (!ownership.ok) {
      if (ownership.reason === 'not_found') {
        return res.status(404).json({ ok: false, message: 'ไม่พบกลุ่ม' });
      }
      return res.status(403).json({ ok: false, message: 'คุณไม่มีสิทธิ์ลบสมาชิกจากกลุ่มนี้' });
    }

    // Get the target user's ID from username
    const { rows: userRows } = await pool.query(
      'SELECT user_id FROM users WHERE username = $1',
      [username]
    );

    if (userRows.length === 0) {
      return res.status(404).json({ ok: false, message: 'ไม่พบผู้ใช้' });
    }

    const targetUserId = userRows[0].user_id;

    // Prevent owner from removing themselves
    if (targetUserId === user_id) {
      return res.status(400).json({ ok: false, message: 'ไม่สามารถลบตัวเองออกจากกลุ่มได้ กรุณาใช้ฟังก์ชันออกจากกลุ่มแทน' });
    }

    // Remove member from group
    const result = await pool.query(
      'DELETE FROM group_members WHERE group_id = $1 AND user_id = $2',
      [id, targetUserId]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ ok: false, message: 'ไม่พบสมาชิกนี้ในกลุ่ม' });
    }

    return res.json({ ok: true, message: 'ลบสมาชิกเรียบร้อย' });
  } catch (e) {
    console.error('Failed to remove member:', e);
    return res.status(500).json({ ok: false, message: 'ไม่สามารถลบสมาชิกได้' });
  }
}


