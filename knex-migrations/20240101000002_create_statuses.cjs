// migrations/20240101000002_create_statuses.cjs
exports.up = function(knex) {
  return knex.schema.createTable('statuses', (table) => {
    table.increments('id').primary();
    table.string('name').notNullable();
    table.timestamps(true, true);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('statuses');
};
