import express from 'express';
import { commentMock, exploreTags, currentUser } from '../data/mock.js';

const router = express.Router();

router.get('/explore', (req, res) => {
  const requestedTag = (req.query.tag || 'all').toLowerCase();
  const availableTags = new Set(exploreTags.map((t) => t.slug));
  const tag = availableTags.has(requestedTag) ? requestedTag : 'all';
  const rawQuery = (req.query.q || '').trim();
  const searchQuery = rawQuery.toLowerCase();

  const feed = commentMock.filter((post) => {
    const matchTag = tag === 'all' || post.tags?.some((x) => x.toLowerCase() === tag);
    if (!matchTag) return false;
    if (!searchQuery) return true;
    const searchable = `${post.name} ${post.username} ${post.content} ${(post.tags || []).join(' ')}`.toLowerCase();
    return searchable.includes(searchQuery);
  });

  res.render('explore', {
    feed,
    exploreTags,
    activeTag: tag,
    searchQuery: rawQuery,
    searchQueryEncoded: rawQuery ? encodeURIComponent(rawQuery) : '',
    currentUser,
    activePage: 'explore',
  });
});

export default router;
