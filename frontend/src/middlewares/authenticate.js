// src/middlewares/authenticate.js
import { CognitoJwtVerifier } from 'aws-jwt-verify';

const accessVerifier = CognitoJwtVerifier.create({
  userPoolId: process.env.COGNITO_USER_POOL_ID,
  clientId: process.env.COGNITO_CLIENT_ID,
  tokenUse: 'access',
});
const idVerifier = CognitoJwtVerifier.create({
  userPoolId: process.env.COGNITO_USER_POOL_ID,
  clientId: process.env.COGNITO_CLIENT_ID,
  tokenUse: 'id',
});

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
