// home.controller.js
import { getUnifiedFeed } from './feed.controller.js';
import { loadCurrentUser } from '../utils/session-user.js';

export const getForYouPosts = async (req, res) => {
  try {
    const currentUser = await loadCurrentUser(req, { res });
    if (!currentUser) return res.redirect('/login');

    const limit = Math.min(parseInt(req.query.limit || '10', 10), 50);
    const page  = Math.max(parseInt(req.query.page  || '1', 10), 1);
    const offset = (page - 1) * limit;

    const viewerId = currentUser?.user_id || null;
    const feed = await getUnifiedFeed({
      limit,
      offset,
      viewerId,
      statuses: viewerId ? ['published', 'unpublish'] : ['published'],
      excludeGroupPosts: true // Exclude group posts from main feed
    });
    
    if (feed.length) {
      console.log('Home feed first media sample:', feed[0].media);
    }
    
    return res.render('home', {
      activeTab: 'foryou',
      feed,
      currentUser,
      activePage: 'home',
      page,
      limit,
      hasMore: feed.length === limit
    });
  } catch (err) {
    console.error('getForYouPosts error:', err);
    return res.status(500).send('Database error');
  }
};

export const getFollowingPosts = async (req, res) => {
  try {
    const currentUser = await loadCurrentUser(req, { res });
    if (!currentUser) return res.redirect('/login');

    const limit = Math.min(parseInt(req.query.limit || '10', 10), 50);
    const page  = Math.max(parseInt(req.query.page  || '1', 10), 1);
    const offset = (page - 1) * limit;

    // TODO: ถ้ามีตาราง follows ให้เปลี่ยน WHERE ให้เหลือเฉพาะ author ที่ currentUser ติดตาม
    const viewerId = currentUser?.user_id || null;
    const feed = await getUnifiedFeed({
      limit,
      offset,
      viewerId,
      statuses: viewerId ? ['published', 'unpublish'] : ['published'],
      excludeGroupPosts: true // Exclude group posts from following feed
    });
    
    if (feed.length) {
      console.log('Following feed first media sample:', feed[0].media);
    }
    
    return res.render('home', {
      activeTab: 'following',
      feed,
      currentUser,
      activePage: 'home',
      page,
      limit,
      hasMore: feed.length === limit
    });
  } catch (err) {
    console.error('getFollowingPosts error:', err);
    return res.status(500).send('Database error');
  }
};
