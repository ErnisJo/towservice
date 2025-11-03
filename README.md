# Tow Service (Сервис вызова эвакуатора)

Мобильное приложение React Native (Expo) и FastAPI backend для сервиса вызова эвакуатора в Кыргызстане.

## Основные возможности

- **Интерактивная карта 2GIS** с построением маршрутов и выбором точек на карте
- **Умный геокодинг** — автоматическое определение адреса по координатам с форматом "улица, дом" или "село, дом"
- **Расчёт стоимости** на основе расстояния и времени в пути
- **Управление заказами** — создание, отслеживание, история
- **Авторизация по SMS** с автоматической регистрацией
- **Админ-панель** для управления заказами, водителями и тарифами

## Геокодинг (2GIS)

Приложение использует **2GIS Catalog API** для прямого и обратного геокодирования:

- **Обратный геокод** (`/geocode/reverse`) возвращает адрес в формате:
  - `улица Луч, 321` — если доступны улица и номер дома
  - `с. Луч` — если только населённый пункт без точного адреса
- **Прямой геокод** (`/geocode/forward`) преобразует текстовый адрес в координаты
- **Подсказки** (`/geocode/suggest`) для автодополнения адресов

Backend приоритизирует качественные данные: `address_name` → `components[street_number]` → `adm_div[settlement]` → `full_name`.

## Быстрый старт

## Быстрый старт

### Frontend (React Native + Expo)

Windows (PowerShell):

```powershell
# Установите Node.js 18+ и Python 3.9+
npm install
npx expo start
```

Используйте Expo Go на телефоне или эмулятор Android/iOS.

### Backend (FastAPI)

```powershell
cd server_py
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt

# Создайте .env файл с вашими ключами:
# DGIS_API_KEY=ваш_ключ_2gis
# MAPTILER_API_KEY=ваш_ключ_maptiler (опционально)

.venv\Scripts\python.exe run.py
```

Backend будет доступен на `http://0.0.0.0:4001`

## Конфигурация

В `app.config.js` укажите адрес backend:

```javascript
extra: {
  apiBase: "http://192.168.0.100:4001",  // ваш IP для тестирования на устройстве
  dgisApiKey: "ваш_ключ_2gis",
  // ...
}
```

## Архитектура

- **Frontend**: `components/HomeScreen.js` — главный экран с картой и формой заказа
- **Backend**: `server_py/app/api/v1/endpoints/` — REST API эндпоинты
  - `geocoding.py` — геокодинг через 2GIS
  - `orders.py` — управление заказами
  - `auth.py` — SMS-авторизация
- **База данных**: SQLite (по умолчанию) или PostgreSQL
- **WebSocket**: Поддержка чата поддержки в реальном времени

## Документация API

После запуска backend доступна по адресу: `http://localhost:4001/docs`

## Развитие проекта
## Развитие проекта

- Интеграция платёжных систем
- Push-уведомления для водителей и клиентов
- Расширенная аналитика и отчёты
- Мобильное приложение для водителей

## Файлы и структура

- `App.js` — точка входа приложения
- `components/HomeScreen.js` — главный экран с картой
- `components/MapViewProvider.js` — провайдер карты 2GIS
- `server_py/app/` — backend приложение
- `server_py/app/api/v1/endpoints/geocoding.py` — геокодинг 2GIS
- `admin/` — админ-панель на React + Vite
