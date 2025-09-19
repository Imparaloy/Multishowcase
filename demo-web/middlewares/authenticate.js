const { CognitoJwtVerifier } = require('aws-jwt-verify');

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
  if (req.cookies?.access_token) return req.cookies.access_token; // แนะนำให้เก็บไว้ในคุกกี้
  const h = req.headers.authorization || req.headers.Authorization || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : null;
}

async function verifyEither(token) {
  try { return await accessVerifier.verify(token); }
  catch { return await idVerifier.verify(token); }
}

async function authenticateCognitoJWT(req, res, next) {
  const token = extractToken(req);
  if (!token) return res.status(401).json({ message: 'Missing token' });
  try {
    req.user = await verifyEither(token); // claims จาก Cognito
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired token', error: err.message });
  }
}

async function requireAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) return res.redirect('/login?err=signin_required');
  try {
    req.user = await verifyEither(token);
    next();
  } catch {
    return res.redirect('/login?err=invalid_token');
  }
}

function requireRole(role) {
  return (req, res, next) => {
    const groups = req.user?.['cognito:groups'] || [];
    if (!groups.includes(role)) return res.status(403).send('Forbidden');
    next();
  };
}

module.exports = { authenticateCognitoJWT, requireAuth, requireRole };
