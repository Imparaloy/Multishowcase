// feed.controller.js - Unified feed controller for all pages
import pool from '../config/dbconn.js';

const DEFAULT_LIMIT = 10;

const CATEGORY_MAP = {
  '2d-art': '2D art',
  '3d-model': '3D model',
  'graphic-design': 'Graphic Design',
  'animation': 'Animation',
  'game': 'Game',
  'ux-ui': 'UX/UI design'
};

function normalizeMediaEntries(rawMedia) {
  if (!rawMedia) return [];

  const toObject = (entry) => {
    if (!entry) return null;
    if (typeof entry === 'object') return entry;
    if (typeof entry === 'string') {
      try {
        const parsed = JSON.parse(entry);
        return typeof parsed === 'object' && parsed !== null ? parsed : null;
      } catch {
        return entry.startsWith('http') ? { url: entry } : null;
      }
    }
    return null;
  };

  if (Array.isArray(rawMedia)) {
    return rawMedia.map(toObject).filter(Boolean);
  }

  if (typeof rawMedia === 'string') {
    try {
      const parsed = JSON.parse(rawMedia);
      if (Array.isArray(parsed)) {
        return parsed.map(toObject).filter(Boolean);
      }
      const single = toObject(parsed);
      return single ? [single] : [];
    } catch (err) {
      console.warn('Failed to parse media JSON:', err.message);
      return [];
    }
  }

  if (typeof rawMedia === 'object') {
    const objectEntry = toObject(rawMedia);
    return objectEntry ? [objectEntry] : [];
  }

  return [];
}

function sanitizeMediaUrl(url) {
  if (typeof url !== 'string' || !url.trim()) return null;

  const trimmed = url.trim();

  try {
    // Attempt to construct a URL object to normalize things like spaces
    const normalized = new URL(trimmed);
    // Rebuild to ensure proper encoding without mutating the origin
    return normalized.toString();
  } catch {
    try {
      return encodeURI(trimmed);
    } catch {
      return null;
    }
  }
}

function extractMediaUrls(mediaEntries = []) {
  return mediaEntries
    .map((entry) => {
      if (!entry) return null;
      if (typeof entry === 'string') {
        return entry.startsWith('http') ? sanitizeMediaUrl(entry) : null;
      }
      if (typeof entry === 'object') {
        const rawUrl = entry.s3_url || entry.url || entry.thumbnail_url || null;
        return sanitizeMediaUrl(rawUrl);
      }
      return null;
    })
    .filter(Boolean);
}

/**
 * Get unified feed for all pages
 * @param {Object} options - Query options
 * @returns {Promise<Array>} Array of posts
 */
export const getUnifiedFeed = async (options = {}) => {
  const {
    limit = DEFAULT_LIMIT,
    offset = 0,
    category = null,
    searchTerm = null,
    authorId = null,
    groupId = null,
    viewerId = null,
    excludeGroupPosts = false // New option to exclude group posts from main feed
  } = options;

  // Function to check if viewer is following the author
  async function isFollowing(followerId, followingId) {
    if (!followerId || !followingId) return false;
    
    try {
      const client = await pool.connect();
      const result = await client.query(
        'SELECT * FROM follows WHERE follower_id = $1 AND following_id = $2',
        [followerId, followingId]
      );
      client.release();
      return result.rows.length > 0;
    } catch (error) {
      console.error("Error checking follow status:", error);
      return false;
    }
  }

  const conditions = [];
  const values = [];

  // Add category filter
  if (category && CATEGORY_MAP[category]) {
    values.push(CATEGORY_MAP[category]);
    const idx = values.length;
    conditions.push(`p.category = $${idx}::post_category`);
  }

  // Add search filter
  if (searchTerm) {
    values.push(`%${searchTerm}%`);
    const idx = values.length;
    conditions.push(
      `(p.title ILIKE $${idx} OR p.body ILIKE $${idx} OR u.username ILIKE $${idx} OR u.display_name ILIKE $${idx})`
    );
  }

  // Add author filter
  if (authorId) {
    values.push(authorId);
    const idx = values.length;
    conditions.push(`p.author_id = $${idx}`);
  }

  // Add group filter
  if (groupId) {
    values.push(groupId);
    const idx = values.length;
    conditions.push(`p.group_id = $${idx}`);
  } else if (excludeGroupPosts) {
    // Exclude group posts from main feed
    conditions.push(`p.group_id IS NULL`);
  }

  values.push(limit);
  const limitIdx = values.length;
  values.push(offset);
  const offsetIdx = values.length;

  const query = `
    SELECT
      p.post_id,
      p.title,
      p.body,
      p.category,
      p.created_at,
      u.user_id       AS author_id,
      u.username      AS author_username,
      COALESCE(u.display_name, u.username) AS author_display_name,
      COALESCE(media.media, '[]'::json)      AS media,
      COALESCE(c.comments_count, 0)         AS comments_count,
      COALESCE(l.likes_count, 0)            AS likes_count
    FROM posts p
    JOIN users u ON u.user_id = p.author_id
    LEFT JOIN LATERAL (
      SELECT json_agg(
               jsonb_build_object(
                 'media_id',     pm.post_media_id,
                 'media_type',   pm.media_type,
                 'order_index',  pm.order_index,
                 's3_key',       pm.s3_key,
                 's3_url',       pm.s3_url,
                 'filename',     pm.original_filename,
                 'file_size',    pm.file_size,
                 'content_type', pm.content_type
               ) ORDER BY pm.order_index NULLS LAST
             ) FILTER (WHERE pm.post_media_id IS NOT NULL) AS media
      FROM post_media pm
      WHERE pm.post_id = p.post_id
    ) media ON true
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS comments_count
      FROM comments c
      WHERE c.post_id = p.post_id
    ) c ON true
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS likes_count
      FROM likes l
      WHERE l.post_id = p.post_id
    ) l ON true
  WHERE ${conditions.length ? conditions.join(' AND ') : 'TRUE'}
    ORDER BY p.created_at DESC
    LIMIT $${limitIdx} OFFSET $${offsetIdx}
  `;

  const { rows } = await pool.query(query, values);

  // Process rows and add follow status
  const processedPosts = await Promise.all(rows.map(async (row) => {
    const mediaEntries = normalizeMediaEntries(row.media);
    const mediaUrls = extractMediaUrls(mediaEntries);
    const primaryMedia = mediaUrls.length ? mediaUrls[0] : null;
    const body = row.body || '';
    
    // Check if viewer is following the post author
    const isFollowingAuthor = viewerId ? await isFollowing(viewerId, row.author_id) : false;

    return {
      ...row,
      id: row.post_id,
      post_id: row.post_id,
      body,
      content: body,
      media: mediaUrls,
      mediaUrls,
      mediaMetadata: mediaEntries,
      primaryMedia,
      comments: Number(row.comments_count ?? 0),
      likes: Number(row.likes_count ?? 0),
      isFollowing: isFollowingAuthor
    };
  }));

  return processedPosts;
};