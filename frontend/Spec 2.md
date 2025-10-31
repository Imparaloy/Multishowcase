# Multishowcase - Technical Specification

## Executive Summary

Multishowcase is a social media platform designed specifically for creative professionals to showcase their work across multiple disciplines including 3D modeling, animation, game development, UX/UI design, and web development. The platform serves as a centralized hub where artists, designers, and developers can share their portfolios, collaborate in specialized groups, and discover work from other creatives in their field.

The core problem Multishowcase solves is the fragmentation of creative portfolios across different platforms and the lack of a dedicated space for interdisciplinary creative collaboration. By providing specialized groups, tagging systems, and a social feed tailored to creative disciplines, Multishowcase enables professionals to build their reputation, receive feedback from peers, and discover opportunities for collaboration.

The target audience includes:
- 3D artists and animators
- Game developers and designers
- UX/UI professionals
- Web developers and designers
- Creative professionals looking to build interdisciplinary connections

## Technology Stack

### Backend Technologies
- **Runtime**: Node.js with ES Modules
- **Framework**: Express.js 5.1.0
- **Database**: PostgreSQL with connection pooling
- **Authentication**: AWS Cognito with JWT verification
- **File Storage**: AWS S3 with presigned URLs
- **File Upload**: Multer and Express-fileupload
- **View Engine**: EJS (Embedded JavaScript Templates)

### Frontend Technologies
- **Styling**: Tailwind CSS 4.1.13
- **Icons**: Feather Icons
- **Template Engine**: EJS with component-based architecture
- **Client-side**: Vanilla JavaScript

### AWS Services
- **Cognito Identity Provider**: User authentication and authorization
- **S3**: File storage and media management
- **SDK**: AWS SDK v3 for JavaScript

### Development Tools
- **Package Manager**: npm
- **Development Server**: Nodemon
- **Environment Management**: dotenv

## Technical Architecture

### Application Structure

The application follows a traditional MVC (Model-View-Controller) pattern with additional service layers for AWS integration:

```
├── src/
│   ├── config/          # Configuration files (database, AWS)
│   ├── controllers/      # Request handlers and business logic
│   ├── middlewares/      # Authentication and request processing
│   ├── routes/          # Route definitions and HTTP method mapping
│   ├── services/        # External service integrations (AWS)
│   ├── views/           # EJS templates and UI components
│   ├── data/            # Mock data and JSON storage
│   └── server.js        # Application entry point
├── public/              # Static assets (CSS, JS, images)
└── uploads/             # Local file upload storage
```

### Key Components

#### Authentication System
- AWS Cognito integration for user management
- JWT-based authentication with access and ID token verification
- Role-based access control (admin, member roles)
- Session management via HTTP-only cookies

#### Data Management
- Dual storage approach: PostgreSQL for structured data, JSON files for groups
- Connection pooling for database efficiency
- Transaction support for data consistency
- Mock data system for development and testing

#### File Management
- AWS S3 integration for scalable file storage
- Presigned URL generation for secure uploads
- Local fallback storage for development
- Multi-file upload support with order tracking

#### View System
- Component-based EJS templates
- Responsive design with Tailwind CSS
- Client-side routing for SPA-like experience
- Dynamic content rendering with server-side data

### Data Flow

1. **User Authentication Flow**:
   - User submits credentials → AWS Cognito verification → JWT token generation → Cookie storage → Request authentication

2. **Content Creation Flow**:
   - User creates post → File upload to S3/local → Database transaction → Feed update → Real-time UI refresh

3. **Group Management Flow**:
   - Group creation → JSON file storage → Member management → Permission validation → Content filtering

## Data Models and Database Schema

### Database Schema (PostgreSQL)

Based on the code analysis, the following tables are implemented:

