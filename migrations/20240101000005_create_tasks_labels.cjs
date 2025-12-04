// migrations/20240101000005_create_tasks_labels.cjs
exports.up = async function(knex) {
  const exists = await knex.schema.hasTable('tasks_labels');
  if (exists) return;
  await knex.schema.createTable('tasks_labels', (table) => {
    table.integer('taskId').notNullable().references('id').inTable('tasks').onDelete('CASCADE');
    table.integer('labelId').notNullable().references('id').inTable('labels').onDelete('RESTRICT');
    table.primary(['taskId', 'labelId']);
  });
};

exports.down = async function(knex) {
  const exists = await knex.schema.hasTable('tasks_labels');
  if (!exists) return;
  await knex.schema.dropTable('tasks_labels');
};
