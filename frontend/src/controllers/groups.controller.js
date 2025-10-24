import { getAllGroups, addGroup } from '../services/groups.service.js';

export async function renderGroupsPage(req, res) {
  try {
    const groups = await getAllGroups();
    return res.render('groups', { title: 'Groups', groups });
  } catch (e) {
    console.error('Failed to load groups:', e);
    return res.status(500).send('Failed to load groups');
  }
}

export async function createGroup(req, res) {
  try {
    const { name, description } = req.body || {};
    if (!name || String(name).trim().length === 0) {
      return res.status(400).json({ ok: false, message: 'กรุณากรอกชื่อกลุ่ม' });
    }
    const createdBy = req.user?.username || null;
    const group = await addGroup({ name, description, createdBy });

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
