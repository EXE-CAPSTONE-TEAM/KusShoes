#!/bin/bash
set -e

echo "⏳ Waiting for database to be ready..."
# Thêm wait loop phòng trường hợp healthcheck chưa kịp pass
until python -c "
import asyncio, asyncpg, os
async def check():
    await asyncpg.connect(os.environ['DATABASE_URL'].replace('postgresql+asyncpg', 'postgresql'))
asyncio.run(check())
" 2>/dev/null; do
    echo "   DB not ready yet, retrying in 1s..."
    sleep 1
done
echo "✅ Database is ready"

echo "⏳ Running database migrations..."
alembic upgrade head
echo "✅ Migrations complete"

echo "🚀 Starting application..."
exec "$@"
