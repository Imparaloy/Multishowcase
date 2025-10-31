import pool from './dbconn.js';

async function initializeDatabase() {
  const client = await pool.connect();
  
  try {
    console.log('Initializing database tables...');
    
    // Create enum types first
    await client.query(`
      DO $$ BEGIN
        CREATE TYPE post_status AS ENUM ('published', 'unpublish');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
    
    await client.query(`
      DO $$ BEGIN
        CREATE TYPE post_category AS ENUM ('2D art', '3D model', 'Graphic Design', 'Animation', 'Game', 'UX/UI design');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);
    
    // Create users table first (no dependencies)
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        cognito_sub VARCHAR(255) UNIQUE NOT NULL,
        username VARCHAR(255) UNIQUE NOT NULL,
        email VARCHAR(255),
        display_name VARCHAR(255),
        bio TEXT,
        avatar_url VARCHAR(500),
        posts_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Create groups table (depends only on users)
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
    
    // Create posts table (depends on users and groups)
    await client.query(`
      CREATE TABLE IF NOT EXISTS posts (
        post_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        author_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        title VARCHAR(500),
        body TEXT,
        category post_category,
        status post_status DEFAULT 'published',
        published_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        group_id UUID REFERENCES groups(group_id) ON DELETE CASCADE
      )
    `);
    
    // Check if author_id column exists in posts table, add it if it doesn't
    try {
      const result = await client.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'posts' AND column_name = 'author_id'
      `);
      
      if (result.rows.length === 0) {
        console.log('Adding missing author_id column to posts table...');
        await client.query(`
          ALTER TABLE posts
          ADD COLUMN author_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE
        `);
      }
    } catch (err) {
      console.error('Error checking/adding author_id column:', err);
    }
    
    // Create post_media table (depends on posts)
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
    
    // Create comments table (depends on posts and users)
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
    
    // Create likes table (depends on posts and users)
    await client.query(`
      CREATE TABLE IF NOT EXISTS likes (
        like_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        post_id UUID NOT NULL REFERENCES posts(post_id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(post_id, user_id)
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
    
    // Create follows table for follower/following relationships
    await client.query(`
      CREATE TABLE IF NOT EXISTS follows (
        follow_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        follower_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        following_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(follower_id, following_id)
      )
    `);
    
    // No need to add posts_count column as it's been removed from the schema
    
    // Create indexes for users table
    await client.query('CREATE INDEX IF NOT EXISTS idx_users_cognito_sub ON users(cognito_sub)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_users_username ON users(username)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)');
    
    // Check and add missing columns to posts table before creating indexes
    const postsColumns = [
      { name: 'author_id', type: 'UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE' },
      { name: 'status', type: 'post_status DEFAULT \'published\'' },
      { name: 'published_at', type: 'TIMESTAMP' },
      { name: 'category', type: 'post_category' },
      { name: 'group_id', type: 'UUID REFERENCES groups(group_id) ON DELETE CASCADE' },
      { name: 'created_at', type: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP' }
    ];
    
    for (const column of postsColumns) {
      try {
        const result = await client.query(`
          SELECT column_name
          FROM information_schema.columns
          WHERE table_name = 'posts' AND column_name = '${column.name}'
        `);
        
        if (result.rows.length === 0) {
          console.log(`Adding missing ${column.name} column to posts table...`);
          await client.query(`
            ALTER TABLE posts
            ADD COLUMN ${column.name} ${column.type}
          `);
        }
      } catch (err) {
        console.error(`Error checking/adding ${column.name} column:`, err);
      }
    }
    
    // Special handling for category column to ensure it allows NULL values
    try {
      const categoryResult = await client.query(`
        SELECT is_nullable
        FROM information_schema.columns
        WHERE table_name = 'posts' AND column_name = 'category'
      `);
      
      if (categoryResult.rows.length > 0 && categoryResult.rows[0].is_nullable === 'NO') {
        console.log('Modifying category column to allow NULL values...');
        await client.query(`
          ALTER TABLE posts
          ALTER COLUMN category DROP NOT NULL
        `);
      }
    } catch (err) {
      console.error('Error modifying category column to allow NULL:', err);
    }
    
    // Special handling for existing category column to change type to enum if needed
    try {
      const categoryTypeResult = await client.query(`
        SELECT data_type
        FROM information_schema.columns
        WHERE table_name = 'posts' AND column_name = 'category'
      `);
      
      if (categoryTypeResult.rows.length > 0 && categoryTypeResult.rows[0].data_type !== 'USER-DEFINED') {
        console.log('Modifying category column type to post_category enum...');
        await client.query(`
          ALTER TABLE posts
          ALTER COLUMN category TYPE post_category USING
          CASE
            WHEN category = '2D art' THEN '2D art'::post_category
            WHEN category = '3D model' THEN '3D model'::post_category
            WHEN category = 'Graphic Design' THEN 'Graphic Design'::post_category
            WHEN category = 'Animation' THEN 'Animation'::post_category
            WHEN category = 'Game' THEN 'Game'::post_category
            WHEN category = 'UX/UI design' THEN 'UX/UI design'::post_category
            ELSE NULL
          END
        `);
      }
    } catch (err) {
      console.error('Error modifying category column type to enum:', err);
    }
    
    // Create indexes for posts table
    await client.query('CREATE INDEX IF NOT EXISTS idx_posts_author_id ON posts(author_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_posts_status ON posts(status)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_posts_published_at ON posts(published_at)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_posts_category ON posts(category)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_posts_group_id ON posts(group_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at)');
    
    // Check and add missing columns to post_media table before creating indexes
    const postMediaColumns = [
      { name: 'post_id', type: 'UUID NOT NULL REFERENCES posts(post_id) ON DELETE CASCADE' },
      { name: 'order_index', type: 'INTEGER DEFAULT 0' }
    ];
    
    for (const column of postMediaColumns) {
      try {
        const result = await client.query(`
          SELECT column_name
          FROM information_schema.columns
          WHERE table_name = 'post_media' AND column_name = '${column.name}'
        `);
        
        if (result.rows.length === 0) {
          console.log(`Adding missing ${column.name} column to post_media table...`);
          await client.query(`
            ALTER TABLE post_media
            ADD COLUMN ${column.name} ${column.type}
          `);
        }
      } catch (err) {
        console.error(`Error checking/adding ${column.name} column:`, err);
      }
    }
    
    // Create indexes for post_media table
    await client.query('CREATE INDEX IF NOT EXISTS idx_post_media_post_id ON post_media(post_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_post_media_order_index ON post_media(post_id, order_index)');
    
    // Check and add missing columns to comments table before creating indexes
    const commentsColumns = [
      { name: 'post_id', type: 'UUID NOT NULL REFERENCES posts(post_id) ON DELETE CASCADE' },
      { name: 'author_id', type: 'UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE' },
      { name: 'created_at', type: 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP' }
    ];
    
    for (const column of commentsColumns) {
      try {
        const result = await client.query(`
          SELECT column_name
          FROM information_schema.columns
          WHERE table_name = 'comments' AND column_name = '${column.name}'
        `);
        
        if (result.rows.length === 0) {
          console.log(`Adding missing ${column.name} column to comments table...`);
          await client.query(`
            ALTER TABLE comments
            ADD COLUMN ${column.name} ${column.type}
          `);
        }
      } catch (err) {
        console.error(`Error checking/adding ${column.name} column:`, err);
      }
    }
    
    // Create indexes for comments table
  await client.query('CREATE INDEX IF NOT EXISTS idx_comments_post_id ON comments(post_id)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_comments_user_id ON comments(user_id)');
  await client.query('CREATE INDEX IF NOT EXISTS idx_comments_created_at ON comments(created_at)');
    
    // Check and add missing columns to likes table before creating indexes
    const likesColumns = [
      { name: 'post_id', type: 'UUID NOT NULL REFERENCES posts(post_id) ON DELETE CASCADE' },
      { name: 'user_id', type: 'UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE' }
    ];
    
    for (const column of likesColumns) {
      try {
        const result = await client.query(`
          SELECT column_name
          FROM information_schema.columns
          WHERE table_name = 'likes' AND column_name = '${column.name}'
        `);
        
        if (result.rows.length === 0) {
          console.log(`Adding missing ${column.name} column to likes table...`);
          await client.query(`
            ALTER TABLE likes
            ADD COLUMN ${column.name} ${column.type}
          `);
        }
      } catch (err) {
        console.error(`Error checking/adding ${column.name} column:`, err);
      }
    }
    
    // Create indexes for likes table
    await client.query('CREATE INDEX IF NOT EXISTS idx_likes_post_id ON likes(post_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_likes_user_id ON likes(user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_likes_post_user ON likes(post_id, user_id)');
    
    // Check and add missing columns to groups table before creating indexes
    try {
      const result = await client.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'groups' AND column_name = 'owner_id'
      `);
      
      if (result.rows.length === 0) {
        console.log('Adding missing owner_id column to groups table...');
        await client.query(`
          ALTER TABLE groups
          ADD COLUMN owner_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE
        `);
      }
    } catch (err) {
      console.error('Error checking/adding owner_id column:', err);
    }
    
    // Create indexes for groups tables
    await client.query('CREATE INDEX IF NOT EXISTS idx_groups_owner_id ON groups(owner_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_group_members_group_id ON group_members(group_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_group_members_user_id ON group_members(user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_group_join_requests_group_id ON group_join_requests(group_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_group_join_requests_user_id ON group_join_requests(user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_group_join_requests_status ON group_join_requests(status)');
    
    // Check and add missing columns to reports table before creating indexes
    const reportsColumns = [
      { name: 'reporter_id', type: 'UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE' },
      { name: 'status', type: "VARCHAR(50) DEFAULT 'pending'" },
      { name: 'report_type', type: 'VARCHAR(50) NOT NULL' }
    ];
    
    for (const column of reportsColumns) {
      try {
        const result = await client.query(`
          SELECT column_name
          FROM information_schema.columns
          WHERE table_name = 'reports' AND column_name = '${column.name}'
        `);
        
        if (result.rows.length === 0) {
          console.log(`Adding missing ${column.name} column to reports table...`);
          await client.query(`
            ALTER TABLE reports
            ADD COLUMN ${column.name} ${column.type}
          `);
        }
      } catch (err) {
        console.error(`Error checking/adding ${column.name} column:`, err);
      }
    }
    
    // Create indexes for reports table
    await client.query('CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_reports_type ON reports(report_type)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_reports_reporter_id ON reports(reporter_id)');
    
    // Check and add missing columns to admin_actions table before creating indexes
    try {
      const result = await client.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'admin_actions' AND column_name = 'admin_id'
      `);
      
      if (result.rows.length === 0) {
        console.log('Adding missing admin_id column to admin_actions table...');
        await client.query(`
          ALTER TABLE admin_actions
          ADD COLUMN admin_id UUID NOT NULL REFERENCES users(user_id) ON DELETE CASCADE
        `);
      }
    } catch (err) {
      console.error('Error checking/adding admin_id column:', err);
    }
    
    // Create indexes for admin_actions table
    await client.query('CREATE INDEX IF NOT EXISTS idx_admin_actions_admin ON admin_actions(admin_id)');
    
    // Create indexes for follows table
    await client.query('CREATE INDEX IF NOT EXISTS idx_follows_follower_id ON follows(follower_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_follows_following_id ON follows(following_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_follows_follower_following ON follows(follower_id, following_id)');
    
    // No need to initialize posts_count as it's been removed from the schema

    console.log('✅ Database tables initialized successfully');
  } catch (err) {
    console.error('❌ Error initializing database:', err);
    throw err;
  } finally {
    client.release();
  }
}

export default initializeDatabase;