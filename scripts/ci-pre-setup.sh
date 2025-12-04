#!/bin/sh
# scripts/ci-pre-setup.sh
# Script para preparar el entorno CI antes del setup

# Crear enlace simbólico o copiar migraciones a /project/migrations
if [ -d "/project/code/migrations" ]; then
  if [ ! -d "/project/migrations" ]; then
    ln -sf /project/code/migrations /project/migrations || cp -r /project/code/migrations /project/migrations
    echo "Created /project/migrations from /project/code/migrations"
  fi
elif [ -d "/project/knex-migrations" ]; then
  if [ ! -d "/project/migrations" ]; then
    ln -sf /project/knex-migrations /project/migrations || cp -r /project/knex-migrations /project/migrations
    echo "Created /project/migrations from /project/knex-migrations"
  fi
fi
