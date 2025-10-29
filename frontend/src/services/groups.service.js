import { promises as fs } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DATA_DIR = join(__dirname, '..', 'data');
const GROUPS_FILE = join(DATA_DIR, 'groups.json');

async function ensureFile() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.access(GROUPS_FILE);
  } catch {
    await fs.writeFile(GROUPS_FILE, JSON.stringify([], null, 2), 'utf-8');
  }
}

async function readAll() {
  await ensureFile();
  const raw = await fs.readFile(GROUPS_FILE, 'utf-8');
  try {
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function writeAll(groups) {
  await ensureFile();
  await fs.writeFile(GROUPS_FILE, JSON.stringify(groups, null, 2), 'utf-8');
}

function genId() {
  // Simple unique-ish id based on timestamp and random segment
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function getAllGroups() {
  return await readAll();
}

export async function addGroup({ name, description, createdBy, tags }) {
  const groups = await readAll();
  const now = new Date().toISOString();
  const group = {
    id: genId(),
    name: String(name || '').trim(),
    description: String(description || '').trim(),
    createdAt: now,
    createdBy: createdBy || null,
    tags: Array.isArray(tags) ? tags : [],
    members: [],
  };
  groups.push(group);
  await writeAll(groups);
  return group;
}

export async function findGroupById(id) {
  const groups = await readAll();
  return groups.find(g => g.id === id) || null;
}

export async function updateGroup(id, updates) {
  const groups = await readAll();
  const index = groups.findIndex(g => g.id === id);
  if (index === -1) return null;
  
  groups[index] = { ...groups[index], ...updates };
  await writeAll(groups);
  return groups[index];
}

export async function deleteGroup(id) {
  const groups = await readAll();
  const index = groups.findIndex(g => g.id === id);
  if (index === -1) return false;
  
  groups.splice(index, 1);
  await writeAll(groups);
  return true;
}

export async function joinGroup(groupId, username, displayName) {
  const groups = await readAll();
  const groupIndex = groups.findIndex(g => g.id === groupId);
  if (groupIndex === -1) return null;
  
  const group = groups[groupIndex];
  
  // Check if user is already a member
  if (group.members && group.members.some(m => m.username === username)) {
    return { error: 'User is already a member' };
  }
  
  // Check if there's already a pending request
  if (group.pendingRequests && group.pendingRequests.some(r => r.username === username)) {
    return { error: 'Request already pending' };
  }
  
  // Initialize arrays if they don't exist
  if (!group.members) group.members = [];
  if (!group.pendingRequests) group.pendingRequests = [];
  
  // Add to pending requests
  group.pendingRequests.push({
    username,
    displayName: displayName || username,
    requestedAt: new Date().toISOString()
  });
  
  await writeAll(groups);
  return group;
}

export async function leaveGroup(groupId, username) {
  const groups = await readAll();
  const groupIndex = groups.findIndex(g => g.id === groupId);
  if (groupIndex === -1) return null;
  
  const group = groups[groupIndex];
  
  // Remove from members
  if (group.members) {
    group.members = group.members.filter(m => m.username !== username);
  }
  
  // Remove from pending requests if exists
  if (group.pendingRequests) {
    group.pendingRequests = group.pendingRequests.filter(r => r.username !== username);
  }
  
  await writeAll(groups);
  return group;
}

export async function approveJoinRequest(groupId, username) {
  const groups = await readAll();
  const groupIndex = groups.findIndex(g => g.id === groupId);
  if (groupIndex === -1) return null;
  
  const group = groups[groupIndex];
  
  // Initialize arrays if they don't exist
  if (!group.members) group.members = [];
  if (!group.pendingRequests) group.pendingRequests = [];
  
  // Find the request
  const requestIndex = group.pendingRequests.findIndex(r => r.username === username);
  if (requestIndex === -1) return { error: 'Request not found' };
  
  const request = group.pendingRequests[requestIndex];
  
  // Remove from pending and add to members
  group.pendingRequests.splice(requestIndex, 1);
  group.members.push({
    username: request.username,
    displayName: request.displayName,
    role: 'member',
    joinedAt: new Date().toISOString()
  });
  
  await writeAll(groups);
  return group;
}

export async function rejectJoinRequest(groupId, username) {
  const groups = await readAll();
  const groupIndex = groups.findIndex(g => g.id === groupId);
  if (groupIndex === -1) return null;
  
  const group = groups[groupIndex];
  
  // Initialize array if it doesn't exist
  if (!group.pendingRequests) group.pendingRequests = [];
  
  // Remove from pending requests
  group.pendingRequests = group.pendingRequests.filter(r => r.username !== username);
  
  await writeAll(groups);
  return group;
}

export async function changeMemberRole(groupId, username, newRole) {
  const groups = await readAll();
  const groupIndex = groups.findIndex(g => g.id === groupId);
  if (groupIndex === -1) return null;
  
  const group = groups[groupIndex];
  
  if (!group.members) return { error: 'No members found' };
  
  const memberIndex = group.members.findIndex(m => m.username === username);
  if (memberIndex === -1) return { error: 'Member not found' };
  
  group.members[memberIndex].role = newRole;
  
  await writeAll(groups);
  return group;
}

export async function removeMember(groupId, username) {
  const groups = await readAll();
  const groupIndex = groups.findIndex(g => g.id === groupId);
  if (groupIndex === -1) return null;
  
  const group = groups[groupIndex];
  
  if (!group.members) return { error: 'No members found' };
  
  // Remove member
  group.members = group.members.filter(m => m.username !== username);
  
  await writeAll(groups);
  return group;
}

export async function addGroupPost(groupId, username, content) {
  const groups = await readAll();
  const groupIndex = groups.findIndex(g => g.id === groupId);
  if (groupIndex === -1) return null;
  
  const group = groups[groupIndex];
  
  // Initialize posts array if it doesn't exist
  if (!group.posts) group.posts = [];
  
  const post = {
    id: genId(),
    author: username,
    content,
    createdAt: new Date().toISOString()
  };
  
  group.posts.push(post);
  
  await writeAll(groups);
  return post;
}

export async function deleteGroupPost(groupId, postId) {
  const groups = await readAll();
  const groupIndex = groups.findIndex(g => g.id === groupId);
  if (groupIndex === -1) return null;
  
  const group = groups[groupIndex];
  
  if (!group.posts) return { error: 'No posts found' };
  
  const postIndex = group.posts.findIndex(p => p.id === postId);
  if (postIndex === -1) return { error: 'Post not found' };
  
  group.posts.splice(postIndex, 1);
  
  await writeAll(groups);
  return group;
}
