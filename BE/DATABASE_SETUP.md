# Database setup

KusShoes uses Neon PostgreSQL as its primary database. The local PostgreSQL
container is an explicit development fallback only; the application does not
automatically fail over between databases because that would split data across
two independent sources.

## Primary mode: Neon

1. Copy `BE/.env.example` to `BE/.env`.
2. In Neon Console, select the intended project, branch, and database.
3. Copy the **Direct connection** string into `DATABASE_URL`.
4. Use the SQLAlchemy async driver and SSL parameter:

   ```env
   DATABASE_URL=postgresql+asyncpg://ROLE:PASSWORD@ENDPOINT.neon.tech/DATABASE?ssl=require
   ```

5. Start the backend stack without local PostgreSQL:

   ```powershell
   docker compose up -d
   ```

The API entrypoint waits for Neon and applies Alembic migrations before the
application starts.

## Fallback mode: local PostgreSQL

Use this only when Neon is unavailable:

```powershell
docker compose -f docker-compose.yml -f docker-compose.local-db.yml --profile local-db up -d
```

The override points API, worker, and beat to the `db` container. The local
database uses the persistent `postgres_data` Docker volume.

To return to Neon, stop the stack and start it again without the local override:

```powershell
docker compose --profile local-db down
docker compose up -d
```

Do not run both database modes as writable production sources. Data created in
the local fallback database is not automatically synchronized back to Neon.
