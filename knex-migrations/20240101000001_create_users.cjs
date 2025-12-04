// migrations/20240101000001_create_users.cjs
exports.up = function(knex) {
  return knex.schema.createTable('users', (table) => {
    table.increments('id').primary();
    table.string('firstName').notNullable();
    table.string('lastName').notNullable();
    table.string('email').notNullable().unique();
    table.string('password').notNullable();
    table.timestamps(true, true);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('users');
};
