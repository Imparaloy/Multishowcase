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

const TAG_LIST = [
  { slug: 'all', label: 'All' },
  ...Object.entries(CATEGORY_MAP).map(([slug, label]) => ({ slug, label }))
];

function normalizeTagSlug(tag) {
  if (typeof tag !== 'string') return 'all';
  const key = tag.trim().toLowerCase();
  if (key === 'all') return 'all';
  return CATEGORY_MAP[key] ? key : 'all';
}

function categoryLabelForSlug(slug) {
  return slug === 'all' ? null : CATEGORY_MAP[slug] || null;
}

function toNumber(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 1) return fallback;
  return parsed;
}

function extractMediaUrls(rawMedia) {
  if (!Array.isArray(rawMedia)) return [];
  return rawMedia
    .map((entry) => {
      if (!entry) return null;
      if (typeof entry === 'string') {
        try {
          const parsed = JSON.parse(entry);
          return parsed?.s3_url || null;
        } catch {
          return null;
        }
      }
      if (typeof entry === 'object') {
        return entry?.s3_url || null;
      }
      return null;
    })
    .filter(Boolean);
}

function formatPostRow(row) {
  const mediaUrls = extractMediaUrls(row.media);
  return {
    id: row.post_id,
    post_id: row.post_id,
    body: row.body || '',
    title: row.title || null,
    category: row.category || null,
    author_id: row.author_id,
    author_username: row.author_username,
    author_display_name: row.author_display_name,
    mediaUrls,
    media: mediaUrls,
    comments: Number(row.comments_count ?? 0),
    likes: Number(row.likes_count ?? 0),
    published_at: row.published_at,
    created_at: row.created_at
  };
}

async function fetchExplorePosts({ tagSlug, searchTerm, limit, offset }) {
  const conditions = [`p.status = 'published'::post_status`];
  const values = [];

  const categoryLabel = categoryLabelForSlug(tagSlug);
  if (categoryLabel) {
    values.push(categoryLabel);
    const idx = values.length;
    conditions.push(`p.category = $${idx}::post_category`);
  }

  if (searchTerm) {
    values.push(`%${searchTerm}%`);
    const idx = values.length;
    conditions.push(
      `(p.title ILIKE $${idx} OR p.body ILIKE $${idx} OR u.username ILIKE $${idx} OR u.display_name ILIKE $${idx})`
    );
  }

  values.push(limit);
  const limitIdx = values.length;
  values.push(offset);
  const offsetIdx = values.length;

  const text = `
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
      COALESCE(pm.media, '[]'::json)        AS media,
      COALESCE(c.comments_count, 0)         AS comments_count,
      COALESCE(l.likes_count, 0)            AS likes_count
    FROM posts p
    JOIN users u ON u.user_id = p.author_id
    LEFT JOIN LATERAL (
      SELECT json_agg(
        jsonb_build_object(
          'post_media_id', media.post_media_id,
          'media_type',    media.media_type,
          'order_index',   media.order_index,
          's3_key',        media.s3_key,
          's3_url',        media.s3_url,
          'filename',      media.original_filename,
          'file_size',     media.file_size,
          'content_type',  media.content_type
        )
        ORDER BY media.order_index NULLS LAST
      ) AS media
      FROM post_media media
      WHERE media.post_id = p.post_id
    ) pm ON true
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS comments_count
      FROM comments c
      WHERE c.post_id = p.post_id
    ) c ON true
    LEFT JOIN LATERAL (
      SELECT COUNT(*) AS likes_count
      FROM likes l
      WHERE l.post_id = p.post_id
    ) l ON true
    WHERE ${conditions.join(' AND ')}
    ORDER BY COALESCE(p.published_at, p.created_at) DESC
    LIMIT $${limitIdx} OFFSET $${offsetIdx}
  `;

  const { rows } = await pool.query(text, values);
  return rows.map(formatPostRow);
}

function renderPostPartial(req, locals) {
  return new Promise((resolve, reject) => {
    req.app.render('components/post', locals, (err, html) => {
      if (err) return reject(err);
      resolve(`<div data-post-id="${locals.id || ''}">${html}</div>`);
    });
  });
}

export const getExplorePage = async (req, res) => {
  try {
    const requestedTag = normalizeTagSlug(req.query.tag);
    const limit = Math.min(toNumber(req.query.limit, DEFAULT_LIMIT), 50);
    const page = Math.max(toNumber(req.query.page, 1), 1);
    const offset = (page - 1) * limit;
    const searchRaw = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const searchTerm = searchRaw.toLowerCase();

    const posts = await fetchExplorePosts({
      tagSlug: requestedTag,
      searchTerm,
      limit,
      offset
    });

    const hasMore = posts.length === limit;

    return res.render('explore', {
      feed: posts,
      tagList: TAG_LIST,
      activeTag: requestedTag,
      searchQuery: searchRaw,
      searchQueryEncoded: searchRaw ? encodeURIComponent(searchRaw) : '',
      page,
      limit,
      hasMore,
      currentUser: res.locals.user || null,
      activePage: 'explore'
    });
  } catch (err) {
    console.error('getExplorePage error:', err);
    return res.status(500).send('Failed to load explore feed');
  }
};

export const getExploreFeed = async (req, res) => {
  try {
    const requestedTag = normalizeTagSlug(req.query.tag);
    const limit = Math.min(toNumber(req.query.limit, DEFAULT_LIMIT), 50);
    const page = Math.max(toNumber(req.query.page, 1), 1);
    const offset = (page - 1) * limit;
    const searchRaw = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const searchTerm = searchRaw.toLowerCase();

    const posts = await fetchExplorePosts({
      tagSlug: requestedTag,
      searchTerm,
      limit,
      offset
    });

    const hasMore = posts.length === limit;
    const nextPage = hasMore ? page + 1 : null;

    const rendered = await Promise.all(
      posts.map((post) =>
        renderPostPartial(req, {
          id: post.id,
          name: post.author_display_name,
          username: post.author_username,
          body: post.body,
          media: post.media,
          comments: post.comments,
          likes: post.likes,
          canDelete: false,
          currentUser: res.locals.user || null
        })
      )
    );

    return res.json({
      success: true,
      items: rendered,
      hasMore,
      nextPage
    });
  } catch (err) {
    console.error('getExploreFeed error:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to load posts'
    });
  }
};
