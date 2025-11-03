# Архитектура проекта TowService

## 1. Общее описание
TowService - это мобильное приложение для вызова эвакуатора с админ-панелью и серверной частью.

## 2. Компоненты системы

### 2.1 Мобильное приложение (React Native + Expo)
- **Технологии**: React Native, Expo, React Navigation
- **Порт**: 19000 (Expo)
- **Структура**:
  ```
  components/
  ├── auth/              # Компоненты авторизации
  │   ├── LoginScreen.js
  │   └── RegisterScreen.js
  ├── core/              # Базовые компоненты
  │   ├── HomeScreen.js  # Главный экран
  │   └── RequestForm.js # Форма заказа
  ├── map/               # Картографические компоненты
  │   ├── MapViewProvider.js
  │   └── YandexMap.js
  ├── orders/           # Управление заказами
  │   ├── HistoryScreen.js
  │   └── OrderDetailsScreen.js
  └── support/          # Поддержка
      ├── ChatScreen.js
      └── SupportScreen.js
  ```

### 2.2 FastAPI Сервер (Python)
- **Порт**: 4001
- **База данных**: SQLite (dev) / PostgreSQL (prod)
- **Структура**:
  ```
  server_py/
  ├── main.py           # Основной файл FastAPI
  ├── models/           # Модели данных
  ├── services/         # Бизнес-логика
  ├── routes/           # Маршруты API
  └── utils/            # Утилиты
  ```

#### Основные эндпоинты:
- `POST /auth/request-code` - Запрос кода авторизации (devCode в разработке)
- `POST /auth/verify` - Проверка кода
- `GET /orders` - Список заказов
- `POST /orders` - Создание заказа
- `GET /users/{uid}/chat` - История чата
- `WS /ws/user` - WebSocket для чата

### 2.3 Node.js API (Резервный сервер)
- **Порт**: 4000
- **База данных**: JSON файл
- **Структура**:
  ```
  server/
  ├── index.js         # Express сервер
  ├── routes/          # Маршруты API
  └── db.json          # JSON база данных
  ```

### 2.4 Админ-панель (Vite + React)
- **Порт**: 5173
- **Структура**:
  ```
  admin/
  ├── src/
  │   ├── api.ts       # API клиент
  │   └── ui/          # React компоненты
  ```

## 3. Аутентификация

### 3.1 Процесс входа
1. Пользователь вводит номер телефона
2. Система генерирует 4-значный код (devCode в разработке)
3. Пользователь вводит код
4. При успешной проверке создается JWT токен

### 3.2 Роли пользователей
- customer - Обычный пользователь
- admin - Администратор
- support - Служба поддержки

## 4. Модели данных

### 4.1 User (Пользователь)
```typescript
interface User {
  id: string;
  phone: string;
  name: string;
  role: "customer" | "admin" | "support";
  createdAt: number;
}
```

### 4.2 Order (Заказ)
```typescript
interface Order {
  id: string;
  createdAt: number;
  userId: string;
  address: string;
  fromAddress?: string;
  toAddress?: string;
  startCoords?: GeoPoint;
  destCoords?: GeoPoint;
  distance?: number;
  duration?: number;
  cost?: number;
  finalCost?: number;
  details: OrderDetails;
}
```

### 4.3 Message (Сообщение чата)
```typescript
interface Message {
  id: string;
  userId: string;
  sender: "user" | "admin";
  text: string;
  createdAt: number;
}
```

## 5. Масштабирование

### 5.1 База данных
- Легкое переключение между SQLite и PostgreSQL
- Миграции через Alembic
- Индексы на ключевых полях

### 5.2 Кеширование
- Подготовлено место для Redis
- Кеширование частых запросов

### 5.3 Очереди
- Подготовка для RabbitMQ/Redis
- Обработка длительных операций

### 5.4 Микросервисы
Возможное разделение на сервисы:
- Auth Service (4001)
- Order Service
- Chat Service
- Notification Service

## 6. Развертывание

### 6.1 Development
```bash
# FastAPI сервер
cd server_py
python -m uvicorn main:app --reload --host 0.0.0.0 --port 4001

# Node.js сервер
cd server
npm install
npm run dev

# Админ-панель
cd admin
npm install
npm run dev

# Мобильное приложение
npm install
npx expo start --tunnel
```

### 6.2 Production
- Docker контейнеры
- Nginx как реверс-прокси
- PM2 для Node.js
- Gunicorn для Python

## 7. Безопасность
- CORS настройки
- Rate limiting
- JWT токены
- Валидация входных данных
- Санитизация SQL

## 8. Мониторинг
Подготовлено для:
- Sentry для ошибок
- Prometheus метрики
- Grafana дашборды
- Winston/Python logging

## 9. CI/CD
Подготовка для:
- GitHub Actions
- Автоматические тесты
- Линтеры
- Сборка APK/IPA