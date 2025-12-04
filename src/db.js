import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import knexLib from 'knex';

/* eslint-disable no-underscore-dangle */
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
/* eslint-enable no-underscore-dangle */
const DB_DIR = join(__dirname, '..', 'data');
const DEFAULT_DB_FILE = join(DB_DIR, 'app.sqlite3');

// Allow overriding DB filename via env var (useful for tests)
const DB_FILE = process.env.DB_FILE || DEFAULT_DB_FILE;

if (DB_FILE !== ':memory:' && !fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });

const knex = knexLib({
  client: 'sqlite3',
  connection: {
    filename: DB_FILE,
  },
  useNullAsDefault: true,
  migrations: {
    // Directorio único usado por la app y CI
    directory: join(__dirname, '..', 'migrations'),
  },
});

export const ensureBaseSchema = async () => {
  // La migración ahora maneja ambas columnas (password y passwordDigest)
  // Solo verificamos y sincronizamos si la tabla ya existe pero faltan columnas
  const hasUsers = await knex.schema.hasTable('users');
  if (!hasUsers) return; // Migración se encargará

  const hasPwdDigest = await knex.schema.hasColumn('users', 'passwordDigest');
  const hasPassword = await knex.schema.hasColumn('users', 'password');

  if (!hasPwdDigest) {
    await knex.schema.table('users', (t) => {
      t.string('passwordDigest').notNullable().default('');
    });
  }

  if (!hasPassword) {
    await knex.schema.table('users', (t) => {
      t.string('password').notNullable().default('');
    });
  }
};

export default knex;
