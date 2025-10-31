import pool from './dbconn.js';

async function initializeDatabase() {
  const client = await pool.connect();
  
  try {
    console.log('Initializing database tables...');
    
    // Create reports table
    await client.query(`
      CREATE TABLE IF NOT EXISTS reports (
        report_id SERIAL PRIMARY KEY,
        reporter_id VARCHAR(255) NOT NULL,
        report_type VARCHAR(50) NOT NULL,
        target_id VARCHAR(255) NOT NULL,
        reason VARCHAR(255) NOT NULL,
        description TEXT,
        status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        reviewed_by VARCHAR(255),
        review_notes TEXT
      )
    `);
    
    // Create groups table
    await client.query(`
      CREATE TABLE IF NOT EXISTS groups (
        group_id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        description TEXT,
        owner_id VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Create group_members table
    await client.query(`
      CREATE TABLE IF NOT EXISTS group_members (
        group_id INTEGER NOT NULL,
        user_id VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (group_id, user_id),
        FOREIGN KEY (group_id) REFERENCES groups(group_id) ON DELETE CASCADE
      )
    `);
    
    // Create group_join_requests table
    await client.query(`
      CREATE TABLE IF NOT EXISTS group_join_requests (
        request_id SERIAL PRIMARY KEY,
        group_id INTEGER NOT NULL,
        user_id VARCHAR(255) NOT NULL,
        status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        responded_at TIMESTAMP,
        FOREIGN KEY (group_id) REFERENCES groups(group_id) ON DELETE CASCADE
      )
    `);
    
    // Create admin_actions table
    await client.query(`
      CREATE TABLE IF NOT EXISTS admin_actions (
        action_id SERIAL PRIMARY KEY,
        admin_id VARCHAR(255) NOT NULL,
        action_type VARCHAR(100) NOT NULL,
        target_type VARCHAR(50) NOT NULL,
        target_id VARCHAR(255) NOT NULL,
        reason TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    
    // Create indexes
    await client.query('CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_reports_type ON reports(report_type)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_admin_actions_admin ON admin_actions(admin_id)');
    
    // Create indexes for groups tables
    await client.query('CREATE INDEX IF NOT EXISTS idx_groups_owner_id ON groups(owner_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_group_members_group_id ON group_members(group_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_group_members_user_id ON group_members(user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_group_join_requests_group_id ON group_join_requests(group_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_group_join_requests_user_id ON group_join_requests(user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_group_join_requests_status ON group_join_requests(status)');
    
    console.log('✅ Database tables initialized successfully');
  } catch (err) {
    console.error('❌ Error initializing database:', err);
  } finally {
    client.release();
  }
}

export default initializeDatabase;