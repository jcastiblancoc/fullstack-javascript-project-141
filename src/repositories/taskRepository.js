import knex from '../db.js';

export const findAll = async (filters = {}) => {
  const q = knex('tasks')
    .select(
      'tasks.*',
      'statuses.name as statusName',
      'u1.firstName as creatorFirstName',
      'u1.lastName as creatorLastName',
      'u2.firstName as executorFirstName',
      'u2.lastName as executorLastName',
    )
    .leftJoin('statuses', 'tasks.statusId', 'statuses.id')
    .leftJoin('users as u1', 'tasks.creatorId', 'u1.id')
    .leftJoin('users as u2', 'tasks.executorId', 'u2.id');

  if (filters.statusId) {
    q.where('tasks.statusId', filters.statusId);
  }
  if (filters.executorId) {
    q.where('tasks.executorId', filters.executorId);
  }
  if (filters.createdBy) {
    q.where('tasks.creatorId', filters.createdBy);
  }

  // If filtering by labelId or by presence of labels, join tasks_labels
  const needLabelJoin = filters.labelId || filters.hasLabel;
  if (needLabelJoin) {
    q.leftJoin('tasks_labels', 'tasks.id', 'tasks_labels.taskId');
    if (filters.labelId) {
      q.where('tasks_labels.labelId', filters.labelId);
    }
    if (filters.hasLabel && !filters.labelId) {
      q.whereNotNull('tasks_labels.labelId');
    }
    q.groupBy('tasks.id');
  }

  const rows = await q;
  if (!rows || !rows.length) return [];

  // Load labels for all tasks in one query
  const ids = rows.map((r) => r.id);
  const labelsRows = await knex('tasks_labels').whereIn('taskId', ids).join('labels', 'tasks_labels.labelId', 'labels.id').select('tasks_labels.taskId', 'labels.id', 'labels.name');
  /* eslint-disable no-param-reassign */
  const labelsByTask = labelsRows.reduce((acc, l) => {
    acc[l.taskId] = acc[l.taskId] || [];
    acc[l.taskId].push({ id: l.id, name: l.name });
    return acc;
  }, {});
  /* eslint-enable no-param-reassign */

  return rows.map((r) => {
    const labels = labelsByTask[r.id] || [];
    return { ...r, labels, labelIds: labels.map((x) => x.id) };
  });
};

export const findById = async (id) => {
  const task = await knex('tasks').where({ 'tasks.id': id })
    .select(
      'tasks.*',
      'statuses.name as statusName',
      'u1.firstName as creatorFirstName',
      'u1.lastName as creatorLastName',
      'u2.firstName as executorFirstName',
      'u2.lastName as executorLastName',
    )
    .leftJoin('statuses', 'tasks.statusId', 'statuses.id')
    .leftJoin('users as u1', 'tasks.creatorId', 'u1.id')
    .leftJoin('users as u2', 'tasks.executorId', 'u2.id')
    .first();
  if (!task) return null;
  const labels = await knex('tasks_labels').where({ taskId: id }).join('labels', 'tasks_labels.labelId', 'labels.id').select('labels.id', 'labels.name');
  task.labels = labels;
  task.labelIds = labels.map((l) => l.id);
  return task;
};

export const create = async (attrs) => {
  // Idempotent: check if task with same name exists
  const existing = await knex('tasks').where({ name: attrs.name }).first();
  if (existing) {
    return findById(existing.id);
  }
  const labels = attrs.labelIds || null;
  const insertAttrs = { ...attrs };
  delete insertAttrs.labelIds;
  const [id] = await knex('tasks').insert(insertAttrs);
  if (labels && Array.isArray(labels)) {
    const rows = labels.filter(Boolean).map((labelId) => ({ taskId: id, labelId }));
    if (rows.length) await knex('tasks_labels').insert(rows);
  }
  return findById(id);
};

export const update = async (id, attrs) => {
  const labels = attrs.labelIds || null;
  const updateAttrs = { ...attrs };
  delete updateAttrs.labelIds;
  await knex('tasks').where({ id }).update(updateAttrs);
  if (labels) {
    // replace labels
    await knex('tasks_labels').where({ taskId: id }).del();
    const rows = Array.isArray(labels)
      ? labels.filter(Boolean).map((labelId) => ({ taskId: id, labelId }))
      : [];
    if (rows.length) await knex('tasks_labels').insert(rows);
  }
  return findById(id);
};

export const remove = async (id) => {
  const deleted = await knex('tasks').where({ id }).del();
  return deleted > 0;
};

export default {
  findAll, findById, create, update, remove,
};
