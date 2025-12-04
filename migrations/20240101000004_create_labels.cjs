// migrations/20240101000004_create_labels.cjs
exports.up = async function(knex) {
  const exists = await knex.schema.hasTable('labels');
  if (exists) return;
  await knex.schema.createTable('labels', (table) => {
    table.increments('id').primary();
    table.string('name').notNullable();
    table.timestamps(true, true);
  });
};

exports.down = async function(knex) {
  const exists = await knex.schema.hasTable('labels');
  if (!exists) return;
  await knex.schema.dropTable('labels');
};
