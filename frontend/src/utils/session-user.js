import pool from '../config/dbconn.js';

const GUEST_VIEWER = {
  displayName: 'Guest',
  username: 'guest',
  email: '',
  groups: []
};

export function fallbackEmailFromSub(sub) {
  if (!sub) return 'user@multishowcase.local';
  return `user-${sub}@multishowcase.local`;
}

function deriveUsername(claims = {}) {
  const payload = claims.payload || {};
  return (
    claims.username ||
    claims['cognito:username'] ||
    payload['cognito:username'] ||
    payload.username ||
    (typeof claims.email === 'string' ? claims.email.split('@')[0] : null) ||
    (claims.sub ? `user_${String(claims.sub).slice(0, 8)}` : null)
  );
}

function deriveDisplayName(claims = {}, username) {
  const payload = claims.payload || {};
  return (
    claims.name ||
    payload.name ||
    payload['custom:display_name'] ||
    username ||
    null
  );
}

function deriveEmail(claims = {}) {
  const payload = claims.payload || {};
  return (
    claims.email ||
    payload.email ||
    fallbackEmailFromSub(claims.sub)
  );
}

export async function ensureUserRecord(claims = {}, { client } = {}) {
  if (!claims?.sub) {
    throw new Error('Missing Cognito subject on request user');
  }

  const executor = client || pool;
  const username = deriveUsername(claims);
  const displayName = deriveDisplayName(claims, username);
  const email = deriveEmail(claims);

  const { rows } = await executor.query(
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

async function findExistingUser(claims = {}, executor = pool) {
  if (claims.user_id) {
    const { rows } = await executor.query('SELECT * FROM users WHERE user_id = $1', [claims.user_id]);
    if (rows[0]) return rows[0];
  }

  if (claims.sub) {
    const { rows } = await executor.query('SELECT * FROM users WHERE cognito_sub = $1', [claims.sub]);
    if (rows[0]) return rows[0];
  }

  return null;
}

function mergeRecordWithClaims(record, claims = {}) {
  if (!record) return null;

  const payload = claims.payload || {};
  const groups = claims.groups || payload['cognito:groups'] || [];
  const displayName = record.display_name || deriveDisplayName(claims, record.username);
  const email = record.email || deriveEmail(claims);
  const bio = record.bio ?? payload['custom:bio'] ?? '';

  return {
    ...record,
    sub: claims.sub || record.cognito_sub,
    cognito_sub: record.cognito_sub || claims.sub || null,
    username: record.username,
    display_name: record.display_name || displayName || record.username,
    displayName: displayName || record.username,
    email,
    bio,
    groups,
    payload,
    rawClaims: claims
  };
}

function fallbackRecordFromClaims(claims = {}) {
  const username = deriveUsername(claims);
  if (!username) return null;

  const displayName = deriveDisplayName(claims, username) || username;
  const email = deriveEmail(claims);
  const bio = claims.payload?.['custom:bio'] || '';

  return {
    user_id: null,
    cognito_sub: claims.sub || null,
    username,
    display_name: displayName,
    email,
    bio,
    created_at: null,
    updated_at: null
  };
}

export async function loadCurrentUser(req, { client, forceReload = false, res } = {}) {
  if (!req) {
    throw new Error('loadCurrentUser requires a request object');
  }

  if (!forceReload && req.currentUser) {
    if (res) {
      res.locals.user = req.currentUser;
      res.locals.currentUser = req.currentUser;
    }
    return req.currentUser;
  }

  const claims = req.user || {};
  if (!claims.sub && !claims.user_id) {
    return null;
  }

  const executor = client || pool;
  let record = await findExistingUser(claims, executor);

  if (!record && claims.sub) {
    try {
      record = await ensureUserRecord(claims, { client: executor });
    } catch (err) {
      console.error('Failed to ensure user record:', err);
      record = fallbackRecordFromClaims(claims);
    }
  }

  if (!record) {
    record = fallbackRecordFromClaims(claims);
  }

  const hydrated = mergeRecordWithClaims(record, claims);
  if (!hydrated) {
    return null;
  }

  req.currentUser = hydrated;
  if (res) {
    res.locals.user = hydrated;
    res.locals.currentUser = hydrated;
  }

  return hydrated;
}

export function buildViewUser(req, userRecord = null) {
  const claims = req?.user || {};
  const payload = claims.payload || {};
  const record = userRecord || req?.currentUser || null;

  const username =
    record?.username ||
    claims.username ||
    claims['cognito:username'] ||
    payload['cognito:username'] ||
    (typeof claims.email === 'string' ? claims.email.split('@')[0] : null);

  if (!username) {
    return {
      me: {
        name: GUEST_VIEWER.displayName,
        username: GUEST_VIEWER.username,
        email: '',
        bio: ''
      },
      viewer: { ...GUEST_VIEWER }
    };
  }

  const displayName =
    record?.displayName ||
    record?.display_name ||
    deriveDisplayName(claims, username) ||
    username;

  const email =
    record?.email ||
    claims.email ||
    payload.email ||
    fallbackEmailFromSub(claims.sub);

  const bio = record?.bio ?? payload['custom:bio'] ?? '';
  const groups = record?.groups || claims.groups || payload['cognito:groups'] || [];

  return {
    me: {
      name: displayName,
      username,
      email,
      bio
    },
    viewer: {
      displayName,
      username,
      email,
      groups,
      user_id: record?.user_id || null
    }
  };
}

export const guestView = {
  me: {
    name: GUEST_VIEWER.displayName,
    username: GUEST_VIEWER.username,
    email: '',
    bio: ''
  },
  viewer: { ...GUEST_VIEWER }
};
