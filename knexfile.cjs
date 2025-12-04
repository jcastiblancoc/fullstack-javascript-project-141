// knexfile.js
const path = require('path');

module.exports = {
  development: {
    client: 'sqlite3',
    connection: {
      filename: process.env.DB_FILE || path.join(__dirname, 'data', 'app.sqlite3'),
    },
    useNullAsDefault: true,
    migrations: {
      directory: path.join(__dirname, 'migrations'),
    },
  },
  test: {
    client: 'sqlite3',
    connection: ':memory:',
    useNullAsDefault: true,
    migrations: {
      directory: path.join(__dirname, 'migrations'),
    },
  },
  production: {
    client: 'sqlite3',
    connection: {
      filename: process.env.DB_FILE || path.join(__dirname, 'data', 'app.sqlite3'),
    },
    useNullAsDefault: true,
    migrations: {
      directory: path.join(__dirname, 'migrations'),
    },
  },
};
