// migrations/20240101000003_create_tasks.cjs
exports.up = async function(knex) {
  const exists = await knex.schema.hasTable('tasks');
  if (exists) return;
  await knex.schema.createTable('tasks', (table) => {
    table.increments('id').primary();
    table.string('name').notNullable();
    table.text('description');
    table.integer('statusId').notNullable().references('id').inTable('statuses').onDelete('RESTRICT');
    table.integer('creatorId').notNullable().references('id').inTable('users').onDelete('RESTRICT');
    table.integer('executorId').references('id').inTable('users').onDelete('SET NULL');
    table.timestamps(true, true);
  });
};

exports.down = async function(knex) {
  const exists = await knex.schema.hasTable('tasks');
  if (!exists) return;
  await knex.schema.dropTable('tasks');
};
