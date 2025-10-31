// src/middlewares/authenticate.js
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import dotenv from 'dotenv';
import { loadCurrentUser } from '../utils/session-user.js';
dotenv.config();

const userPoolId = process.env.COGNITO_USER_POOL_ID;
const clientId = process.env.COGNITO_CLIENT_ID;

let accessVerifier = null;
let idVerifier = null;
console.log("Cognito User Pool ID:", userPoolId);
console.log("Cognito Client ID:", clientId);

if (userPoolId && clientId) {
  accessVerifier = CognitoJwtVerifier.create({
    userPoolId,
    clientId,
    tokenUse: 'access',
  });
  idVerifier = CognitoJwtVerifier.create({
    userPoolId,
    clientId,
    tokenUse: 'id',
  });
} else {
  console.error('Cognito environment variables not set. Authentication is required.');
}

function extractToken(req) {
  // Prefer ID token for richer profile claims (name, email, custom attributes)
  console.log('Extracting token from request...');
  console.log('Cookies:', req.cookies);
  console.log('Authorization header:', req.headers.authorization || req.headers.Authorization);
  
  if (req.cookies?.id_token) {
    console.log('Found ID token in cookies');
    return req.cookies.id_token;
  }
  if (req.cookies?.access_token) {
    console.log('Found access token in cookies');
    return req.cookies.access_token;
  }
  const header = req.headers.authorization || req.headers.Authorization || '';
  if (header.startsWith('Bearer ')) {
    console.log('Found token in Authorization header');
    return header.slice(7).trim();
  }
  console.log('No token found');
  return null;
}

// Helper: decide if this request expects an HTML page (vs JSON/API)
function wantsHTML(req) {
  const accept = req.headers.accept || '';
  return accept.includes('text/html');
}

function buildUserFromPayload(payload) {
  console.log('Building user from payload, sub:', payload.sub);
  return {
    sub: payload.sub,
    username: payload['cognito:username'] || payload.username,
    email: payload.email,
    groups: payload['cognito:groups'] || [],
    payload,
  };
}

async function verifyEither(token) {
  if (!token) throw new Error('No token provided');
  if (!accessVerifier || !idVerifier) throw new Error('Verifiers not configured');

  try {
    console.log('Trying to verify as access token...');
    const result = await accessVerifier.verify(token);
    console.log('Access token verified successfully');
    return result;
  } catch (err) {
    console.log('Access token verification failed, trying ID token...', err.message);
    try {
      const result = await idVerifier.verify(token);
      console.log('ID token verified successfully');
      return result;
    } catch (idErr) {
      console.error('ID token verification also failed:', idErr.message);
      throw idErr;
    }
  }
}

async function authenticateCognitoJWT(req, res, next) {
  console.log('authenticateCognitoJWT called');

  if (isAlbHealthCheck(req)) {
    req.user  = { username: 'alb-healthcheck', groups: [] };
    res.locals.user = req.user;
    return next();
  }

  // Check if verifiers are configured
  if (!accessVerifier || !idVerifier) {
    console.error('Authentication verifiers not configured');
    // Redirect to login for page requests, 401 JSON for API requests
    if (wantsHTML(req)) {
      const nextUrl = encodeURIComponent(req.originalUrl || '/');
      return res.redirect(302, `/login?next=${nextUrl}`);
    }
    return res.status(401).json({ message: 'Authentication not configured' });
  }

  try {
    const token = extractToken(req);
    if (!token) {
      console.log('No token found in request');
      // Redirect to login for page requests, 401 JSON for API requests
      if (wantsHTML(req)) {
        const nextUrl = encodeURIComponent(req.originalUrl || '/');
        return res.redirect(302, `/login?next=${nextUrl}`);
      }
      return res.status(401).json({ message: 'No token provided' });
    }

    const payload = await verifyEither(token);
    console.log('JWT payload:', JSON.stringify(payload, null, 2));
    req.user = buildUserFromPayload(payload);
    console.log('Built user object:', JSON.stringify(req.user, null, 2));
    await loadCurrentUser(req, { res });
    return next();
  } catch (err) {
    console.error('JWT verify failed:', err?.message || err);
    if (wantsHTML(req)) {
      const nextUrl = encodeURIComponent(req.originalUrl || '/');
      return res.redirect(302, `/login?next=${nextUrl}`);
    }
    return res.status(401).json({ message: 'Invalid token' });
  }
}

function requireAuth(req, res, next) {
  console.log('requireAuth called, req.user:', req.user ? 'exists' : 'null');
  if (!req.user) {
    console.log('No user found in request, redirecting to login');
    if (wantsHTML(req)) {
      const nextUrl = encodeURIComponent(req.originalUrl || '/');
      return res.redirect(302, `/login?next=${nextUrl}`);
    }
    return res.status(401).json({ message: 'Unauthorized' });
  }
  console.log('User found, proceeding to next middleware');
  return next();
}

function requireRole(role) {
  return (req, res, next) => {
    const groups = req.user?.groups || [];
    if (!groups.includes(role)) {
      return res.status(403).json({ message: 'Forbidden' });
    }
    return next();
  };
}

async function attachUserToLocals(req, res, next) {
  res.locals.user = null;

  // Check if verifiers are configured
  if (!accessVerifier || !idVerifier) {
    console.error('Authentication verifiers not configured');
    return next();
  }

  try {
    const token = extractToken(req);
    if (!token) return next();
    const payload = await verifyEither(token);
    console.log('attachUserToLocals - JWT payload:', JSON.stringify(payload, null, 2));
    req.user = buildUserFromPayload(payload);
    console.log('attachUserToLocals - Built user object:', JSON.stringify(req.user, null, 2));
    await loadCurrentUser(req, { res });
  } catch (err) {
    console.error('attachUserToLocals - Error verifying token:', err);
    // Swallow token errors for attach-only usage
  }

  return next();
}

function isAlbHealthCheck(req) {
  const ua = (req.headers['user-agent'] || '').toLowerCase();
  return ua.startsWith('elb-healthchecker');
}

export { authenticateCognitoJWT, requireAuth, requireRole, attachUserToLocals };
