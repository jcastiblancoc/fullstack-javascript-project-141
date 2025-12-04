#!/usr/bin/env node
import { promises as fs } from 'fs';
import path from 'path';

const root = process.cwd();
const src = path.join(root, 'code', '.env.example');
const dest = path.join(root, '.env');

async function fileExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch (e) {
    return false;
  }
}

async function main() {
  try {
    if (await fileExists(dest)) {
      console.log('.env already exists, skipping setup.');
      return;
    }

    if (await fileExists(src)) {
      await fs.copyFile(src, dest);
      console.log('Copied code/.env.example to .env');
      return;
    }

    // Fallback: create a minimal .env
    const content = 'NODE_ENV=development\nPORT=3000\nDB_FILE=:memory:\nCOOKIE_SECRET=change_this_secret\nROLLBAR_ACCESS_TOKEN=\n';
    await fs.writeFile(dest, content, { encoding: 'utf8', flag: 'w' });
    console.log('Created default .env');
  } catch (err) {
    console.error('Error during setup:', err);
    process.exit(1);
  }
}

main();
