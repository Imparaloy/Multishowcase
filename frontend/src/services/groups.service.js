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

export async function addGroup({ name, description, createdBy }) {
  const groups = await readAll();
  const now = new Date().toISOString();
  const group = {
    id: genId(),
    name: String(name || '').trim(),
    description: String(description || '').trim(),
    createdAt: now,
    createdBy: createdBy || null,
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
