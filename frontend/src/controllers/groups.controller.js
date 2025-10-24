import { getAllGroups, addGroup } from '../services/groups.service.js';
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
