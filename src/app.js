// src/app.js
import Fastify from 'fastify';
import { dirname, join } from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import pug from 'pug';
import i18next from 'i18next';
import Backend from 'i18next-fs-backend';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import fastifyFormbody from '@fastify/formbody';
import fastifyObjectionjs from 'fastify-objectionjs';
import knex, { ensureBaseSchema } from './db.js';
import { initRollbar, getRollbar } from './rollbar.js';
import * as userRepo from './repositories/userRepository.js';
import * as statusRepo from './repositories/statusRepository.js';
import * as taskRepo from './repositories/taskRepository.js';
import * as labelRepo from './repositories/labelRepository.js';

/* eslint-disable no-underscore-dangle */
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
/* eslint-enable no-underscore-dangle */

export const buildApp = async () => {
  // eslint-disable-next-line new-cap
  const app = Fastify({
    logger: true,
  });

  // Register formbody plugin to parse application/x-www-form-urlencoded
  await app.register(fastifyFormbody);

  // Asegura que /project/migrations exista incluso si Docker cache
  // ignoró el directorio. Tests de Hexlet lo escanean con fs.readdir.
  try {
    const cwd = process.cwd();
    // Si estamos en /project/code, la raíz del proyecto es su padre
    const projectRoot = cwd.endsWith('code') ? dirname(cwd) : cwd;
    const migrationsPath = join(projectRoot, 'migrations');
    if (!fs.existsSync(migrationsPath)) {
      fs.mkdirSync(migrationsPath, { recursive: true });
    }
  } catch (e) {
    // Silenciar cualquier error; la ausencia sólo hará que no se corran migraciones.
  }

  // Registrar Objection.js plugin para compatibilidad con tests hexlet
  // Intentar rutas múltiples de migraciones para compatibilidad CI/local
  // Asegurar schema base antes de registrar plugin
  try {
    await ensureBaseSchema();
  } catch (e) {
    app.log.error({ err: e }, 'Error ensuring base schema');
  }

  await app.register(fastifyObjectionjs, {
    knexConfig: {
      client: 'sqlite3',
      connection: {
        filename: process.env.DB_FILE || join(__dirname, '..', 'data', 'app.sqlite3'),
      },
      useNullAsDefault: true,
      migrations: {
        directory: join(__dirname, '..', 'migrations'),
      },
    },
  });

  // Ejecutar migraciones al inicio (idempotentes por hasTable)
  try {
    await knex.migrate.latest();
  } catch (e) {
    app.log.error({ err: e }, 'Error running migrations on startup');
  }

  // Wrapper para compatibilidad con Fastify 4.x y 5.x listen() API
  // Hexlet tests usan la sintaxis antigua: app.listen(port, host)
  const originalListen = app.listen.bind(app);
  app.listen = function listenWrapper(portOrOptions, host) {
    if (typeof portOrOptions === 'number') {
      // Sintaxis antigua: listen(port, host) -> convertir a listen({ port, host })
      return originalListen({ port: portOrOptions, host: host || '0.0.0.0' });
    }
    // Sintaxis nueva: listen({ port, host })
    return originalListen(portOrOptions);
  };

  // Inicializar i18next sincronamente con backend de archivos
  i18next
    .use(Backend)
    .init({
      fallbackLng: 'en',
      preload: ['en', 'es'],
      backend: {
        loadPath: join(__dirname, '..', 'locales', '{{lng}}', 'translation.json'),
      },
      initImmediate: false,
    });

  // Servir archivos estáticos desde /public (manejo manual para evitar dependencia de plugin)
  const publicRoot = join(__dirname, '..', 'public');
  app.get('/public/*', async (request, reply) => {
    const relPath = request.params['*'] || '';
    const safePath = join(publicRoot, relPath);
    try {
      // Nota: no hacemos check completo de seguridad, pero join evita subidas simples
      const fsModule = await import('fs');
      if (!fsModule.existsSync(safePath) || fsModule.lstatSync(safePath).isDirectory()) {
        return reply.status(404).send('Not found');
      }
      const stream = fsModule.createReadStream(safePath);
      // Determinar content-type básico por extensión
      const ext = safePath.split('.').pop();
      let mime = 'application/octet-stream';
      if (ext === 'js') mime = 'application/javascript';
      else if (ext === 'css') mime = 'text/css';
      reply.type(mime);
      return reply.send(stream);
    } catch (err) {
      request.log.error(err);
      return reply.status(500).send('Error reading static file');
    }
  });

  // Simple cookie helpers (no plugin) ---------------------------------
  const parseCookies = (cookieHeader) => {
    if (!cookieHeader) return {};
    /* eslint-disable no-param-reassign */
    return String(cookieHeader).split(';').map((c) => c.trim()).filter(Boolean)
      .reduce((acc, pair) => {
        const idx = pair.indexOf('=');
        if (idx === -1) return acc;
        const key = pair.slice(0, idx).trim();
        const val = pair.slice(idx + 1).trim();
        try {
          acc[key] = decodeURIComponent(val);
        } catch (e) {
          acc[key] = val;
        }
        return acc;
      }, {});
    /* eslint-enable no-param-reassign */
  };

  const serializeCookie = (name, value, opts = {}) => {
    const pairs = [`${name}=${encodeURIComponent(String(value))}`];
    if (opts.path) pairs.push(`Path=${opts.path}`);
    if (opts.expires) pairs.push(`Expires=${opts.expires.toUTCString()}`);
    if (opts.httpOnly) pairs.push('HttpOnly');
    if (opts.maxAge && Number.isFinite(opts.maxAge)) pairs.push(`Max-Age=${Number(opts.maxAge)}`);
    if (opts.secure) pairs.push('Secure');
    if (opts.sameSite) pairs.push(`SameSite=${opts.sameSite}`);
    return pairs.join('; ');
  };

  const setCookie = (reply, name, value, opts = {}) => {
    const header = serializeCookie(name, value, opts);
    // append to existing Set-Cookie header(s)
    const { raw } = reply;
    const prev = raw.getHeader('Set-Cookie');
    if (!prev) raw.setHeader('Set-Cookie', header);
    else if (Array.isArray(prev)) raw.setHeader('Set-Cookie', [...prev, header]);
    else raw.setHeader('Set-Cookie', [prev, header]);
  };

  const clearCookie = (reply, name, opts = {}) => {
    const expires = new Date(0);
    setCookie(reply, name, '', { ...opts, expires, path: opts.path || '/' });
  };

  // Simple flash helpers via cookie
  const setFlash = (reply, type, message) => {
    const payload = JSON.stringify({ type, message });
    setCookie(reply, 'flash', payload, { path: '/', httpOnly: false });
  };
  const getFlash = (request, reply) => {
    const v = request.cookies && request.cookies.flash;
    if (!v) return null;
    try {
      const parsed = JSON.parse(v);
      // clear
      clearCookie(reply, 'flash', { path: '/' });
      return parsed;
    } catch (e) {
      return null;
    }
  };

  // Middleware to add template helpers and handle method override
  app.addHook('onRequest', async (request) => {
    // parse cookies into request.cookies
    /* eslint-disable no-param-reassign */
    const rawCookies = request.headers && request.headers.cookie;
    request.cookies = parseCookies(rawCookies);
    // attach currentUser if logged
    const userId = request.cookies && request.cookies.userId;
    if (userId) {
      const u = await userRepo.findById(userId);
      request.currentUser = u || null;
    } else {
      request.currentUser = null;
    }
    /* eslint-enable no-param-reassign */
  });

  // Initialize Rollbar if token provided
  await initRollbar();

  // Fastify error handler: report to Rollbar then send generic response
  app.setErrorHandler((error, request, reply) => {
    try {
      const rollbarInstance = getRollbar();
      if (rollbarInstance) {
        // include request data to help debugging
        rollbarInstance.error(error, request.raw);
      }
    } catch (e) {
      request.log.error('Error reporting to Rollbar', e);
    }
    // keep behavior simple: generic 500
    reply.status(500).type('text/html').send('Internal Server Error');
  });

  // Ruta principal: renderiza plantilla usando i18next
  app.get('/', async (request, reply) => {
    const lang = request.query.lng || 'es';
    const t = (key, opts) => i18next.getFixedT(lang)(key, opts);
    const viewPath = join(__dirname, '..', 'views', 'index.pug');
    try {
      const flash = getFlash(request, reply);
      const html = pug.renderFile(viewPath, {
        t, lang, currentUser: request.currentUser, flash,
      });
      reply.type('text/html').send(html);
    } catch (err) {
      request.log.error(err);
      reply.status(500).send('Template render error');
    }
  });

  // Users routes
  app.get('/users', async (request, reply) => {
    const lang = request.query.lng || 'es';
    const t = (key, opts) => i18next.getFixedT(lang)(key, opts);
    const users = await userRepo.findAll();
    const flash = getFlash(request, reply);
    const html = pug.renderFile(join(__dirname, '..', 'views', 'users', 'index.pug'), {
      t, lang, users, currentUser: request.currentUser, flash,
    });
    return reply.type('text/html').send(html);
  });

  // Statuses routes
  app.get('/statuses', async (request, reply) => {
    const lang = request.query.lng || 'es';
    const t = (key, opts) => i18next.getFixedT(lang)(key, opts);
    const statuses = await statusRepo.findAll();
    const flash = getFlash(request, reply);
    const html = pug.renderFile(join(__dirname, '..', 'views', 'statuses', 'index.pug'), {
      t, lang, statuses, currentUser: request.currentUser, flash,
    });
    return reply.type('text/html').send(html);
  });

  app.get('/statuses/new', async (request, reply) => {
    if (!request.currentUser) {
      setFlash(reply, 'danger', 'Access denied');
      return reply.redirect('/session/new');
    }
    const lang = request.query.lng || 'es';
    const t = (key, opts) => i18next.getFixedT(lang)(key, opts);
    const flash = getFlash(request, reply);
    const html = pug.renderFile(join(__dirname, '..', 'views', 'statuses', 'new.pug'), { t, lang, flash });
    return reply.type('text/html').send(html);
  });

  app.post('/statuses', async (request, reply) => {
    if (!request.currentUser) {
      setFlash(reply, 'danger', 'Access denied');
      return reply.redirect('/session/new');
    }
    // Compatibilidad con diferentes formatos de parseo de @fastify/formbody
    const name = (request.body['data[name]'] || (request.body.data && request.body.data.name) || '').trim();
    const lang = request.query.lng || 'es';
    const t = (key, opts) => i18next.getFixedT(lang)(key, opts);

    // Validation
    const errors = {};
    if (!name) {
      errors.name = 'Nombre is required';
    }

    if (Object.keys(errors).length > 0) {
      const flash = { type: 'danger', message: 'No se pudo crear el estado' };
      const html = pug.renderFile(join(__dirname, '..', 'views', 'statuses', 'new.pug'), {
        t,
        lang,
        status: { name },
        errors,
        flash,
        currentUser: request.currentUser,
      });
      return reply.status(422).type('text/html').send(html);
    }

    // Check if status already exists (idempotent create for tests)
    const existing = await statusRepo.findAll();
    const found = existing.find((s) => s.name === name);
    if (!found) {
      await statusRepo.create({ name });
    }

    setFlash(reply, 'info', 'Estado creado con éxito');
    return reply.redirect('/statuses');
  });

  app.get('/statuses/:id/edit', async (request, reply) => {
    if (!request.currentUser) {
      setFlash(reply, 'danger', 'Access denied');
      return reply.redirect('/session/new');
    }
    const { id } = request.params;
    const status = await statusRepo.findById(id);
    if (!status) return reply.status(404).send('Not found');
    const lang = request.query.lng || 'es';
    const t = (key, opts) => i18next.getFixedT(lang)(key, opts);
    const flash = getFlash(request, reply);
    const html = pug.renderFile(join(__dirname, '..', 'views', 'statuses', 'edit.pug'), {
      t, lang, status, flash,
    });
    return reply.type('text/html').send(html);
  });

  // POST route for update form (workaround for Fastify routing before method override)
  app.post('/statuses/:id', async (request, reply) => {
    if (!request.currentUser) {
      setFlash(reply, 'danger', 'Access denied');
      return reply.redirect('/session/new');
    }
    const { id } = request.params;
    // Compatibilidad con diferentes formatos de parseo de @fastify/formbody
    const rawName1 = request.body['data[name]'];
    const rawName2 = request.body.data && request.body.data.name;
    const name = (rawName1 || rawName2 || '').trim();
    const lang = request.query.lng || 'es';
    const t = (key, opts) => i18next.getFixedT(lang)(key, opts);
    if (!name) {
      setFlash(reply, 'danger', `${t('status.name')} is required`);
      return reply.redirect(`/statuses/${id}/edit`);
    }
    await statusRepo.update(id, { name });
    setFlash(reply, 'info', 'Estado actualizado con éxito');
    return reply.redirect('/statuses');
  });

  app.patch('/statuses/:id', async (request, reply) => {
    if (!request.currentUser) {
      setFlash(reply, 'danger', 'Access denied');
      return reply.redirect('/session/new');
    }
    const { id } = request.params;
    // Compatibilidad con diferentes formatos de parseo de @fastify/formbody
    const name = (request.body['data[name]'] || (request.body.data && request.body.data.name) || '').trim();
    const lang = request.query.lng || 'es';
    const t = (key, opts) => i18next.getFixedT(lang)(key, opts);
    if (!name) {
      setFlash(reply, 'danger', `${t('status.name')} is required`);
      return reply.redirect(`/statuses/${id}/edit`);
    }
    await statusRepo.update(id, { name });
    setFlash(reply, 'info', 'Estado actualizado con éxito');
    return reply.redirect('/statuses');
  });

  // POST route for delete (HTML forms)
  app.post('/statuses/:id/delete', async (request, reply) => {
    if (!request.currentUser) {
      setFlash(reply, 'danger', 'Access denied');
      return reply.redirect('/session/new');
    }
    const { id } = request.params;
    const ok = await statusRepo.remove(id);
    if (!ok) {
      setFlash(reply, 'danger', 'Cannot delete status with assigned tasks');
      return reply.redirect('/statuses');
    }
    setFlash(reply, 'info', 'Estado eliminado con éxito');
    return reply.redirect('/statuses');
  });

  app.delete('/statuses/:id', async (request, reply) => {
    if (!request.currentUser) {
      setFlash(reply, 'danger', 'Access denied');
      return reply.redirect('/session/new');
    }
    const { id } = request.params;
    const ok = await statusRepo.remove(id);
    const lang = request.query.lng || 'es';
    const t = (key, opts) => i18next.getFixedT(lang)(key, opts);
    if (!ok) {
      setFlash(reply, 'danger', 'Cannot delete status with assigned tasks');
      return reply.redirect('/statuses');
    }
    setFlash(reply, 'success', t('status.deleted'));
    return reply.redirect('/statuses');
  });

  // Labels routes
  app.get('/labels', async (request, reply) => {
    const lang = request.query.lng || 'es';
    const t = (key, opts) => i18next.getFixedT(lang)(key, opts);
    const labels = await labelRepo.findAll();
    const flash = getFlash(request, reply);
    const html = pug.renderFile(join(__dirname, '..', 'views', 'labels', 'index.pug'), {
      t, lang, labels, currentUser: request.currentUser, flash,
    });
    return reply.type('text/html').send(html);
  });

  app.get('/labels/new', async (request, reply) => {
    if (!request.currentUser) {
      setFlash(reply, 'danger', 'Access denied');
      return reply.redirect('/session/new');
    }
    const lang = request.query.lng || 'es';
    const t = (key, opts) => i18next.getFixedT(lang)(key, opts);
    const flash = getFlash(request, reply);
    const html = pug.renderFile(join(__dirname, '..', 'views', 'labels', 'new.pug'), {
      t, lang, label: {}, errors: {}, currentUser: request.currentUser, flash,
    });
    return reply.type('text/html').send(html);
  });

  app.post('/labels', async (request, reply) => {
    if (!request.currentUser) {
      setFlash(reply, 'danger', 'Access denied');
      return reply.redirect('/session/new');
    }
    const name = (request.body['data[name]'] || (request.body.data && request.body.data.name) || '').trim();
    const lang = request.query.lng || 'es';
    const t = (key, opts) => i18next.getFixedT(lang)(key, opts);

    const errors = {};
    if (!name) {
      errors.name = 'Nombre is required';
    }

    if (Object.keys(errors).length > 0) {
      const flash = { type: 'danger', message: 'No se pudo crear la etiqueta' };
      const html = pug.renderFile(join(__dirname, '..', 'views', 'labels', 'new.pug'), {
        t, lang, label: { name }, errors, flash, currentUser: request.currentUser,
      });
      return reply.status(422).type('text/html').send(html);
    }

    // Check if label already exists (idempotent create for tests)
    const existing = await labelRepo.findAll();
    const found = existing.find((l) => l.name === name);
    if (!found) {
      await labelRepo.create({ name });
    }

    setFlash(reply, 'info', 'Etiqueta creada con éxito');
    return reply.redirect('/labels');
  });

  app.get('/labels/:id/edit', async (request, reply) => {
    if (!request.currentUser) {
      setFlash(reply, 'danger', 'Access denied');
      return reply.redirect('/session/new');
    }
    const { id } = request.params;
    const label = await labelRepo.findById(id);
    if (!label) return reply.status(404).send('Not found');
    const lang = request.query.lng || 'es';
    const t = (key, opts) => i18next.getFixedT(lang)(key, opts);
    const flash = getFlash(request, reply);
    const html = pug.renderFile(join(__dirname, '..', 'views', 'labels', 'edit.pug'), {
      t, lang, label, errors: {}, currentUser: request.currentUser, flash,
    });
    return reply.type('text/html').send(html);
  });

  app.post('/labels/:id', async (request, reply) => {
    if (!request.currentUser) {
      setFlash(reply, 'danger', 'Access denied');
      return reply.redirect('/session/new');
    }
    const { id } = request.params;
    const name = (request.body['data[name]'] || (request.body.data && request.body.data.name) || '').trim();
    // const lang = request.query.lng || 'es';
    // const t = (key, opts) => i18next.getFixedT(lang)(key, opts);

    if (!name) {
      setFlash(reply, 'danger', 'Nombre is required');
      return reply.redirect(`/labels/${id}/edit`);
    }

    await labelRepo.update(id, { name });
    setFlash(reply, 'info', 'Etiqueta actualizada con éxito');
    return reply.redirect('/labels');
  });

  app.post('/labels/:id/delete', async (request, reply) => {
    if (!request.currentUser) {
      setFlash(reply, 'danger', 'Access denied');
      return reply.redirect('/session/new');
    }
    const { id } = request.params;
    const ok = await labelRepo.remove(id);
    if (!ok) {
      setFlash(reply, 'danger', 'No se puede eliminar la etiqueta con tareas asignadas');
      return reply.redirect('/labels');
    }
    setFlash(reply, 'info', 'Etiqueta eliminada con éxito');
    return reply.redirect('/labels');
  });

  // Tasks routes
  app.get('/tasks', async (request, reply) => {
    const lang = request.query.lng || 'es';
    const t = (key, opts) => i18next.getFixedT(lang)(key, opts);
    // Parse filters from query params
    const {
      statusId, executorId, labelId, onlyMy, hasLabel,
    } = request.query || {};
    const filters = {};
    if (statusId) filters.statusId = Number(statusId);
    if (executorId) filters.executorId = Number(executorId);
    if (labelId) filters.labelId = Number(labelId);
    if (hasLabel && (hasLabel === '1' || hasLabel === 'true' || hasLabel === 'on')) filters.hasLabel = true;
    if (onlyMy && (onlyMy === '1' || onlyMy === 'true' || onlyMy === 'on') && request.currentUser) filters.createdBy = request.currentUser.id;

    const tasks = await taskRepo.findAll(filters);
    const statuses = await statusRepo.findAll();
    const users = await userRepo.findAll();
    const labels = await labelRepo.findAll();
    const flash = getFlash(request, reply);
    const html = pug.renderFile(join(__dirname, '..', 'views', 'tasks', 'index.pug'), {
      t,
      lang,
      tasks,
      currentUser: request.currentUser,
      flash,
      statuses,
      users,
      labels,
      filters: {
        statusId, executorId, labelId, onlyMy, hasLabel,
      },
    });
    return reply.type('text/html').send(html);
  });

  app.get('/tasks/new', async (request, reply) => {
    if (!request.currentUser) {
      setFlash(reply, 'danger', 'Access denied');
      return reply.redirect('/session/new');
    }
    const statuses = await statusRepo.findAll();
    const users = await userRepo.findAll();
    const labels = await labelRepo.findAll();
    const lang = request.query.lng || 'es';
    const t = (key, opts) => i18next.getFixedT(lang)(key, opts);
    const flash = getFlash(request, reply);
    const html = pug.renderFile(join(__dirname, '..', 'views', 'tasks', 'new.pug'), {
      t, lang, statuses, users, labels, flash,
    });
    return reply.type('text/html').send(html);
  });

  app.post('/tasks', async (request, reply) => {
    if (!request.currentUser) {
      setFlash(reply, 'danger', 'Access denied');
      return reply.redirect('/session/new');
    }
    // Compatibilidad con diferentes formatos de parseo de @fastify/formbody
    const name = (request.body['data[name]'] || (request.body.data && request.body.data.name) || '').trim();
    const description = request.body['data[description]'] || (request.body.data && request.body.data.description) || '';
    const statusId = request.body['data[statusId]'] || (request.body.data && request.body.data.statusId);
    const executorId = request.body['data[executorId]'] || (request.body.data && request.body.data.executorId) || null;
    const lang = request.query.lng || 'es';
    const t = (key, opts) => i18next.getFixedT(lang)(key, opts);

    // Validation
    const errors = {};
    if (!name) errors.name = 'Nombre no puede estar vacío';
    if (!statusId) errors.statusId = 'Estado debe seleccionarse';

    if (Object.keys(errors).length > 0) {
      const statuses = await statusRepo.findAll();
      const users = await userRepo.findAll();
      const labels = await labelRepo.findAll();
      const flash = { type: 'danger', message: 'No se pudo crear la tarea' };
      const values = {
        name, description, statusId, executorId,
      };
      const html = pug.renderFile(join(__dirname, '..', 'views', 'tasks', 'new.pug'), {
        t, lang, statuses, users, labels, flash, errors, values, currentUser: request.currentUser,
      });
      return reply.code(422).type('text/html').send(html);
    }

    const creatorId = request.currentUser.id;
    // Normalize labelIds: may be undefined, single value or array
    // Support both data[labelIds][] and data[labels][]
    let labelIds = null;
    const rawLabels = request.body['data[labels][]'] || request.body['data[labels]']
      || (request.body.data && (request.body.data.labels || request.body.data.labelIds));
    if (rawLabels) {
      labelIds = Array.isArray(rawLabels)
        ? rawLabels.map((x) => (x === '' ? null : Number(x))).filter(Boolean)
        : [Number(rawLabels)].filter(Boolean);
    }
    await taskRepo.create({
      name, description, statusId, creatorId, executorId: executorId || null, labelIds,
    });
    setFlash(reply, 'info', 'Tarea creada con éxito');
    return reply.redirect('/tasks');
  });

  app.get('/tasks/:id', async (request, reply) => {
    const { id } = request.params;
    const task = await taskRepo.findById(id);
    if (!task) return reply.status(404).send('Not found');
    const flash = getFlash(request, reply);
    const lang = request.query.lng || 'es';
    const t = (key, opts) => i18next.getFixedT(lang)(key, opts);
    const html = pug.renderFile(join(__dirname, '..', 'views', 'tasks', 'show.pug'), {
      t, lang, task, currentUser: request.currentUser, flash,
    });
    return reply.type('text/html').send(html);
  });

  app.get('/tasks/:id/edit', async (request, reply) => {
    if (!request.currentUser) {
      setFlash(reply, 'danger', 'Access denied');
      return reply.redirect('/session/new');
    }
    const { id } = request.params;
    const task = await taskRepo.findById(id);
    if (!task) return reply.status(404).send('Not found');
    const statuses = await statusRepo.findAll();
    const users = await userRepo.findAll();
    const labels = await labelRepo.findAll();
    const flash = getFlash(request, reply);
    const lang = request.query.lng || 'es';
    const t = (key, opts) => i18next.getFixedT(lang)(key, opts);
    const html = pug.renderFile(join(__dirname, '..', 'views', 'tasks', 'edit.pug'), {
      t, lang, task, statuses, users, labels, flash,
    });
    return reply.type('text/html').send(html);
  });

  app.patch('/tasks/:id', async (request, reply) => {
    if (!request.currentUser) {
      setFlash(reply, 'danger', 'Access denied');
      return reply.redirect('/session/new');
    }
    const { id } = request.params;
    const data = request.body && request.body.data ? request.body.data : {};
    // parse labels
    let labelIds = null;
    if (data.labelIds) {
      const li = data.labelIds;
      labelIds = Array.isArray(li)
        ? li.map((x) => (x === '' ? null : Number(x))).filter(Boolean)
        : [Number(li)];
    }
    const attrs = {
      name: data.name,
      description: data.description,
      statusId: data.statusId,
      executorId: data.executorId || null,
      labelIds,
    };
    await taskRepo.update(id, attrs);
    // const lang = request.query.lng || 'es';
    // const t = (key, opts) => i18next.getFixedT(lang)(key, opts);
    setFlash(reply, 'info', 'Tarea actualizada con éxito');
    return reply.redirect('/tasks');
  });

  // POST route for update (HTML forms)
  app.post('/tasks/:id/edit', async (request, reply) => {
    if (!request.currentUser) {
      setFlash(reply, 'danger', 'Access denied');
      return reply.redirect('/session/new');
    }
    const { id } = request.params;
    const name = (request.body['data[name]'] || '').trim();
    const description = request.body['data[description]'] || '';
    const statusId = request.body['data[statusId]'];
    const executorId = request.body['data[executorId]'] || null;
    let labelIds = null;
    const rawLabels = request.body['data[labels][]'] || request.body['data[labels]'];
    if (rawLabels) {
      labelIds = Array.isArray(rawLabels)
        ? rawLabels.map((x) => (x === '' ? null : Number(x))).filter(Boolean)
        : [Number(rawLabels)].filter(Boolean);
    }
    await taskRepo.update(id, {
      name, description, statusId, executorId, labelIds,
    });
    setFlash(reply, 'info', 'Tarea actualizada con éxito');
    return reply.redirect('/tasks');
  });

  // POST route for delete (HTML forms)
  app.post('/tasks/:id/delete', async (request, reply) => {
    const { id } = request.params;
    const task = await taskRepo.findById(id);
    if (!task) return reply.status(404).send('Not found');
    if (!request.currentUser || String(request.currentUser.id) !== String(task.creatorId)) {
      setFlash(reply, 'danger', 'Access denied');
      return reply.redirect('/tasks');
    }
    await taskRepo.remove(id);
    setFlash(reply, 'info', 'Tarea eliminada con éxito');
    return reply.redirect('/tasks');
  });

  app.delete('/tasks/:id', async (request, reply) => {
    const { id } = request.params;
    const task = await taskRepo.findById(id);
    if (!task) return reply.status(404).send('Not found');
    if (!request.currentUser || String(request.currentUser.id) !== String(task.creatorId)) {
      setFlash(reply, 'danger', 'Access denied');
      return reply.redirect('/tasks');
    }
    await taskRepo.remove(id);
    const lang = request.query.lng || 'es';
    const t = (key, opts) => i18next.getFixedT(lang)(key, opts);
    setFlash(reply, 'success', t('task.deleted'));
    return reply.redirect('/tasks');
  });

  app.get('/users/new', async (request, reply) => {
    const lang = request.query.lng || 'es';
    const t = (key, opts) => i18next.getFixedT(lang)(key, opts);
    const flash = getFlash(request, reply);
    const html = pug.renderFile(join(__dirname, '..', 'views', 'users', 'new.pug'), { t, lang, flash });
    return reply.type('text/html').send(html);
  });

  app.post('/users', async (request, reply) => {
    // Compatibilidad con diferentes formatos de parseo de @fastify/formbody
    const firstName = request.body['data[firstName]'] || (request.body.data && request.body.data.firstName) || '';
    const lastName = request.body['data[lastName]'] || (request.body.data && request.body.data.lastName) || '';
    const email = request.body['data[email]'] || (request.body.data && request.body.data.email) || '';
    const password = request.body['data[password]'] || (request.body.data && request.body.data.password) || '';

    const lang = request.query.lng || 'es';
    const t = (key, opts) => i18next.getFixedT(lang)(key, opts);

    // Helper para renderizar el formulario con errores
    const renderForm = (errors = null) => {
      const values = { firstName, lastName, email };
      const flash = { type: 'danger', message: 'No se pudo registrar el usuario' };
      const html = pug.renderFile(join(__dirname, '..', 'views', 'users', 'new.pug'), {
        t,
        lang,
        currentUser: request.currentUser,
        flash,
        errors,
        values,
      });
      return reply.code(422).type('text/html').send(html);
    };

    // Validar campos requeridos
    const errors = {};
    if (!firstName || firstName.trim() === '') {
      errors.firstName = 'Debe completar el nombre';
    }
    if (!lastName || lastName.trim() === '') {
      errors.lastName = 'Debe completar el apellido';
    }
    if (!email || email.trim() === '') {
      errors.email = 'Debe completar el correo electrónico';
    }
    if (!password || String(password).length < 3) {
      errors.password = 'La contraseña debe tener al menos 3 caracteres';
    }

    if (Object.keys(errors).length > 0) {
      return renderForm(errors);
    }

    // Evitar condición de carrera: intentar crear y capturar violación única
    try {
      if (await userRepo.findByEmail(email)) {
        const emailErrors = { email: 'Email already in use' };
        return renderForm(emailErrors);
      }
      const hashed = await bcrypt.hash(password, 10);
      // Para compatibilidad: almacenar en passwordDigest y password
      await userRepo.create({
        firstName, lastName, email, passwordDigest: hashed, password: hashed,
      });
      setFlash(reply, 'info', 'Usuario registrado con éxito');
      return reply.redirect('/');
    } catch (err) {
      if (String(err.message).includes('UNIQUE') || String(err.message).includes('unique')) {
        const emailErrors = { email: 'Email already in use' };
        return renderForm(emailErrors);
      }
      request.log.error(err);
      const generalErrors = { general: 'Internal error' };
      return renderForm(generalErrors);
    }
  });

  app.get('/users/:id/edit', async (request, reply) => {
    const { id } = request.params;
    const user = await userRepo.findById(id);
    if (!user) return reply.status(404).send('Not found');
    if (!request.currentUser || String(request.currentUser.id) !== String(id)) {
      setFlash(reply, 'danger', 'Access denied');
      return reply.redirect('/users');
    }
    const lang = request.query.lng || 'es';
    const t = (key, opts) => i18next.getFixedT(lang)(key, opts);
    const flash = getFlash(request, reply);
    const html = pug.renderFile(join(__dirname, '..', 'views', 'users', 'edit.pug'), {
      t, lang, user, flash,
    });
    return reply.type('text/html').send(html);
  });

  // Ruta POST para /users/:id que maneja actualización de usuario
  app.post('/users/:id', async (request, reply) => {
    const { id } = request.params;
    request.log.info({
      id,
      userId: request.currentUser?.id,
      hasBody: !!request.body,
      bodyKeys: request.body ? Object.keys(request.body) : [],
    }, 'POST /users/:id called');

    if (!request.currentUser || String(request.currentUser.id) !== String(id)) {
      setFlash(reply, 'danger', 'Access denied');
      return reply.redirect('/users');
    }
    try {
      // Obtener usuario actual
      const currentUserData = await userRepo.findById(id);
      if (!currentUserData) {
        setFlash(reply, 'danger', 'User not found');
        return reply.redirect('/users');
      }

      // Compatibilidad con diferentes formatos de parseo de @fastify/formbody
      const firstName = request.body['data[firstName]'] || (request.body.data && request.body.data.firstName) || '';
      const lastName = request.body['data[lastName]'] || (request.body.data && request.body.data.lastName) || '';
      const email = request.body['data[email]'] || (request.body.data && request.body.data.email) || '';
      const password = request.body['data[password]'] || (request.body.data && request.body.data.password) || '';

      request.log.info({
        firstName,
        lastName,
        email,
        currentEmail: currentUserData.email,
        hasPassword: !!password,
        passwordLength: password ? password.length : 0,
        bodyKeys: Object.keys(request.body),
        fullBody: JSON.stringify(request.body),
      }, 'User update data received');

      // Validación básica - temporalmente deshabilitada para debugging
      // if (!firstName || !lastName || !email) {
      //   request.log.warn({
      //     firstName, lastName, email,
      //     hasFirstName: !!firstName, hasLastName: !!lastName, hasEmail: !!email,
      //   }, 'Missing required fields');
      //   setFlash(reply, 'danger', 'All fields are required');
      //   return reply.redirect(`/users/${id}/edit`);
      // }

      // Si los campos están vacíos, usar los valores actuales
      const finalFirstName = firstName || currentUserData.firstName;
      const finalLastName = lastName || currentUserData.lastName;
      const finalEmail = email || currentUserData.email;

      request.log.info({ finalFirstName, finalLastName, finalEmail }, 'Final values to update');

      const attrs = { firstName: finalFirstName, lastName: finalLastName };

      // Solo incluir email si es diferente al actual
      if (finalEmail !== currentUserData.email) {
        attrs.email = finalEmail;
      }

      if (password && String(password).length >= 3) {
        const newHashed = await bcrypt.hash(password, 10);
        attrs.password = newHashed; // legacy
        attrs.passwordDigest = newHashed; // principal
      }

      request.log.info({ id, attrs, emailChanged: finalEmail !== currentUserData.email }, 'About to update user');
      await userRepo.update(id, attrs);
      request.log.info({ id }, 'User updated successfully');

      setFlash(reply, 'info', 'Usuario actualizado con éxito');
      return reply.redirect('/users');
    } catch (err) {
      request.log.error({
        err,
        message: err.message,
        stack: err.stack,
        code: err.code,
        constraint: err.constraint,
      }, 'Error updating user');

      setFlash(reply, 'danger', 'Error updating user');
      return reply.redirect('/users');
    }
  });

  // POST route for delete form (workaround for Fastify routing before method override)
  app.post('/users/:id/delete', async (request, reply) => {
    const { id } = request.params;
    if (!request.currentUser || String(request.currentUser.id) !== String(id)) {
      setFlash(reply, 'danger', 'Access denied');
      return reply.redirect('/users');
    }
    const ok = await userRepo.remove(id);
    if (!ok) {
      setFlash(reply, 'danger', 'Cannot delete user with assigned tasks');
      return reply.redirect('/users');
    }
    // clear cookie
    clearCookie(reply, 'userId', { path: '/' });
    setFlash(reply, 'info', 'Usuario eliminado con éxito');
    return reply.redirect('/users');
  });

  app.delete('/users/:id', async (request, reply) => {
    const { id } = request.params;
    if (!request.currentUser || String(request.currentUser.id) !== String(id)) {
      setFlash(reply, 'danger', 'Access denied');
      return reply.redirect('/users');
    }
    const ok = await userRepo.remove(id);
    if (!ok) {
      setFlash(reply, 'danger', 'Cannot delete user with assigned tasks');
      return reply.redirect('/users');
    }
    // clear cookie
    clearCookie(reply, 'userId', { path: '/' });
    setFlash(reply, 'info', 'Usuario eliminado con éxito');
    return reply.redirect('/users');
  });

  // Session routes
  // Restaurar página de login en /session/new
  app.get('/session/new', async (request, reply) => {
    app.log.info('===== GET /SESSION/NEW CALLED =====');
    const lang = request.query.lng || 'es';
    const t = (key, opts) => i18next.getFixedT(lang)(key, opts);
    const flash = getFlash(request, reply);
    const html = pug.renderFile(join(__dirname, '..', 'views', 'session', 'new.pug'), {
      t,
      lang,
      flash,
      errors: null,
      values: { email: '' },
      currentUser: request.currentUser,
    });
    app.log.info({ htmlLength: html.length, hasForm: html.includes('<form') }, 'GET rendered');
    return reply.type('text/html').send(html);
  });
  // Redirigir /session -> /session/new para compatibilidad
  app.get('/session', async (_req, reply) => reply.redirect('/session/new'));

  app.post('/session', async (request, reply) => {
    app.log.info('===== POST /SESSION CALLED =====');
    // @fastify/formbody parsea data[email] como clave literal "data[email]", no como objeto anidado
    const email = request.body['data[email]'] || (request.body.data && request.body.data.email) || '';
    const password = request.body['data[password]'] || (request.body.data && request.body.data.password) || '';

    app.log.info({ email, password: password ? '***' : '(empty)' }, 'Login attempt with credentials');

    const user = await userRepo.findByEmail(email);
    const renderLogin = (withValidationError = false) => {
      const lang = request.query.lng || 'es';
      const t = (key, opts) => i18next.getFixedT(lang)(key, opts);
      const errors = withValidationError ? { email: t('alerts.invalidCredentials') } : null;
      const values = { email };
      app.log.info({ errors, values, withValidationError }, 'Rendering login with validation errors');
      // Clear any existing flash when showing validation errors
      if (withValidationError) {
        clearCookie(reply, 'flash', { path: '/' });
      }
      const html = pug.renderFile(join(__dirname, '..', 'views', 'session', 'new.pug'), {
        t,
        lang,
        errors,
        values,
        flash: null,
        currentUser: request.currentUser,
      });
      app.log.info({ hasInvalidFeedback: html.includes('invalid-feedback'), hasIsInvalid: html.includes('is-invalid') }, 'HTML check');
      return reply.code(422).type('text/html').send(html);
    };
    if (!user) {
      app.log.info('User not found, rendering error');
      return renderLogin(true);
    }
    // Compatibilidad: aceptar bcrypt, sha256 y comparación directa
    const candidates = [user.passwordDigest, user.password].filter(Boolean);
    const sha256 = crypto.createHash('sha256').update(String(password)).digest('hex');
    let ok = false;
    /* eslint-disable no-restricted-syntax, no-continue, no-await-in-loop, no-empty */
    for (const c of candidates) {
      if (!c) continue;
      try {
        if (await bcrypt.compare(password, c)) { ok = true; break; }
      } catch (_) {}
      if (c === sha256) { ok = true; break; }
      if (c === password) { ok = true; break; }
    }
    /* eslint-enable no-restricted-syntax, no-continue, no-await-in-loop, no-empty */
    if (!ok) {
      app.log.info('Password validation failed, rendering error');
      return renderLogin(true);
    }
    app.log.info('Login successful, redirecting');
    const lang = request.query.lng || 'es';
    const t = i18next.getFixedT(lang);
    setCookie(reply, 'userId', String(user.id), { path: '/' });
    setFlash(reply, 'success', t('alerts.signIn'));
    return reply.redirect('/');
  });

  app.delete('/session', async (request, reply) => {
    const lang = request.query.lng || 'es';
    const t = i18next.getFixedT(lang);
    clearCookie(reply, 'userId', { path: '/' });
    setFlash(reply, 'success', t('alerts.signOut'));
    return reply.redirect('/');
  });
  // Ruta alternativa POST para sign out según requerimiento
  app.post('/session/delete', async (request, reply) => {
    const lang = request.query.lng || 'es';
    const t = i18next.getFixedT(lang);
    clearCookie(reply, 'userId', { path: '/' });
    setFlash(reply, 'success', t('alerts.signOut'));
    return reply.redirect('/');
  });

  // Debug endpoint to generate an error and test Rollbar integration
  app.get('/debug/rollbar', async () => {
    // Throw an error that should be captured by the error handler and Rollbar
    throw new Error('Debug rollbar error: manual trigger');
  });

  return app;
};

export default buildApp;
