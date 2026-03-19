#!/usr/bin/env python3
"""
Скрипт для инициализации БД PostgreSQL
Запустите этот скрипт один раз для создания всех таблиц
"""

import os
import sys
from pathlib import Path

# Добавить текущую папку в sys.path
sys.path.insert(0, str(Path(__file__).parent))

from dotenv import load_dotenv

# Загрузить переменные окружения
env_path = Path(__file__).parent / ".env"
load_dotenv(dotenv_path=env_path)

# Импортировать модели и БД
from .database import engine
from .models import Base

print("🔄 Инициализация БД...")
print(f"📍 DATABASE_URL: {os.getenv('DATABASE_URL')}")

try:
    # Создать все таблицы
    Base.metadata.create_all(bind=engine)
    print("✅ БД успешно инициализирована!")
    print("✅ Таблицы созданы: quizzes, players")
except Exception as e:
    print(f"❌ Ошибка: {e}")
    import traceback
    traceback.print_exc()
    exit(1)
