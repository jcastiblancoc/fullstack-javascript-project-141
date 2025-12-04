// migrations/20240101000005_create_tasks_labels.cjs
exports.up = function(knex) {
  return knex.schema.createTable('tasks_labels', (table) => {
    table.integer('taskId').notNullable().references('id').inTable('tasks').onDelete('CASCADE');
    table.integer('labelId').notNullable().references('id').inTable('labels').onDelete('RESTRICT');
    table.primary(['taskId', 'labelId']);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('tasks_labels');
};
