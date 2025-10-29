// src/middlewares/authenticate.js
import { CognitoJwtVerifier } from 'aws-jwt-verify';
import dotenv from 'dotenv';
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
  console.warn('Cognito environment variables not set. Authentication will be bypassed for development.');
}

const devMockUser = {
  sub: 'e99f09a7-dd88-49d5-b1c8-1daf80c2d7b2',
  username: 'Polor_inwza',
  email: 'polor@example.com',
  groups: ['admin'],
  payload: {
    name: 'Polor',
    'custom:bio': 'This is a test bio for development',
  },
};

function extractToken(req) {
  // Prefer ID token for richer profile claims (name, email, custom attributes)
  if (req.cookies?.id_token) return req.cookies.id_token;
  if (req.cookies?.access_token) return req.cookies.access_token;
  const header = req.headers.authorization || req.headers.Authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7).trim() : null;
}

function buildUserFromPayload(payload) {
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
    return await accessVerifier.verify(token);
  } catch (err) {
    return await idVerifier.verify(token);
  }
}

async function authenticateCognitoJWT(req, res, next) {
  // In development, return mock user when verifiers are not configured
  if (!accessVerifier || !idVerifier) {
    req.user = devMockUser;
    res.locals.user = req.user;
    return next();
  }

  try {
    const token = extractToken(req);
    if (!token) {
      return res.status(401).json({ message: 'No token provided' });
    }

    const payload = await verifyEither(token);
    req.user = buildUserFromPayload(payload);
    res.locals.user = req.user;
    return next();
  } catch (err) {
    console.error('JWT verify failed:', err?.message || err);
    return res.status(401).json({ message: 'Invalid token' });
  }
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
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

  if (!accessVerifier || !idVerifier) {
    if (process.env.NODE_ENV !== 'production') {
      res.locals.user = devMockUser;
      req.user = devMockUser;
    }
    return next();
  }

  try {
    const token = extractToken(req);
    if (!token) return next();
    const payload = await verifyEither(token);
    req.user = buildUserFromPayload(payload);
    res.locals.user = req.user;
  } catch (err) {
    // Swallow token errors for attach-only usage
  }

  return next();
}

export { authenticateCognitoJWT, requireAuth, requireRole, attachUserToLocals };
