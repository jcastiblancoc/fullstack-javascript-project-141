// migrations/20240101000001_create_users.cjs
exports.up = async function(knex) {
  const exists = await knex.schema.hasTable('users');
  if (exists) return; // idempotencia en CI
  await knex.schema.createTable('users', (table) => {
    table.increments('id').primary();
    table.string('firstName').notNullable().default('');
    table.string('lastName').notNullable().default('');
    table.string('email').notNullable().unique();
    table.string('password').notNullable().default('');
    table.string('passwordDigest').notNullable().default('');
    table.timestamps(true, true);
  });
};

exports.down = async function(knex) {
  const exists = await knex.schema.hasTable('users');
  if (!exists) return;
  await knex.schema.dropTable('users');
};
