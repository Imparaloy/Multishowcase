import { getUnifiedFeed } from './feed.controller.js';

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

async function fetchExplorePosts({ tagSlug, searchTerm, limit, offset, viewerId }) {
  const category = categoryLabelForSlug(tagSlug);
  
  return await getUnifiedFeed({
    limit,
    offset,
    category: tagSlug === 'all' ? null : tagSlug,
    searchTerm,
    viewerId,
    statuses: viewerId ? ['published', 'unpublish'] : ['published']
  });
}

export function renderPostPartial(req, locals) {
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

    // Get viewer ID from authenticated user
    const viewerId = res.locals.user?.user_id || null;

    const posts = await fetchExplorePosts({
      tagSlug: requestedTag,
      searchTerm,
      limit,
      offset,
      viewerId
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

    // Get viewer ID from authenticated user
    const viewerId = res.locals.user?.user_id || null;

    const posts = await fetchExplorePosts({
      tagSlug: requestedTag,
      searchTerm,
      limit,
      offset,
      viewerId
    });

    const hasMore = posts.length === limit;
    const nextPage = hasMore ? page + 1 : null;

    const rendered = await Promise.all(
      posts.map((post) =>
        renderPostPartial(req, {
          id: post.post_id || post.id,
          name: post.author_display_name || post.name,
          username: post.author_username || post.username,
          body: post.body || post.content || '',
          media: Array.isArray(post.media) ? post.media : [],
          primaryMedia: post.primaryMedia || (Array.isArray(post.media) && post.media.length ? post.media[0] : null),
          comments: Number(post.comments ?? 0),
          likes: Number(post.likes ?? 0),
          currentUser: res.locals.user || null,
          isFollowing: post.isFollowing || false
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
