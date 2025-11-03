# Быстрый запуск с MapTiler

## 1. Получите бесплатный ключ MapTiler

Перейдите на https://cloud.maptiler.com/auth/widget и зарегистрируйтесь.
После регистрации скопируйте ваш API ключ.

## 2. Настройте ключи

### Windows PowerShell:
```powershell
$env:MAPTILER_API_KEY="ВАШ_КЛЮЧ_MAPTILER"
```

### Linux/Mac:
```bash
export MAPTILER_API_KEY="ВАШ_КЛЮЧ_MAPTILER"
```

### Или обновите app.json:
```json
{
  "expo": {
    "extra": {
      "maptilerApiKey": "ВАШ_КЛЮЧ_MAPTILER"
    }
  }
}
```

## 3. Запустите приложение

```bash
# Backend
cd server_py
python run.py

# Expo (в новом терминале)
cd ..
npx expo start
```

## Преимущества MapTiler

✅ Современные векторные карты вместо устаревших растровых
✅ Актуальные данные OpenStreetMap
✅ Улучшенное покрытие адресов для Кыргызстана
✅ Бесплатный тариф: 100,000 загрузок в месяц
✅ Надежный геокодинг без Plus Codes
