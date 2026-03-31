"""Архитектурные тесты, которые фиксируют границы модульного backend."""

from __future__ import annotations

import ast
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[2]
BACKEND_ROOT = PROJECT_ROOT / "backend"
PLATFORM_ROOT = BACKEND_ROOT / "platform"
GAMES_ROOT = BACKEND_ROOT / "games"
SHARED_ROOT = BACKEND_ROOT / "shared"


def _python_files(root: Path) -> list[Path]:
    """Возвращает все python-файлы пакета без служебного `__pycache__`."""
    return [path for path in root.rglob("*.py") if "__pycache__" not in path.parts]


def _imported_modules(path: Path) -> set[str]:
    """Собирает импортируемые модули файла через AST без выполнения кода."""
    modules: set[str] = set()
    tree = ast.parse(path.read_text(encoding="utf-8-sig"), filename=str(path))
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                modules.add(alias.name)
        elif isinstance(node, ast.ImportFrom) and node.module:
            modules.add(node.module)
    return modules


def test_platform_modules_do_not_import_games() -> None:
    """Платформенные домены не должны зависеть от игровых модулей."""
    violations: list[str] = []
    for path in _python_files(PLATFORM_ROOT):
        forbidden = sorted(
            module
            for module in _imported_modules(path)
            if module.startswith("backend.games.")
        )
        if forbidden:
            violations.append(f"{path.relative_to(PROJECT_ROOT)} -> {', '.join(forbidden)}")

    assert not violations, "Platform imports games:\n" + "\n".join(violations)


def test_games_do_not_import_each_other() -> None:
    """Игровой модуль может зависеть только от себя, app, platform и shared."""
    game_names = {
        path.name
        for path in GAMES_ROOT.iterdir()
        if path.is_dir() and not path.name.startswith("__")
    }
    violations: list[str] = []

    for game_name in game_names:
        game_root = GAMES_ROOT / game_name
        for path in _python_files(game_root):
            forbidden = sorted(
                module
                for module in _imported_modules(path)
                if any(
                    module.startswith(f"backend.games.{other_game}")
                    for other_game in game_names
                    if other_game != game_name
                )
            )
            if forbidden:
                violations.append(f"{path.relative_to(PROJECT_ROOT)} -> {', '.join(forbidden)}")

    assert not violations, "Games import each other:\n" + "\n".join(violations)


def test_shared_does_not_depend_on_domain_packages() -> None:
    """Пакет shared должен оставаться независимым от app/platform/games."""
    violations: list[str] = []
    for path in _python_files(SHARED_ROOT):
        forbidden = sorted(
            module
            for module in _imported_modules(path)
            if module.startswith(("backend.app", "backend.platform", "backend.games"))
        )
        if forbidden:
            violations.append(f"{path.relative_to(PROJECT_ROOT)} -> {', '.join(forbidden)}")

    assert not violations, "Shared imports domain packages:\n" + "\n".join(violations)
