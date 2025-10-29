// src/controllers/home.controller.js
import { currentUser, forYouPosts, followingPosts } from '../data/mock.js';
import pool from '../config/dbconn.js';

// For now, use mock data directly since database is not available
// In production, this would fetch from the database
export const getForYouPosts = async (req, res) => {
  try {
    // สมมติว่ามี user_id ใน req.user (เช่น มาจาก middleware authentication)
    const userId = req.user?.user_id;
    if (!userId) {
      return res.status(401).send('Not authenticated');
    }

    // ดึงข้อมูล user ปัจจุบันจากฐานข้อมูล
    const userResult = await pool.query('SELECT * FROM users WHERE user_id = $1', [userId]);
    const user = userResult.rows[0];

    res.render('home', {
      activeTab: 'for-you',
      feed: forYouPosts,
      currentUser: user, // ส่ง user ปัจจุบันไปที่ EJS
      activePage: 'home',
    });
  } catch (err) {
    res.status(500).send('Database error');
  }
};

export const getFollowingPosts = async (req, res) => {
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      return res.status(401).send('Not authenticated');
    }

    const userResult = await pool.query('SELECT * FROM users WHERE user_id = $1', [userId]);
    const user = userResult.rows[0];

    res.render('home', {
      activeTab: 'following',
      feed: followingPosts,
      currentUser: user,
      activePage: 'home',
    });
  } catch (err) {
    res.status(500).send('Database error');
  }
};