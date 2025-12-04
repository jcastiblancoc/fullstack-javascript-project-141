// src/server.js
import 'dotenv/config';
import { buildApp } from './app.js';
import { getRollbar } from './rollbar.js';

const PORT = process.env.PORT || 3000;
// Importante para Render: escuchar en 0.0.0.0
const HOST = '0.0.0.0';

// Global handlers to report to Rollbar if initialized
process.on('unhandledRejection', (reason) => {
  const rb = getRollbar();
  if (rb) rb.error(reason);
  // keep default behaviour for visibility in logs
  console.error('unhandledRejection', reason);
});

process.on('uncaughtException', (err) => {
  const rb = getRollbar();
  if (rb) rb.error(err);
  console.error('uncaughtException', err);
  // exit after reporting
  process.exit(1);
});

const start = async () => {
  try {
    const app = await buildApp();
    await app.listen({ port: PORT, host: HOST });
    console.log(`Server listening on port ${PORT}`);
  } catch (err) {
    // Report startup errors as well
    const rb = getRollbar();
    if (rb) rb.error(err);
    // If app wasn't created, log to console
    try {
      // if app is defined, log there
      // eslint-disable-next-line no-undef
      if (typeof app !== 'undefined' && app && app.log) app.log.error(err);
      else console.error(err);
    } catch (e) {
      console.error(err);
    }
    process.exit(1);
  }
};

start();
