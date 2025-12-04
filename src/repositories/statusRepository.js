import knex from '../db.js';

export const findAll = async () => knex('statuses').select('*');

export const findById = async (id) => knex('statuses').where({ id }).first();

export const create = async (attrs) => {
  const [id] = await knex('statuses').insert(attrs);
  return findById(id);
};

export const update = async (id, attrs) => {
  await knex('statuses').where({ id }).update(attrs);
  return findById(id);
};

export const remove = async (id) => {
  // Prevent deletion if any task references this status
  const tasks = await knex('tasks').where({ statusId: id }).count({ c: 'id' }).first();
  const count = Number(tasks.c || 0);
  if (count > 0) return false;
  const deleted = await knex('statuses').where({ id }).del();
  return deleted > 0;
};

export default {
  findAll, findById, create, update, remove,
};
