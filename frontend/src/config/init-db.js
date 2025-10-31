import pool from './dbconn.js';

async function initializeDatabase() {
  const client = await pool.connect();
  
  try {
    console.log('Initializing database tables...');
    
    // Create users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        cognito_sub VARCHAR(255) UNIQUE NOT NULL,
        username VARCHAR(255) UNIQUE NOT NULL,
        email VARCHAR(255),
        display_name VARCHAR(255),
        bio TEXT,
        avatar_url VARCHAR(500),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Create posts table
    await client.query(`
      CREATE TABLE IF NOT EXISTS posts (
        post_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        author_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        title VARCHAR(500),
        body TEXT,
        category VARCHAR(100) DEFAULT '2D art',
        status VARCHAR(50) DEFAULT 'published' CHECK (status IN ('published', 'unpublish')),
        published_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        group_id UUID REFERENCES groups(group_id) ON DELETE CASCADE
      )
    `);
    
    // Create post_media table
    await client.query(`
      CREATE TABLE IF NOT EXISTS post_media (
        post_media_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        post_id UUID NOT NULL REFERENCES posts(post_id) ON DELETE CASCADE,
        media_type VARCHAR(50) DEFAULT 'image',
        order_index INTEGER DEFAULT 0,
        s3_key VARCHAR(1000),
        s3_url VARCHAR(1000),
        original_filename VARCHAR(500),
        file_size INTEGER,
        content_type VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Create comments table
    await client.query(`
      CREATE TABLE IF NOT EXISTS comments (
        comment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        post_id UUID NOT NULL REFERENCES posts(post_id) ON DELETE CASCADE,
        author_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        body TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Create likes table
    await client.query(`
      CREATE TABLE IF NOT EXISTS likes (
        like_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        post_id UUID NOT NULL REFERENCES posts(post_id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(post_id, user_id)
      )
    `);
    
    // Create groups table
    await client.query(`
      CREATE TABLE IF NOT EXISTS groups (
        group_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        description TEXT,
        owner_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Create group_members table
    await client.query(`
      CREATE TABLE IF NOT EXISTS group_members (
        group_id UUID NOT NULL REFERENCES groups(group_id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (group_id, user_id)
      )
    `);
    
    // Create group_join_requests table
    await client.query(`
      CREATE TABLE IF NOT EXISTS group_join_requests (
        request_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        group_id UUID NOT NULL REFERENCES groups(group_id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        responded_at TIMESTAMP,
        UNIQUE(group_id, user_id)
      )
    `);
    
    // Create reports table
    await client.query(`
      CREATE TABLE IF NOT EXISTS reports (
        report_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        reporter_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        report_type VARCHAR(50) NOT NULL,
        target_id VARCHAR(255) NOT NULL,
        reason VARCHAR(255) NOT NULL,
        description TEXT,
        status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        reviewed_by UUID REFERENCES users(user_id),
        review_notes TEXT
      )
    `);
    
    // Create admin_actions table
    await client.query(`
      CREATE TABLE IF NOT EXISTS admin_actions (
        action_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        admin_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        action_type VARCHAR(100) NOT NULL,
        target_type VARCHAR(50) NOT NULL,
        target_id VARCHAR(255) NOT NULL,
        reason TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Create indexes for users table
    await client.query('CREATE INDEX IF NOT EXISTS idx_users_cognito_sub ON users(cognito_sub)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)');
    
    // Create indexes for posts table
    await client.query('CREATE INDEX IF NOT EXISTS idx_posts_author_id ON posts(author_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_posts_published_at ON posts(published_at)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_posts_category ON posts(category)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_posts_group_id ON posts(group_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at)');
    
    // Create indexes for post_media table
    await client.query('CREATE INDEX IF NOT EXISTS idx_post_media_post_id ON post_media(post_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_post_media_order_index ON post_media(post_id, order_index)');
    
    // Create indexes for comments table
    await client.query('CREATE INDEX IF NOT EXISTS idx_comments_post_id ON comments(post_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_comments_author_id ON comments(author_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_comments_created_at ON comments(created_at)');
    
    // Create indexes for likes table
    await client.query('CREATE INDEX IF NOT EXISTS idx_likes_post_id ON likes(post_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_likes_user_id ON likes(user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_likes_post_user ON likes(post_id, user_id)');
    
    // Create indexes for groups tables
    await client.query('CREATE INDEX IF NOT EXISTS idx_groups_owner_id ON groups(owner_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_group_members_group_id ON group_members(group_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_group_members_user_id ON group_members(user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_group_join_requests_group_id ON group_join_requests(group_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_group_join_requests_user_id ON group_join_requests(user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_group_join_requests_status ON group_join_requests(status)');
    
    // Create indexes for reports table
    await client.query('CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_reports_type ON reports(report_type)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_reports_reporter_id ON reports(reporter_id)');
    
    // Create indexes for admin_actions table
    await client.query('CREATE INDEX IF NOT EXISTS idx_admin_actions_admin ON admin_actions(admin_id)');
    
    console.log('✅ Database tables initialized successfully');
  } catch (err) {
    console.error('❌ Error initializing database:', err);
    throw err;
  } finally {
    client.release();
  }
}

export default initializeDatabase;