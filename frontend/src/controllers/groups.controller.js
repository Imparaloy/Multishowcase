import {
  getAllGroups,
  addGroup,
  findGroupById,
  updateGroup,
  deleteGroup,
  joinGroup,
  leaveGroup,
  approveJoinRequest,
  rejectJoinRequest,
  changeMemberRole,
  removeMember,
  addGroupPost,
  deleteGroupPost
} from '../services/groups.service.js';
import { currentUser as mockCurrentUser, exploreTags } from '../data/mock.js';

export async function renderGroupsPage(req, res) {
  try {
    const groups = await getAllGroups();
    return res.render('groups', { title: 'Groups', groups, currentUser: mockCurrentUser, activePage: 'groups', exploreTags });
  } catch (e) {
    console.error('Failed to load groups:', e);
    return res.status(500).send('Failed to load groups');
  }
}

export async function createGroup(req, res) {
  try {
    const { name, description } = req.body || {};
    // tags can be array or single string
    let tags = req.body?.tags ?? [];
    if (typeof tags === 'string') tags = [tags];
    if (!Array.isArray(tags)) tags = [];
    // keep only allowed tags
    const allowed = new Set((exploreTags || []).map(t => t.slug));
    const safeTags = tags.map(t => String(t).toLowerCase()).filter(t => allowed.has(t));
    if (!name || String(name).trim().length === 0) {
      return res.status(400).json({ ok: false, message: 'กรุณากรอกชื่อกลุ่ม' });
    }
  const createdBy = req.user?.username || mockCurrentUser.username || null;
  const group = await addGroup({ name, description, createdBy, tags: safeTags });

    // If expecting JSON (AJAX), return JSON; else redirect
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

export async function renderGroupDetailsPage(req, res) {
  try {
    const { id } = req.params;
    const group = await findGroupById(id);
    
    if (!group) {
      return res.status(404).send('Group not found');
    }
    
    const currentUser = req.user || mockCurrentUser;
    
    // Check if current user is owner
    const isOwner = group.createdBy === currentUser.username;
    
    // Check if current user is a member
    const isMember = group.members && group.members.some(m => m.username === currentUser.username);
    
    // Get pending requests (only for owners)
    const pendingRequests = isOwner ? (group.pendingRequests || []) : [];
    
    // Get posts
    const posts = group.posts || [];
    
    // Create a tag lookup map for easy access to tag labels
    const tagMap = {};
    if (exploreTags && Array.isArray(exploreTags)) {
      exploreTags.forEach(tag => {
        tagMap[tag.slug] = tag.label;
      });
    }

    return res.render('group-details', {
      title: group.name,
      group,
      currentUser,
      isOwner,
      isMember,
      pendingRequests,
      posts,
      exploreTags,
      tagMap
    });
  } catch (e) {
    console.error('Failed to load group details:', e);
    return res.status(500).send('Failed to load group details');
  }
}

export async function requestJoinGroup(req, res) {
  try {
    const { id } = req.params;
    const currentUser = req.user || mockCurrentUser;
    
    const result = await joinGroup(id, currentUser.username, currentUser.displayName);
    
    if (result && result.error) {
      return res.status(400).json({ ok: false, message: result.error });
    }
    
    return res.json({ ok: true, message: 'คำขอเข้าร่วมกลุ่มได้ถูกส่งแล้ว' });
  } catch (e) {
    console.error('Failed to join group:', e);
    return res.status(500).json({ ok: false, message: 'ไม่สามารถขอเข้าร่วมกลุ่มได้' });
  }
}

export async function leaveGroupHandler(req, res) {
  try {
    const { id } = req.params;
    const currentUser = req.user || mockCurrentUser;
    
    const result = await leaveGroup(id, currentUser.username);
    
    if (!result) {
      return res.status(404).json({ ok: false, message: 'ไม่พบกลุ่ม' });
    }
    
    return res.json({ ok: true, message: 'ออกจากกลุ่มเรียบร้อย' });
  } catch (e) {
    console.error('Failed to leave group:', e);
    return res.status(500).json({ ok: false, message: 'ไม่สามารถออกจากกลุ่มได้' });
  }
}

export async function deleteGroupHandler(req, res) {
  try {
    const { id } = req.params;
    const currentUser = req.user || mockCurrentUser;
    
    const group = await findGroupById(id);
    if (!group) {
      return res.status(404).json({ ok: false, message: 'ไม่พบกลุ่ม' });
    }
    
    if (group.createdBy !== currentUser.username) {
      return res.status(403).json({ ok: false, message: 'คุณไม่มีสิทธิ์ลบกลุ่มนี้' });
    }
    
    const success = await deleteGroup(id);
    
    if (!success) {
      return res.status(404).json({ ok: false, message: 'ไม่พบกลุ่ม' });
    }
    
    return res.json({ ok: true, message: 'ลบกลุ่มเรียบร้อย' });
  } catch (e) {
    console.error('Failed to delete group:', e);
    return res.status(500).json({ ok: false, message: 'ไม่สามารถลบกลุ่มได้' });
  }
}

export async function approveJoinRequestHandler(req, res) {
  try {
    const { id, username } = req.params;
    const currentUser = req.user || mockCurrentUser;
    
    const group = await findGroupById(id);
    if (!group) {
      return res.status(404).json({ ok: false, message: 'ไม่พบกลุ่ม' });
    }
    
    if (group.createdBy !== currentUser.username) {
      return res.status(403).json({ ok: false, message: 'คุณไม่มีสิทธิ์อนุมัติคำขอ' });
    }
    
    const result = await approveJoinRequest(id, username);
    
    if (result && result.error) {
      return res.status(400).json({ ok: false, message: result.error });
    }
    
    return res.json({ ok: true, message: 'อนุมัติคำขอเรียบร้อย' });
  } catch (e) {
    console.error('Failed to approve request:', e);
    return res.status(500).json({ ok: false, message: 'ไม่สามารถอนุมัติคำขอได้' });
  }
}

export async function rejectJoinRequestHandler(req, res) {
  try {
    const { id, username } = req.params;
    const currentUser = req.user || mockCurrentUser;
    
    const group = await findGroupById(id);
    if (!group) {
      return res.status(404).json({ ok: false, message: 'ไม่พบกลุ่ม' });
    }
    
    if (group.createdBy !== currentUser.username) {
      return res.status(403).json({ ok: false, message: 'คุณไม่มีสิทธิ์ปฏิเสธคำขอ' });
    }
    
    const result = await rejectJoinRequest(id, username);
    
    if (!result) {
      return res.status(404).json({ ok: false, message: 'ไม่พบกลุ่ม' });
    }
    
    return res.json({ ok: true, message: 'ปฏิเสธคำขอเรียบร้อย' });
  } catch (e) {
    console.error('Failed to reject request:', e);
    return res.status(500).json({ ok: false, message: 'ไม่สามารถปฏิเสธคำขอได้' });
  }
}

export async function changeMemberRoleHandler(req, res) {
  try {
    const { id, username } = req.params;
    const { role } = req.body;
    const currentUser = req.user || mockCurrentUser;
    
    const group = await findGroupById(id);
    if (!group) {
      return res.status(404).json({ ok: false, message: 'ไม่พบกลุ่ม' });
    }
    
    if (group.createdBy !== currentUser.username) {
      return res.status(403).json({ ok: false, message: 'คุณไม่มีสิทธิ์เปลี่ยนบทบาทสมาชิก' });
    }
    
    const result = await changeMemberRole(id, username, role);
    
    if (result && result.error) {
      return res.status(400).json({ ok: false, message: result.error });
    }
    
    return res.json({ ok: true, message: 'เปลี่ยนบทบาทสมาชิกเรียบร้อย' });
  } catch (e) {
    console.error('Failed to change member role:', e);
    return res.status(500).json({ ok: false, message: 'ไม่สามารถเปลี่ยนบทบาทสมาชิกได้' });
  }
}

export async function removeMemberHandler(req, res) {
  try {
    const { id, username } = req.params;
    const currentUser = req.user || mockCurrentUser;
    
    const group = await findGroupById(id);
    if (!group) {
      return res.status(404).json({ ok: false, message: 'ไม่พบกลุ่ม' });
    }
    
    if (group.createdBy !== currentUser.username) {
      return res.status(403).json({ ok: false, message: 'คุณไม่มีสิทธิ์ลบสมาชิก' });
    }
    
    const result = await removeMember(id, username);
    
    if (result && result.error) {
      return res.status(400).json({ ok: false, message: result.error });
    }
    
    return res.json({ ok: true, message: 'ลบสมาชิกเรียบร้อย' });
  } catch (e) {
    console.error('Failed to remove member:', e);
    return res.status(500).json({ ok: false, message: 'ไม่สามารถลบสมาชิกได้' });
  }
}

export async function createGroupPost(req, res) {
  try {
    const { id } = req.params;
    const { content } = req.body;
    const currentUser = req.user || mockCurrentUser;
    
    const group = await findGroupById(id);
    if (!group) {
      return res.status(404).json({ ok: false, message: 'ไม่พบกลุ่ม' });
    }
    
    // Check if user is a member
    const isMember = group.members && group.members.some(m => m.username === currentUser.username);
    if (!isMember) {
      return res.status(403).json({ ok: false, message: 'คุณไม่มีสิทธิ์โพสต์ในกลุ่มนี้' });
    }
    
    const post = await addGroupPost(id, currentUser.username, content);
    
    return res.json({ ok: true, post });
  } catch (e) {
    console.error('Failed to create post:', e);
    return res.status(500).json({ ok: false, message: 'ไม่สามารถสร้างโพสต์ได้' });
  }
}

export async function deleteGroupPostHandler(req, res) {
  try {
    const { id, postId } = req.params;
    const currentUser = req.user || mockCurrentUser;
    
    const group = await findGroupById(id);
    if (!group) {
      return res.status(404).json({ ok: false, message: 'ไม่พบกลุ่ม' });
    }
    
    // Find the post
    const post = group.posts && group.posts.find(p => p.id === postId);
    if (!post) {
      return res.status(404).json({ ok: false, message: 'ไม่พบโพสต์' });
    }
    
    // Check if user is owner or post author
    const isOwner = group.createdBy === currentUser.username;
    const isAuthor = post.author === currentUser.username;
    
    if (!isOwner && !isAuthor) {
      return res.status(403).json({ ok: false, message: 'คุณไม่มีสิทธิ์ลบโพสต์นี้' });
    }
    
    const result = await deleteGroupPost(id, postId);
    
    if (result && result.error) {
      return res.status(400).json({ ok: false, message: result.error });
    }
    
    return res.json({ ok: true, message: 'ลบโพสต์เรียบร้อย' });
  } catch (e) {
    console.error('Failed to delete post:', e);
    return res.status(500).json({ ok: false, message: 'ไม่สามารถลบโพสต์ได้' });
  }
}
