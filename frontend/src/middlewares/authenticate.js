// src/middlewares/authenticate.js
import { CognitoJwtVerifier } from 'aws-jwt-verify';

// Check if required environment variables are set
const userPoolId = process.env.COGNITO_USER_POOL_ID;
const clientId = process.env.COGNITO_CLIENT_ID;

let accessVerifier, idVerifier;

if (userPoolId && clientId) {
  accessVerifier = CognitoJwtVerifier.create({
    userPoolId: userPoolId,
    clientId: clientId,
    tokenUse: 'access',
  });
  idVerifier = CognitoJwtVerifier.create({
    userPoolId: userPoolId,
    clientId: clientId,
    tokenUse: 'id',
  });
} else {
  console.warn('Cognito environment variables not set. Authentication will be bypassed for development.');
}

function extractToken(req) {
  if (req.cookies?.access_token) return req.cookies.access_token;
  const h = req.headers.authorization || req.headers.Authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : null;
}

async function verifyEither(token) {
  try { return await accessVerifier.verify(token); }
  catch { return await idVerifier.verify(token); }
}

async function authenticateCognitoJWT(req, res, next) {
  // If verifiers are not available (missing env vars), use mock user for development
  if (!accessVerifier || !idVerifier) {
    req.user = {
      sub: 'mock-sub',
      username: 'Polor_inwza',
      email: 'polor@example.com',
      groups: ['admin'],
      payload: {
        name: 'Polor',
        'custom:bio': 'This is a test bio for development'
      }
    };
    return next();
  }

  try {
    const token = extractToken(req);
    if (!token) return res.status(401).json({ message: 'No token' });
    const payload = await verifyEither(token);
    req.user = {
      sub: payload.sub,
      username: payload['cognito:username'] || payload['username'],
      email: payload.email,
      groups: payload['cognito:groups'] || [],
      payload,
    };
    next();
  } catch (err) {
    console.error('JWT verify failed:', err?.message);
    return res.status(401).json({ message: 'Invalid token' });
  }
}

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ message: 'Unauthorized' });
  next();
}

function requireRole(role) {
  return (req, res, next) => {
    const groups = req.user?.groups || [];
    if (!groups.includes(role)) return res.status(403).json({ message: 'Forbidden' });
    next();
  };
}

export { authenticateCognitoJWT, requireAuth, requireRole };
