// src/controllers/home.controller.js
import { currentUser, forYouPosts, followingPosts } from '../data/mock.js';

// For now, use mock data directly since database is not available
// In production, this would fetch from the database
export const getForYouPosts = async (req, res) => {
  res.render('home', {
    activeTab: 'for-you',
    feed: forYouPosts,
    currentUser,
    activePage: 'home',
  });
};

export const getFollowingPosts = async (req, res) => {
  res.render('home', {
    activeTab: 'following',
    feed: followingPosts,
    currentUser,
    activePage: 'home',
  });
};