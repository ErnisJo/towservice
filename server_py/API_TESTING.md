# Тестирование API аутентификации TowService

## Эндпоинты

Базовый URL: `http://127.0.0.1:4001/api/v1`

### 1. Запросить код подтверждения

**POST** `/auth/send-code`

```json
{
  "phone": "+79991234567"
}
```

Ответ:
```json
{
  "message": "Код отправлен",
  "phone": "+79991234567"
}
```

**Код будет выведен в консоль сервера!**

### 2. Подтвердить код и получить токен

**POST** `/auth/verify-code`

```json
{
  "phone": "+79991234567",
  "code": "123456"
}
```

Ответ:
```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "user_id": 1
}
```

### 3. Получить свой профиль (требует токен)

**GET** `/users/me`

Headers:
```
Authorization: Bearer <your_access_token>
```

Ответ:
```json
{
  "id": 1,
  "phone": "+79991234567",
  "email": null,
  "first_name": null,
  "last_name": null,
  "is_active": true,
  "is_superuser": false,
  "created_at": "2025-10-31T10:00:00",
  "updated_at": "2025-10-31T10:00:00"
}
```

### 4. Обновить профиль (требует токен)

**PUT** `/users/me`

Headers:
```
Authorization: Bearer <your_access_token>
```

Body:
```json
{
  "first_name": "Иван",
  "last_name": "Иванов",
  "email": "ivan@example.com"
}
```

## Как тестировать

### Вариант 1: Swagger UI
Откройте в браузере: http://127.0.0.1:4001/docs

### Вариант 2: cURL

```bash
# 1. Запросить код
curl -X POST http://127.0.0.1:4001/api/v1/auth/send-code \
  -H "Content-Type: application/json" \
  -d '{"phone": "+79991234567"}'

# 2. Проверьте консоль сервера - там будет код!

# 3. Подтвердить код (замените 123456 на ваш код)
curl -X POST http://127.0.0.1:4001/api/v1/auth/verify-code \
  -H "Content-Type: application/json" \
  -d '{"phone": "+79991234567", "code": "123456"}'

# 4. Получить профиль (замените TOKEN на полученный токен)
curl -X GET http://127.0.0.1:4001/api/v1/users/me \
  -H "Authorization: Bearer TOKEN"

# 5. Обновить профиль
curl -X PUT http://127.0.0.1:4001/api/v1/users/me \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"first_name": "Иван", "last_name": "Иванов"}'
```

### Вариант 3: PowerShell

```powershell
# 1. Запросить код
Invoke-RestMethod -Uri "http://127.0.0.1:4001/api/v1/auth/send-code" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"phone": "+79991234567"}'

# 2. Проверьте консоль сервера!

# 3. Подтвердить код
$response = Invoke-RestMethod -Uri "http://127.0.0.1:4001/api/v1/auth/verify-code" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"phone": "+79991234567", "code": "123456"}'

$token = $response.access_token

# 4. Получить профиль
Invoke-RestMethod -Uri "http://127.0.0.1:4001/api/v1/users/me" `
  -Method GET `
  -Headers @{Authorization = "Bearer $token"}

# 5. Обновить профиль
Invoke-RestMethod -Uri "http://127.0.0.1:4001/api/v1/users/me" `
  -Method PUT `
  -ContentType "application/json" `
  -Headers @{Authorization = "Bearer $token"} `
  -Body '{"first_name": "Иван", "last_name": "Иванов"}'
```

## Особенности

1. **Код живет 5 минут** - после этого нужно запросить новый
2. **Токен живет 24 часа** - потом нужно повторно войти
3. **Коды выводятся в консоль сервера** - это для разработки, в продакшене будет SMS
4. **Регистрация автоматическая** - если номер телефона новый, пользователь создается при первом входе