#### Users Table
```sql
CREATE TABLE users (
    user_id UUID PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    display_name VARCHAR(255),
    role VARCHAR(50) DEFAULT 'member',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### Posts Table
```sql
CREATE TABLE posts (
    post_id UUID PRIMARY KEY,
    author_id UUID REFERENCES users(user_id),
    body TEXT NOT NULL,
    category VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### Post Media Table
```sql
CREATE TABLE post_media (
    media_id UUID PRIMARY KEY,
    post_id UUID REFERENCES posts(post_id),
    media_type VARCHAR(50) DEFAULT 'image',
    file_path VARCHAR(500),
    order_index INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### Comments Table
```sql
CREATE TABLE comments (
    comment_id UUID PRIMARY KEY,
    post_id UUID REFERENCES posts(post_id),
    author_id UUID REFERENCES users(user_id),
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### Groups Table (JSON Storage)
Groups are stored in `src/data/groups.json` with the following structure:
```json
{
  "id": "unique-group-id",
  "name": "Group Name",
  "description": "Group description",
  "createdAt": "ISO timestamp",
  "createdBy": "username",
  "members": [
    {
      "username": "member-username",
      "displayName": "Display Name",
      "role": "owner|member"
    }
  ],
  "tags": ["tag1", "tag2"]
}
```

### Mock Data Structure

The application uses mock data for development with the following key structures:

#### Posts
```javascript
{
  id: Number,
  name: String,
  username: String,
  content: String,
  comments: String,
  likes: String,
  reactions: String,
  views: String,
  tags: Array<String>
}
```

#### Users
```javascript
{
  username: String,
  displayName: String,
  role: String
}
```

## Functional Requirements

### User Stories

#### Authentication & User Management
- **As a new user**, I want to sign up with my email and password so that I can create an account
- **As a registered user**, I want to log in securely so that I can access my account
- **As a logged-in user**, I want to log out so that I can secure my account
- **As an admin user**, I want to manage user roles so that I can control access levels

#### Content Management
- **As a creative professional**, I want to create posts with text and media so that I can showcase my work
- **As a content creator**, I want to upload multiple images with my posts so that I can provide comprehensive examples
- **As a user**, I want to categorize my content with tags so that others can find my work easily
- **As a post author**, I want to delete my own posts so that I can manage my portfolio

#### Social Interaction
- **As a user**, I want to view a feed of posts from other creatives so that I can discover new work
- **As a user**, I want to filter posts by tags so that I can find content relevant to my interests
- **As a user**, I want to comment on posts so that I can provide feedback and engage with the community
- **As a user**, I want to like posts so that I can show appreciation for work I admire

#### Group Collaboration
- **As a creative professional**, I want to create specialized groups so that I can collaborate with peers in my field
- **As a group owner**, I want to manage group membership so that I can control who can participate
- **As a group member**, I want to post within groups so that I can share work with relevant audiences
- **As a user**, I want to discover and join groups so that I can connect with like-minded professionals

#### Profile Management
- **As a user**, I want to view my profile so that I can see my activity and content
- **As a user**, I want to view other users' profiles so that I can learn more about creators I admire
- **As a creative professional**, I want to showcase my work on my profile so that others can see my portfolio

### Use Cases

#### Post Creation Use Case
1. User navigates to home page
2. User clicks "What's happening?" prompt
3. User enters post content and optionally selects images
4. User selects relevant tags for categorization
5. User submits form
6. System validates content and uploads files
7. System creates post record in database
8. System updates feed with new post
9. User receives confirmation of successful post creation

#### Group Creation Use Case
1. User navigates to groups page
2. User clicks "Create New Group" button
3. User enters group name, description, and tags
4. User submits form
5. System validates group information
6. System creates group record
7. System assigns user as group owner
8. User is redirected to new group page

#### Authentication Use Case
1. User navigates to login page
2. User enters username and password
3. User submits form
4. System validates credentials with AWS Cognito
5. System receives JWT tokens upon successful validation
6. System sets secure HTTP-only cookie with access token
7. User is redirected to profile page
8. System authenticates subsequent requests using JWT verification

## Non-Functional Requirements

### Performance Requirements
- **Response Time**: API responses must complete within 200ms for database queries and 500ms for file uploads
- **Throughput**: System must support 100 concurrent users with minimal degradation
- **File Upload**: Support for files up to 5MB with progress indication
- **Database**: Connection pooling with maximum 20 connections to prevent resource exhaustion

### Security Requirements
- **Authentication**: JWT-based authentication with token expiration
- **Authorization**: Role-based access control for sensitive operations
- **Data Protection**: HTTPS encryption for all data transmission
- **Input Validation**: Server-side validation for all user inputs
- **File Security**: Virus scanning and type validation for uploaded files
- **Session Management**: Secure HTTP-only cookies for session tokens

### Scalability Requirements
- **Horizontal Scaling**: Stateless application design for load balancer compatibility
- **Database Scaling**: Read replicas for read-heavy operations
- **File Storage**: AWS S3 for unlimited, scalable file storage
- **Caching**: Implementation of Redis for session and frequently accessed data
- **CDN Integration**: Content delivery network for static assets

### Reliability Requirements
- **Uptime**: 99.9% availability during business hours
- **Data Backup**: Daily automated backups with 30-day retention
- **Error Handling**: Graceful degradation with user-friendly error messages
- **Transaction Integrity**: ACID compliance for critical operations
- **Monitoring**: Application performance monitoring with alerting

### Usability Requirements
- **Responsive Design**: Mobile-first approach with desktop optimization
- **Accessibility**: WCAG 2.1 AA compliance for inclusive design
- **Browser Support**: Modern browsers (Chrome, Firefox, Safari, Edge) with latest versions
- **Load Times**: Page load under 3 seconds on standard broadband
- **Intuitive Navigation**: Clear information architecture with minimal clicks to key features

## Development Setup

### Prerequisites
- Node.js 18+ with ES Modules support
- PostgreSQL 13+ for local development
- AWS account with appropriate IAM permissions
- Git for version control

### Local Environment Setup

1. **Clone Repository**:
   ```bash
   git clone <repository-url>
   cd Multishowcase/frontend
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Environment Configuration**:
   ```bash
   cp .env.example .env
   # Edit .env with your configuration values
   ```

4. **Database Setup**:
   ```bash
   # Create PostgreSQL database
   createdb multishowcase
   
   # Run migration scripts (if available)
   # Or manually create tables using schema documentation
   ```

5. **AWS Configuration**:
   - Configure AWS credentials in environment variables
   - Set up Cognito User Pool
   - Create S3 bucket for file storage
   - Configure appropriate IAM roles and policies

6. **Start Development Server**:
   ```bash
   npm run dev
   # Server runs on http://localhost:3000
   ```

### Environment Variables

Required environment variables for application functionality:

```bash
# Server Configuration
NODE_ENV=development
PORT=3000

# Database Configuration
PGHOST=localhost
PGUSER=your_db_user
PGPASSWORD=your_db_password
PGDATABASE=multishowcase
PGPORT=5432
RDS_SSL=false

# AWS Configuration
AWS_ACCESS_KEY_ID=your_aws_access_key
AWS_SECRET_ACCESS_KEY=your_aws_secret_key
AWS_REGION=your_aws_region
AWS_SESSION_TOKEN=your_session_token # if using temporary credentials

# Cognito Configuration
COGNITO_USER_POOL_ID=your_user_pool_id
COGNITO_CLIENT_ID=your_client_id
COGNITO_CLIENT_SECRET=your_client_secret

# S3 Configuration
S3_BUCKET_NAME=your_bucket_name
S3_BUCKET_URL=your_bucket_url
```

## Testing

### Testing Strategy
- **Unit Testing**: Jest for individual function testing
- **Integration Testing**: Supertest for API endpoint testing
- **E2E Testing**: Cypress for full user journey testing
- **Performance Testing**: Artillery for load testing

### Test Execution
```bash
# Run unit tests
npm test

# Run integration tests
npm run test:integration

# Run E2E tests
npm run test:e2e

# Run performance tests
npm run test:performance
```

### Test Coverage
- Minimum 80% code coverage for critical paths
- 100% coverage for authentication and authorization logic
- All user stories must have corresponding test cases

## Deployment

### Production Deployment

#### Infrastructure Requirements
- **Application Server**: AWS EC2 or Elastic Beanstalk
- **Database**: AWS RDS PostgreSQL with Multi-AZ deployment
- **File Storage**: AWS S3 with lifecycle policies
- **CDN**: AWS CloudFront for static assets
- **Load Balancer**: Application Load Balancer for traffic distribution
- **Monitoring**: AWS CloudWatch for application monitoring

#### Deployment Process
1. **Code Preparation**:
   ```bash
   # Install production dependencies
   npm ci --production
   
   # Run tests
   npm test
   
   # Build assets (if applicable)
   npm run build
   ```

2. **Database Migration**:
   ```bash
   # Backup production database
   pg_dump production_db > backup.sql
   
   # Run migration scripts
   npm run migrate:prod
   ```

3. **Application Deployment**:
   ```bash
   # Deploy using chosen method (EB, ECS, etc.)
   npm run deploy:prod
   ```

4. **Post-Deployment Verification**:
   - Health check endpoints
   - Smoke testing of critical user journeys
   - Performance monitoring setup
   - Rollback plan preparation

### Environment-Specific Configurations
- **Development**: Local database, mock AWS services, verbose logging
- **Staging**: Production-like environment with isolated resources
- **Production**: Optimized configuration with monitoring and alerting

## Contribution Guidelines

### Code Standards

#### JavaScript Standards
- Use ES6+ features with ES Modules
- Follow Airbnb JavaScript Style Guide
- Implement proper error handling with try-catch blocks
- Use async/await for asynchronous operations
- Maintain consistent naming conventions (camelCase for variables, PascalCase for classes)

#### File Organization
- Keep files under 200 lines when possible
- Use descriptive file names that indicate purpose
- Group related functionality in directories
- Separate business logic from route handlers

#### Comment Standards
- Document complex business logic
- Explain non-obvious algorithm implementations
- Include parameter and return value documentation
- Use JSDoc format for function documentation

### Git Workflow

#### Branch Strategy
- **main**: Production-ready code
- **develop**: Integration branch for features
- **feature/***: Individual feature development
- **hotfix/***: Critical bug fixes

#### Commit Message Format
```
type(scope): description

[optional body]

[optional footer]
```

Types:
- feat: New feature
- fix: Bug fix
- docs: Documentation changes
- style: Code style changes
- refactor: Code refactoring
- test: Test additions
- chore: Maintenance tasks

#### Pull Request Process
1. Create feature branch from develop
2. Implement changes with tests
3. Ensure all tests pass
4. Submit pull request to develop
5. Request code review from team members
6. Address review feedback
7. Merge after approval

### Review Guidelines

#### Code Review Checklist
- [ ] Code follows project style guidelines
- [ ] Tests are included and passing
- [ ] Documentation is updated
- [ ] No sensitive data is committed
- [ ] Performance implications considered
- [ ] Security implications assessed
- [ ] Error handling implemented

#### Design Review Checklist
- [ ] UI/UX follows design system
- [ ] Responsive design implemented
- [ ] Accessibility requirements met
- [ ] Cross-browser compatibility verified
- [ ] User experience is intuitive

### Issue Reporting

#### Bug Reports
Include the following information:
- Environment details (OS, browser, version)
- Steps to reproduce
- Expected vs actual behavior
- Screenshots or recordings if applicable
- Console errors or logs

#### Feature Requests
Include the following information:
- Problem statement
- Proposed solution
- User benefit
- Implementation considerations
- Priority assessment

### Community Guidelines

#### Code of Conduct
- Be respectful and inclusive
- Provide constructive feedback
- Welcome newcomers and help them learn
- Focus on what is best for the community
- Show empathy towards other community members

#### Communication Channels
- **Issues**: Bug reports and feature requests
- **Discussions**: General questions and ideas
- **Pull Requests**: Code contributions and reviews
- **Releases**: Announcements and updates

## API Documentation

### Authentication Endpoints

#### POST /auth/signup
Register a new user account.

**Request Body**:
```json
{
  "username": "string",
  "password": "string",
  "email": "string",
  "name": "string"
}
```

**Response**:
```json
{
  "ok": true,
  "message": "Sign up successful. Your account is confirmed. You can log in now."
}
```

#### POST /auth/login
Authenticate user and create session.

**Request Body**:
```json
{
  "username": "string",
  "password": "string"
}
```

**Response**: Redirect to profile page with session cookie

#### POST /auth/logout
Terminate user session.

**Response**: Redirect to home page

### Post Endpoints

#### POST /api/posts
Create a new post with optional media attachments.

**Request Body**: multipart/form-data
- content: string (required)
- tags: string (comma-separated)
- images: file[] (optional)

**Response**:
```json
{
  "success": true,
  "postId": "uuid",
  "message": "Post created successfully"
}
```

### Group Endpoints

#### GET /groups
Retrieve all available groups.

**Response**: Rendered groups page with group data

#### POST /groups
Create a new group.

**Request Body**:
```json
{
  "name": "string",
  "description": "string",
  "tags": ["string"]
}
```

**Response**:
```json
{
  "ok": true,
  "group": {
    "id": "string",
    "name": "string",
    "description": "string",
    "createdAt": "timestamp",
    "createdBy": "string",
    "tags": ["string"],
    "members": []
  }
}
```

### Feed Endpoints

#### GET /
Retrieve "For You" feed with recommended posts.

**Response**: Rendered home page with posts

#### GET /following
Retrieve posts from followed users.

**Response**: Rendered home page with following posts

#### GET /explore
Discover posts with filtering options.

**Query Parameters**:
- tag: string (optional) - Filter by tag
- q: string (optional) - Search query

**Response**: Rendered explore page with filtered posts

## Security Considerations

### Authentication Security
- JWT tokens with short expiration times
- Secure HTTP-only cookies for session management
- CSRF protection for state-changing operations
- Rate limiting on authentication endpoints

### Data Protection
- Input sanitization for all user inputs
- SQL injection prevention with parameterized queries
- XSS protection with content encoding
- File upload validation and scanning

### Infrastructure Security
- HTTPS enforcement for all connections
- Security headers implementation
- Regular dependency updates and vulnerability scanning
- AWS security best practices implementation

## Monitoring and Maintenance

### Application Monitoring
- Response time tracking
- Error rate monitoring
- User activity analytics
- Resource utilization tracking

### Database Maintenance
- Query performance optimization
- Index management
- Backup verification
- Connection pool monitoring

### File Storage Management
- S3 lifecycle policies for cost optimization
- CDN performance monitoring
- Storage usage tracking
- Redundancy verification

## Future Enhancements

### Planned Features
- Real-time notifications
- Advanced search functionality
- Private messaging system
- Portfolio analytics
- Collaboration tools
- Mobile application

### Technical Improvements
- Microservices architecture
- GraphQL API implementation
- Progressive Web App features
- Advanced caching strategies
- Machine learning recommendations

## Conclusion

This specification document provides a comprehensive overview of the Multishowcase platform, including its technical architecture, functional requirements, and development guidelines. The platform is designed to serve creative professionals by providing a specialized social media experience that fosters collaboration and discovery across multiple creative disciplines.

The modular architecture and AWS integration ensure scalability and reliability, while the comprehensive testing strategy and deployment processes maintain high code quality and system stability. The contribution guidelines establish clear standards for team collaboration and community engagement.

As the platform evolves, this specification will be updated to reflect new features, technical improvements, and changing requirements to ensure it remains the definitive source of truth for the Multishowcase application.