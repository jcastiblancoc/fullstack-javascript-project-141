### Hexlet tests and linter status:
[![Actions Status](https://github.com/JavierQuinan/fullstack-javascript-project-141/actions/workflows/hexlet-check.yml/badge.svg)](https://github.com/JavierQuinan/fullstack-javascript-project-141/actions)

## Task Manager Application

Full-stack JavaScript task management system built with modern web technologies.

### Features
- **User Authentication**: Secure cookie-based session management with bcrypt password hashing
- **Task Management**: Complete CRUD operations for tasks with status tracking
- **Advanced Filtering**: Filter tasks by status, executor, creator, and labels
- **Label System**: Organize tasks with custom labels and many-to-many relationships
- **Status Tracking**: Customizable task statuses for workflow management
- **Error Monitoring**: Integrated Rollbar for production error tracking
- **Internationalization**: Multi-language support (English/Spanish) via i18next

### Tech Stack
- **Backend Framework**: Fastify 5.x with Objection.js ORM
- **Database**: SQLite with Knex.js migrations
- **Frontend**: Pug templates, Bootstrap 5, Webpack bundling
- **Authentication**: bcrypt password hashing, secure cookie sessions
- **ORM**: Knex.js query builder with Objection.js models
- **Testing**: Mocha test framework with Playwright for E2E
- **Error Tracking**: Rollbar integration for production monitoring

### Project Structure
```
fullstack-javascript-project-141/
├── src/                    # Application source code
│   ├── app.js             # Main Fastify application
│   ├── server.js          # Server entry point
│   ├── db.js              # Database configuration
│   ├── repositories/      # Data access layer
│   └── rollbar.js         # Error tracking setup
├── views/                 # Pug templates
│   ├── tasks/            # Task management views
│   ├── users/            # User management views
│   ├── statuses/         # Status CRUD views
│   └── labels/           # Label management views
├── migrations/            # Knex database migrations
├── locales/              # i18n translation files
├── test/                 # Test suites
└── public/               # Static assets
```

### Setup Instructions
```bash
# Install dependencies
npm install

# Setup environment (creates .env from template)
npm run setup

# Build frontend assets
npm run build

# Start development server
npm start
```

### Database Migrations
```bash
# Run migrations
npx knex migrate:latest

# Rollback migrations
npx knex migrate:rollback

# Create new migration
npx knex migrate:make migration_name
```

### Testing
```bash
# Run test suite
npm test

# Run with coverage
npm run test:coverage
```

### Environment Variables
```env
NODE_ENV=development
PORT=3000
DB_FILE=:memory:              # Use :memory: for tests, file path for production
COOKIE_SECRET=your_secret_key
ROLLBAR_ACCESS_TOKEN=         # Optional: Rollbar token for error tracking
```
