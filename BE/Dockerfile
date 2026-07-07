FROM python:3.12-slim@sha256:423ed6ab25b1921a477529254bfeeabf5855151dc2c3141699a1bfc852199fbf

WORKDIR /app

# Lấy uv binary từ official image — nhanh hơn pip install uv
COPY --from=ghcr.io/astral-sh/uv@sha256:3d868e555f8f1dbc324afa005066cd11e1053fc4743b9808ca8025283e65efa5 /uv /usr/local/bin/uv

# Cài dependencies trước — Docker layer cache: chỉ rebuild khi pyproject.toml thay đổi
COPY pyproject.toml .

# Cài tất cả deps bao gồm dev group (pytest, ruff)
# Source code được mount qua volume trong dev, nên cài editable với stub trước
RUN uv pip install --system --no-cache -e ".[dev]" || true

# Copy toàn bộ source (dùng trong production; trong dev bị override bởi volume)
COPY . .

# Cài lại sau khi có source đầy đủ (resolve editable install)
RUN uv pip install --system --no-cache -e ".[dev]"

# entrypoint script chạy migrations trước khi start app
RUN groupadd --system --gid 10001 app \
    && useradd --system --uid 10001 --gid app --home-dir /app app \
    && chown -R app:app /app \
    && chmod +x /app/entrypoint.sh

USER app

EXPOSE 8000

ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
