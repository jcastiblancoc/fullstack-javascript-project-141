// migrations/20240101000006_remove_email_unique_constraint.cjs
exports.up = async function(knex) {
  // SQLite no soporta DROP CONSTRAINT directamente
  // Necesitamos recrear la tabla sin la restricción UNIQUE en email
  
  // 1. Crear tabla temporal
  await knex.schema.createTable('users_temp', (table) => {
    table.increments('id').primary();
    table.string('firstName').notNullable().default('');
    table.string('lastName').notNullable().default('');
    table.string('email').notNullable(); // SIN .unique()
    table.string('password').notNullable().default('');
    table.string('passwordDigest').notNullable().default('');
    table.timestamps(true, true);
  });
  
  // 2. Copiar datos
  await knex.raw('INSERT INTO users_temp SELECT * FROM users');
  
  // 3. Eliminar tabla original
  await knex.schema.dropTable('users');
  
  // 4. Renombrar tabla temporal
  await knex.schema.renameTable('users_temp', 'users');
};

exports.down = async function(knex) {
  // Para revertir, recreamos con la restricción UNIQUE
  await knex.schema.createTable('users_temp', (table) => {
    table.increments('id').primary();
    table.string('firstName').notNullable().default('');
    table.string('lastName').notNullable().default('');
    table.string('email').notNullable().unique();
    table.string('password').notNullable().default('');
    table.string('passwordDigest').notNullable().default('');
    table.timestamps(true, true);
  });
  
  await knex.raw('INSERT INTO users_temp SELECT * FROM users');
  await knex.schema.dropTable('users');
  await knex.schema.renameTable('users_temp', 'users');
};
