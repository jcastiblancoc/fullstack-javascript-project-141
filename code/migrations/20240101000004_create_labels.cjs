// migrations/20240101000004_create_labels.cjs
exports.up = function(knex) {
  return knex.schema.createTable('labels', (table) => {
    table.increments('id').primary();
    table.string('name').notNullable();
    table.timestamps(true, true);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('labels');
};
