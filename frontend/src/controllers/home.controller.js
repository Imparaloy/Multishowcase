// src/controllers/home.controller.js
import { currentUser, forYouPosts, followingPosts } from '../data/mock.js';
import pool from '../config/dbconn.js';

// For now, use mock data directly since database is not available
// In production, this would fetch from the database
export const getForYouPosts = async (req, res) => {
  try {
    const claims = req.user || {};
    let user = null;

    if (claims.user_id) {
      const { rows } = await pool.query('SELECT * FROM users WHERE user_id = $1', [claims.user_id]);
      user = rows[0] || null;
    } else if (claims.sub) {
      // เผื่อใช้ Cognito sub map กับตาราง users.cognito_sub
      const { rows } = await pool.query('SELECT * FROM users WHERE cognito_sub = $1', [claims.sub]);
      user = rows[0] || null;
    }

    if (!user) {
      // ยังไม่มี user ใน DB หรือยังไม่ได้ login จริง ๆ
      return res.redirect('/login');
    }

    // TODO: ดึง feed จริงจาก DB ทีหลัง ตอนนี้ส่ง mock/feed ที่คุณมีอยู่ก็ได้
    return res.render('home', {
      activeTab: 'foryou',
      feed: [],            // หรือ forYouPosts (mock) ของคุณ
      currentUser: user,
      activePage: 'home',
    });
  } catch (err) {
    console.error('getForYouPosts error:', err);
    return res.status(500).send('Database error');
  }
};


export const getFollowingPosts = async (req, res) => {
  try {
    const userId = req.user?.user_id;

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