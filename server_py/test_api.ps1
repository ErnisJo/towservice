# Тестирование API аутентификации

Write-Host "=== Тест 1: Запрос кода ===" -ForegroundColor Green

$response1 = Invoke-RestMethod -Uri "http://127.0.0.1:4001/api/v1/auth/send-code" `
  -Method POST `
  -ContentType "application/json" `
  -Body '{"phone": "+79991234567"}'

Write-Host "Ответ:" -ForegroundColor Yellow
$response1 | ConvertTo-Json
Write-Host ""
Write-Host "КОД ДЛЯ ВХОДА: $($response1.devCode)" -ForegroundColor Cyan
Write-Host ""

# Сохраняем код для следующего запроса
$code = $response1.devCode

Write-Host "=== Тест 2: Подтверждение кода ===" -ForegroundColor Green

$response2 = Invoke-RestMethod -Uri "http://127.0.0.1:4001/api/v1/auth/verify-code" `
  -Method POST `
  -ContentType "application/json" `
  -Body "{`"phone`": `"+79991234567`", `"code`": `"$code`"}"

Write-Host "Ответ:" -ForegroundColor Yellow
$response2 | ConvertTo-Json
Write-Host ""
Write-Host "ТОКЕН: $($response2.access_token)" -ForegroundColor Cyan
Write-Host ""

# Сохраняем токен
$token = $response2.access_token

Write-Host "=== Тест 3: Получение профиля ===" -ForegroundColor Green

$response3 = Invoke-RestMethod -Uri "http://127.0.0.1:4001/api/v1/users/me" `
  -Method GET `
  -Headers @{Authorization = "Bearer $token" }

Write-Host "Профиль пользователя:" -ForegroundColor Yellow
$response3 | ConvertTo-Json
Write-Host ""

Write-Host "=== Тест 4: Обновление профиля ===" -ForegroundColor Green

$response4 = Invoke-RestMethod -Uri "http://127.0.0.1:4001/api/v1/users/me" `
  -Method PUT `
  -ContentType "application/json" `
  -Headers @{Authorization = "Bearer $token" } `
  -Body '{"first_name": "Иван", "last_name": "Иванов", "email": "ivan@example.com"}'

Write-Host "Обновленный профиль:" -ForegroundColor Yellow
$response4 | ConvertTo-Json
Write-Host ""

Write-Host "=== Все тесты пройдены! ===" -ForegroundColor Green