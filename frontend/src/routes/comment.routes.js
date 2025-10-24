import express from 'express';
import { forYouPosts, followingPosts, commentsByPost, currentUser } from '../data/mock.js';

const router = express.Router();

router.get('/comment', (req, res) => {
  const id = parseInt(req.query.id, 10);
  const allPosts = [...forYouPosts, ...followingPosts];
  const post = allPosts.find((p) => p.id === id) || allPosts[0];
  const comments = commentsByPost[post?.id] || [];

  res.render('comment', {
    post,
    comments,
    currentUser,
    activePage: null,
  });
});

export default router;
