import knex from '../db.js';

export const findAll = async () => knex('users').select('*');
export const findById = async (id) => knex('users').where({ id }).first();
export const findByEmail = async (email) => knex('users').where({ email }).first();

export const create = async (attrs) => {
  const [id] = await knex('users').insert(attrs);
  return findById(id);
};

export const update = async (id, attrs) => {
  await knex('users').where({ id }).update(attrs);
  return findById(id);
};

export const remove = async (id) => {
  const tasksAsCreator = await knex('tasks').where({ creatorId: id }).count({ c: 'id' }).first();
  const tasksAsExecutor = await knex('tasks').where({ executorId: id }).count({ c: 'id' }).first();
  const count = Number(tasksAsCreator.c || 0) + Number(tasksAsExecutor.c || 0);
  if (count > 0) return false;
  const deleted = await knex('users').where({ id }).del();
  return deleted > 0;
};

export default {
  findAll, findById, findByEmail, create, update, remove,
};
