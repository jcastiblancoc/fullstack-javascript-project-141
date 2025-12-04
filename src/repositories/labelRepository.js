import knex from '../db.js';

export const findAll = async () => knex('labels').select('*');

export const findById = async (id) => knex('labels').where({ id }).first();

export const create = async (attrs) => {
  const [id] = await knex('labels').insert(attrs);
  return findById(id);
};

export const update = async (id, attrs) => {
  await knex('labels').where({ id }).update(attrs);
  return findById(id);
};

export const remove = async (id) => {
  // Prevent deletion if any task references this label
  const tasks = await knex('tasks_labels').where({ labelId: id }).count({ c: 'taskId' }).first();
  const count = Number(tasks.c || 0);
  if (count > 0) return false;
  const deleted = await knex('labels').where({ id }).del();
  return deleted > 0;
};

export default {
  findAll, findById, create, update, remove,
};
