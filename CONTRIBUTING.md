# Руководство разработчика TowService

## Быстрый старт

1. Клонируйте репозиторий:
```bash
git clone https://github.com/ErnisJo/towservice.git
cd towservice
```

2. Установите зависимости:

Python (FastAPI сервер):
```bash
cd server_py
python -m venv .venv
.venv\Scripts\activate  # Windows
source .venv/bin/activate  # Linux/Mac
pip install -r requirements.txt
```

Node.js (Резервный сервер):
```bash
cd server
npm install
```

Админ-панель:
```bash
cd admin
npm install
```

Мобильное приложение:
```bash
npm install
```

3. Запустите серверы:

```bash
# В разных терминалах:

# FastAPI (4001)
cd server_py
python -m uvicorn main:app --reload --host 0.0.0.0 --port 4001

# Node.js (4000)
cd server
npm run dev

# Админ (5173)
cd admin
npm run dev

# Expo
npx expo start --tunnel
```

## Структура проекта

```
towservice/
├── admin/                 # Админ-панель
├── android/               # Android конфигурация
├── assets/               # Изображения и ресурсы
├── components/           # React Native компоненты
├── navigation/           # Навигация React Navigation
├── server/              # Node.js API сервер
├── server_py/           # FastAPI сервер
├── utils/               # Общие утилиты
└── app.config.js        # Конфигурация Expo
```

## Разработка

### Авторизация
- В режиме разработки используется devCode
- Код возвращается в ответе API
- Для production нужно будет интегрировать SMS-сервис

### API endpoints
FastAPI сервер (4001):
- POST /auth/request-code - Запрос кода
- POST /auth/verify - Проверка кода
- GET/POST /orders - Заказы
- GET/POST /users/{uid}/chat - Чат

Node.js сервер (4000):
- Дублирует основные endpoints
- Работает как fallback

### База данных
- SQLite для разработки
- PostgreSQL для production
- Схема в server_py/main.py

### WebSocket
- /ws/user - Чат пользователя
- /ws/admin - Админский чат

## Тестирование

### Модульные тесты
```bash
# Python
cd server_py
pytest

# JavaScript
npm test
```

### E2E тесты
```bash
npm run e2e
```

## Сборка

### Android
```bash
cd android
./gradlew assembleRelease
```

### iOS
```bash
cd ios
pod install
xcodebuild
```

## Процесс разработки

1. Создайте ветку для задачи:
```bash
git checkout -b feature/my-feature
```

2. Напишите тесты

3. Реализуйте функционал

4. Запустите линтеры:
```bash
npm run lint
```

5. Создайте PR

## Деплой

### Staging
```bash
npm run deploy:staging
```

### Production
```bash
npm run deploy:prod
```

## Troubleshooting

### Ошибка "Не удалось отправить код"
1. Проверьте работу серверов (4000 и 4001)
2. Проверьте подключение к интернету
3. Проверьте логи в терминалах

### Ошибка сборки Android
1. Проверьте android/local.properties
2. Очистите gradle: cd android && ./gradlew clean

## Полезные команды

```bash
# Очистка кеша
npm run clean
cd android && ./gradlew clean
cd ios && pod deintegrate

# Логи
tail -f server_py/app.log
pm2 logs

# База данных
sqlite3 server_py/app.db
psql towservice
```