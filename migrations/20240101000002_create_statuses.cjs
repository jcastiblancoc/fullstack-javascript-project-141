// migrations/20240101000002_create_statuses.cjs
exports.up = async function(knex) {
  const exists = await knex.schema.hasTable('statuses');
  if (exists) return;
  await knex.schema.createTable('statuses', (table) => {
    table.increments('id').primary();
    table.string('name').notNullable();
    table.timestamps(true, true);
  });
};

exports.down = async function(knex) {
  const exists = await knex.schema.hasTable('statuses');
  if (!exists) return;
  await knex.schema.dropTable('statuses');
};
