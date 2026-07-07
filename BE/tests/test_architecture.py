"""Executable dependency rules for the modular-monolith architecture."""

import ast
from pathlib import Path

APP_ROOT = Path(__file__).parents[1] / "app"

FORBIDDEN_IMPORTS = {
    "routers": (
        "app.infrastructure",
        "app.models",
        "app.repositories",
        "app.workers",
    ),
    "repositories": (
        "app.infrastructure",
        "app.routers",
        "app.services",
        "app.workers",
    ),
    "models": (
        "app.infrastructure",
        "app.repositories",
        "app.routers",
        "app.services",
        "app.workers",
    ),
    "schemas": (
        "app.infrastructure",
        "app.models",
        "app.repositories",
        "app.routers",
        "app.services",
        "app.workers",
    ),
    "services": ("app.routers", "app.workers"),
    "workers/tasks": ("app.models", "app.repositories", "app.routers"),
}


def _python_files(layer: str) -> list[Path]:
    return list((APP_ROOT / layer).rglob("*.py"))


def _imports(tree: ast.AST) -> list[tuple[int, str]]:
    found: list[tuple[int, str]] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            found.extend((node.lineno, alias.name) for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            found.append((node.lineno, node.module))
    return found


def test_layer_dependency_direction() -> None:
    violations: list[str] = []
    for layer, forbidden_prefixes in FORBIDDEN_IMPORTS.items():
        for path in _python_files(layer):
            tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
            for line, imported in _imports(tree):
                if imported.startswith(forbidden_prefixes):
                    relative = path.relative_to(APP_ROOT.parent)
                    violations.append(f"{relative}:{line} imports {imported}")
    assert not violations, "Forbidden layer dependencies:\n" + "\n".join(violations)


def test_services_do_not_execute_sqlalchemy_sessions_directly() -> None:
    forbidden_methods = {"execute", "delete", "get"}
    violations: list[str] = []
    for path in _python_files("services"):
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        for node in ast.walk(tree):
            if not isinstance(node, ast.Call) or not isinstance(node.func, ast.Attribute):
                continue
            owner = node.func.value
            if (
                isinstance(owner, ast.Name)
                and owner.id == "db"
                and node.func.attr in forbidden_methods
            ):
                relative = path.relative_to(APP_ROOT.parent)
                violations.append(f"{relative}:{node.lineno} calls db.{node.func.attr}()")
    assert not violations, "SQL belongs in repositories:\n" + "\n".join(violations)
