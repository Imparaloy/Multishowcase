import express from 'express';
import { currentUser, forYouPosts, followingPosts } from '../data/mock.js';

const router = express.Router();

// Home (For you)
router.get('/', (req, res) => {
  res.render('home', {
    activeTab: 'for-you',
    feed: forYouPosts,
    currentUser,
    activePage: 'home',
  });
});

// Following
router.get('/following', (req, res) => {
  res.render('home', {
    activeTab: 'following',
    feed: followingPosts,
    currentUser,
    activePage: 'home',
  });
});

export default router;
