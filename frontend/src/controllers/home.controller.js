// home.controller.js
import pool from '../config/dbconn.js';

// หา user ปัจจุบันจาก JWT
async function loadCurrentUser(req) {
  const claims = req.user || {};
  if (claims.user_id) {
    const { rows } = await pool.query('SELECT * FROM users WHERE user_id = $1', [claims.user_id]);
    return rows[0] || null;
  }
  if (claims.sub) {
    const { rows } = await pool.query('SELECT * FROM users WHERE cognito_sub = $1', [claims.sub]);
    return rows[0] || null;
  }
  return null;
}

const BASE_FEED_SQL = `
SELECT
  p.post_id,
  p.title,
  p.body,
  p.category,
  p.status,
  p.published_at,
  p.created_at,
  u.user_id       AS author_id,
  u.username      AS author_username,
  COALESCE(u.display_name, u.username) AS author_display_name,
  COALESCE(
    json_agg(
        jsonb_build_object(
        'media_id',     pm.post_media_id,
        'media_type',   pm.media_type,
        'order_index',  pm.order_index
      )
      ORDER BY pm.order_index NULLS LAST
    ) FILTER (WHERE pm.media_id IS NOT NULL),
    '[]'
  ) AS media
FROM posts p
JOIN users u ON u.user_id = p.author_id
LEFT JOIN post_media pm ON pm.post_id = p.post_id
WHERE p.status = 'published'::post_status
GROUP BY
  p.post_id, p.title, p.body, p.category, p.status, p.published_at, p.created_at,
  u.user_id, u.username, u.display_name
ORDER BY COALESCE(p.published_at, p.created_at) DESC
LIMIT $1 OFFSET $2
`;

export const getForYouPosts = async (req, res) => {
  try {
    const currentUser = await loadCurrentUser(req);
    if (!currentUser) return res.redirect('/login');

    const limit = Math.min(parseInt(req.query.limit || '10', 10), 50);
    const page  = Math.max(parseInt(req.query.page  || '1', 10), 1);
    const offset = (page - 1) * limit;

    const { rows } = await pool.query(BASE_FEED_SQL, [limit, offset]);

    return res.render('home', {
      activeTab: 'foryou',
      feed: rows,
      currentUser,
      activePage: 'home',
      page,
      limit,
      hasMore: rows.length === limit
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
    const { rows } = await pool.query(BASE_FEED_SQL, [limit, offset]);

    return res.render('home', {
      activeTab: 'following',
      feed: rows,
      currentUser,
      activePage: 'home',
      page,
      limit,
      hasMore: rows.length === limit
    });
  } catch (err) {
    console.error('getFollowingPosts error:', err);
    return res.status(500).send('Database error');
  }
};
