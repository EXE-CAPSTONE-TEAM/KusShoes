# KusShoes BE — Developer Commands
# Dùng: make <target>

.PHONY: help up down build restart logs ps \
        migrate makemigration downgrade \
        test lint shell \
        db-shell redis-shell create-admin

# ── Default ────────────────────────────────────
help:
	@echo ""
	@echo "KusShoes BE — Available commands:"
	@echo ""
	@echo "  Setup"
	@echo "    make build        Build Docker images"
	@echo "    make up           Start all services"
	@echo "    make down         Stop all services"
	@echo "    make restart      Restart API (sau khi đổi deps)"
	@echo ""
	@echo "  Database"
	@echo "    make migrate                    Chạy tất cả migrations"
	@echo "    make makemigration name=<desc>  Tạo migration mới (autogenerate)"
	@echo "    make downgrade                  Rollback 1 migration"
	@echo ""
	@echo "  Development"
	@echo "    make test         Chạy pytest"
	@echo "    make lint         Chạy ruff check"
	@echo "    make shell        Bash vào container api"
	@echo "    make logs         Xem logs realtime"
	@echo "    make ps           Xem trạng thái containers"
	@echo ""
	@echo "  Database tools"
	@echo "    make db-shell     psql vào PostgreSQL"
	@echo "    make redis-shell  redis-cli"
	@echo ""

# ── Docker lifecycle ────────────────────────────
build:
	docker compose build

up:
	docker compose up -d
	@echo ""
	@echo "✅ Services started:"
	@echo "   API:          http://localhost:8000"
	@echo "   Swagger:      http://localhost:8000/docs"
	@echo "   MinIO Console: http://localhost:9001  (minioadmin/minioadmin)"
	@echo ""

down:
	docker compose down

restart:
	docker compose restart api worker beat

logs:
	docker compose logs -f $(if $(service),$(service),api)

ps:
	docker compose ps

# ── Database migrations ─────────────────────────
migrate:
	docker compose exec api alembic upgrade head

# Dùng: make makemigration name="add user bio field"
makemigration:
	@if [ -z "$(name)" ]; then echo "❌ Thiếu tên: make makemigration name='mô tả'"; exit 1; fi
	docker compose exec api alembic revision --autogenerate -m "$(name)"

downgrade:
	docker compose exec api alembic downgrade -1

# Tạo admin đầu tiên: make create-admin (hoặc set ADMIN_EMAIL/ADMIN_USERNAME/ADMIN_PASSWORD)
create-admin:
	docker compose exec api python -m scripts.create_admin

# ── Development ─────────────────────────────────
test-db-setup:
	docker compose exec db psql -U kusshoes -c "CREATE DATABASE kusshoes_test" 2>/dev/null || true
	docker compose exec api bash -c "DATABASE_URL=postgresql+asyncpg://kusshoes:kusshoes@db:5432/kusshoes_test alembic upgrade head"

test:
	docker compose exec api pytest -v --tb=short

lint:
	docker compose exec api ruff check app/

shell:
	docker compose exec api bash

# ── Database tools ───────────────────────────────
db-shell:
	docker compose exec db psql -U kusshoes -d kusshoes

redis-shell:
	docker compose exec redis redis-cli
