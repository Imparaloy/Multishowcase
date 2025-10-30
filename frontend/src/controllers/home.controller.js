// home.controller.js
import pool from '../config/dbconn.js';
import { getUnifiedFeed } from './feed.controller.js';

function fallbackEmailFromSub(sub) {
  if (!sub) return 'user@multishowcase.local';
  return `user-${sub}@multishowcase.local`;
}

async function ensureUserRecordFromClaims(claims = {}) {
  if (!claims?.sub) return null;

  const payload = claims.payload || {};

  const username =
    claims.username ||
    claims['cognito:username'] ||
    payload['cognito:username'] ||
    payload.username ||
    claims.email?.split('@')[0] ||
    `user_${claims.sub.slice(0, 8)}`;

  const displayName =
    claims.name ||
    payload.name ||
    payload['custom:display_name'] ||
    username;

  const email =
    claims.email ||
    payload.email ||
    fallbackEmailFromSub(claims.sub);

  const { rows } = await pool.query(
    `INSERT INTO users (cognito_sub, username, display_name, email)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (cognito_sub) DO UPDATE
       SET username = EXCLUDED.username,
           display_name = EXCLUDED.display_name,
           email = EXCLUDED.email,
           updated_at = NOW()
     RETURNING *`,
    [claims.sub, username, displayName, email]
  );

  return rows[0] || null;
}

// หา user ปัจจุบันจาก JWT
async function loadCurrentUser(req) {
  const claims = req.user || {};
  let userRecord = null;
  
  if (claims.user_id) {
    const { rows } = await pool.query('SELECT * FROM users WHERE user_id = $1', [claims.user_id]);
    userRecord = rows[0] || null;
  }
  if (claims.sub && !userRecord) {
    const { rows } = await pool.query('SELECT * FROM users WHERE cognito_sub = $1', [claims.sub]);
    userRecord = rows[0] || null;
  }

  if (!userRecord && claims.sub) {
    try {
      userRecord = await ensureUserRecordFromClaims(claims);
    } catch (err) {
      console.error('Failed to upsert user from claims:', err);
    }
  }
  
  if (userRecord) {
    const payload = claims.payload || {};
    // Add groups from JWT token to user record
    userRecord.groups = claims.groups || payload['cognito:groups'] || [];
  }
  
  return userRecord;
}

export const getForYouPosts = async (req, res) => {
  try {
    const currentUser = await loadCurrentUser(req);
    if (!currentUser) return res.redirect('/login');

    const limit = Math.min(parseInt(req.query.limit || '10', 10), 50);
    const page  = Math.max(parseInt(req.query.page  || '1', 10), 1);
    const offset = (page - 1) * limit;

    const feed = await getUnifiedFeed({ limit, offset });
    
    if (feed.length) {
      console.log('Home feed first media sample:', feed[0].media);
    }
    
    return res.render('home', {
      activeTab: 'foryou',
      feed,
      currentUser,
      activePage: 'home',
      page,
      limit,
      hasMore: feed.length === limit
    });
  } catch (err) {
    console.error('getForYouPosts error:', err);
    return res.status(500).send('Database error');
  }
};

export const getFollowingPosts = async (req, res) => {
  try {
    const currentUser = await loadCurrentUser(req);
    if (!currentUser) return res.redirect('/login');

    const limit = Math.min(parseInt(req.query.limit || '10', 10), 50);
    const page  = Math.max(parseInt(req.query.page  || '1', 10), 1);
    const offset = (page - 1) * limit;

    // TODO: ถ้ามีตาราง follows ให้เปลี่ยน WHERE ให้เหลือเฉพาะ author ที่ currentUser ติดตาม
    const feed = await getUnifiedFeed({ limit, offset });
    
    if (feed.length) {
      console.log('Following feed first media sample:', feed[0].media);
    }
    
    return res.render('home', {
      activeTab: 'following',
      feed,
      currentUser,
      activePage: 'home',
      page,
      limit,
      hasMore: feed.length === limit
    });
  } catch (err) {
    console.error('getFollowingPosts error:', err);
    return res.status(500).send('Database error');
  }
};
