from fastapi import APIRouter, Query, HTTPException
import httpx
import logging
from app.core.config import settings

router = APIRouter()
logger = logging.getLogger(__name__)

MAPTILER_API_KEY = settings.MAPTILER_API_KEY
DGIS_API_KEY = settings.DGIS_API_KEY
GEOAPIFY_API_KEY = settings.GEOAPIFY_API_KEY


def is_in_kg(lat: float, lon: float) -> bool:
    """Простая проверка, что координаты лежат в пределах Кыргызстана."""
    return 39.0 <= lat <= 43.5 and 69.0 <= lon <= 81.0


def calculate_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Вычисляет расстояние между двумя точками в метрах по формуле haversine.
    """
    from math import radians, sin, cos, sqrt, atan2
    
    R = 6371000  # Радиус Земли в метрах
    
    lat1_rad = radians(lat1)
    lat2_rad = radians(lat2)
    delta_lat = radians(lat2 - lat1)
    delta_lon = radians(lon2 - lon1)
    
    a = sin(delta_lat / 2) ** 2 + cos(lat1_rad) * cos(lat2_rad) * sin(delta_lon / 2) ** 2
    c = 2 * atan2(sqrt(a), sqrt(1 - a))
    
    return R * c


def require_key() -> None:
    if not GEOAPIFY_API_KEY:
        raise HTTPException(status_code=503, detail="Geoapify API key is not configured")


@router.get("/forward")
async def forward_geocode(
    query: str = Query(..., min_length=2, description="Адрес или место для поиска"),
):
    """Прямое геокодирование: текст → координаты через 2GIS."""

    trimmed = (query or "").strip()
    if not trimmed:
        raise HTTPException(status_code=400, detail="Query cannot be empty")

    require_key()

    # Не добавляем "Кыргызстан" автоматически — используем bbox для ограничения региона
    narrowed = trimmed

    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            # 2GIS Items API с bbox для Кыргызстана
            params = {
                "q": narrowed,
                "fields": "items.point,items.geometry.centroid,items.address_name,items.full_name,items.type",
                "page_size": 15,
                "key": DGIS_API_KEY,
                "sort": "distance",
                "locale": "ru_KG",
            }
            resp = await client.get("https://catalog.api.2gis.com/3.0/items", params=params)
            resp.raise_for_status()
            data = resp.json()

            for item in data.get("result", {}).get("items", []):
                # Координаты из point или geometry.centroid
                point = item.get("point") or item.get("geometry", {}).get("centroid", {})
                lat = point.get("lat") or point.get("latitude")
                lon = point.get("lon") or point.get("longitude")

                if lat is not None and lon is not None and is_in_kg(float(lat), float(lon)):
                    address_name = item.get("address_name", "").strip()
                    full_name = item.get("full_name", "").strip()
                    address = address_name or full_name or trimmed
                    
                    # Очистка от лишних префиксов
                    for prefix in ["Кыргызстан, ", "Киргизия, ", "Kyrgyzstan, "]:
                        if address.startswith(prefix):
                            address = address[len(prefix):]
                    
                    return {
                        "latitude": float(lat),
                        "longitude": float(lon),
                        "address": address,
                    }
        except Exception:
            pass

        try:
            # 2GIS Geocoder API (запасной вариант, более точный для адресов)
            params = {
                "q": narrowed,
                "key": DGIS_API_KEY,
                "fields": "items.point,items.address_name,items.full_name",
                "locale": "ru_KG",
            }
            resp = await client.get("https://catalog.api.2gis.com/3.0/items/geocode", params=params)
            resp.raise_for_status()
            data = resp.json()
            items = data.get("result", {}).get("items", [])

            if items:
                best = items[0]
                point = best.get("point") or best.get("geometry", {}).get("centroid", {})
                lat = point.get("lat") or point.get("latitude")
                lon = point.get("lon") or point.get("longitude")

                if lat and lon and is_in_kg(float(lat), float(lon)):
                    address_name = best.get("address_name", "").strip()
                    full_name = best.get("full_name", "").strip()
                    address = address_name or full_name or trimmed
                    
                    for prefix in ["Кыргызстан, ", "Киргизия, ", "Kyrgyzstan, "]:
                        if address.startswith(prefix):
                            address = address[len(prefix):]
                    
                    return {
                        "latitude": float(lat),
                        "longitude": float(lon),
                        "address": address,
                    }
        except Exception:
            pass

    raise HTTPException(status_code=404, detail="No results found")


@router.get("/reverse")
async def reverse_geocode(
    lat: float = Query(..., ge=-90.0, le=90.0, description="Широта"),
    lon: float = Query(..., ge=-180.0, le=180.0, description="Долгота"),
):
    """Обратное геокодирование: координаты → адрес через Geoapify."""

    if not is_in_kg(lat, lon):
        raise HTTPException(status_code=400, detail="Coordinates outside Kyrgyzstan bounds")

    require_key()

    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            # Geoapify Reverse Geocoding API
            # Пробуем несколько типов для получения лучшего результата
            params = {
                "lat": lat,
                "lon": lon,
                "apiKey": GEOAPIFY_API_KEY,
                "lang": "ru",
                "type": "street,amenity,building",  # Приоритет улицам и зданиям
            }
            resp = await client.get("https://api.geoapify.com/v1/geocode/reverse", params=params)
            resp.raise_for_status()
            data = resp.json()
            
            features = data.get("features", [])
            
            if features:
                # Ищем лучший результат (не county/district)
                best_feature = None
                for feature in features:
                    props = feature.get("properties", {})
                    result_type = props.get("result_type", "")
                    
                    # Пропускаем county и state если есть что-то лучше
                    if result_type in ["county", "state", "country"]:
                        if not best_feature:
                            best_feature = feature  # Сохраним как fallback
                        continue
                    
                    # Нашли хороший результат
                    best_feature = feature
                    break
                
                if not best_feature:
                    best_feature = features[0]
                
                props = best_feature.get("properties", {})
                
                # Получаем компоненты адреса
                street = props.get("street", "")
                housenumber = props.get("housenumber", "")
                suburb = props.get("suburb", "")
                village = props.get("village", "")
                city = props.get("city", "")
                district = props.get("district", "")
                county = props.get("county", "")
                formatted = props.get("formatted", "")
                address_line1 = props.get("address_line1", "")
                address_line2 = props.get("address_line2", "")
                result_type = props.get("result_type", "")
                name = props.get("name", "")
                
                print(f"[DEBUG REVERSE] Geoapify result: type={result_type}, street={street}, house={housenumber}, village={village}, city={city}, suburb={suburb}, county={county}, name={name}")
                
                # Собираем адрес с приоритетами
                address_parts = []
                
                # Если это село
                if village:
                    address_parts.append(f"с. {village}")
                    if housenumber:
                        address_parts.append(housenumber)
                # Если это город с улицей
                elif street:
                    if housenumber:
                        address_parts.append(f"{street}, {housenumber}")
                    else:
                        address_parts.append(street)
                # Если это POI с названием
                elif name and result_type in ["amenity", "building"]:
                    address_parts.append(name)
                # Если это город/пригород
                elif suburb and city:
                    address_parts.append(f"{city}, {suburb}")
                elif city:
                    address_parts.append(city)
                # Если только район - показываем с ближайшим городом
                elif county:
                    # Ищем город из всех результатов
                    city_name = None
                    for feat in features:
                        p = feat.get("properties", {})
                        if p.get("city"):
                            city_name = p.get("city")
                            break
                    
                    if city_name:
                        address_parts.append(f"{city_name}, {county}")
                    else:
                        # Fallback - просто район, но с пометкой
                        address_parts.append(f"~{county}")  # ~ означает приблизительно
                elif address_line1:
                    # Убираем "Kyrgyzstan"
                    clean = address_line1.replace("Kyrgyzstan, ", "").replace("Кыргызстан, ", "")
                    address_parts.append(clean)
                elif formatted:
                    # Убираем "Kyrgyzstan" из formatted
                    clean = formatted.replace("Kyrgyzstan, ", "").replace("Кыргызстан, ", "")
                    address_parts.append(clean)
                
                if address_parts:
                    final_address = ", ".join(address_parts)
                    print(f"[DEBUG REVERSE] Returning: '{final_address}'")
                    return {"latitude": lat, "longitude": lon, "address": final_address}
        
        except Exception as e:
            print(f"[ERROR REVERSE] Geoapify error: {e}")
            pass

    raise HTTPException(status_code=404, detail="Address not found")


def calculate_place_score(item: dict, query: str, has_digits: bool) -> float:
    """
    Система скоринга как в Яндекс.Навигаторе:
    - Приоритет по типу объекта (село > город > улица > переулок > POI)
    - Точность совпадения с запросом
    - Наличие settlement в adm_div
    """
    score = 0.0
    
    address_name = item.get("address_name", "").lower()
    full_name = item.get("full_name", "").lower()
    name = item.get("name", "").lower()
    item_type = item.get("type", "").lower()
    query_lower = query.lower()
    
    # 1. Приоритет по типу из adm_div (населённые пункты)
    adm_div = item.get("adm_div", [])
    is_settlement = False
    settlement_type = None
    
    for adm in adm_div:
        if adm.get("type") == "settlement":
            is_settlement = True
            settlement_name = adm.get("name", "").lower()
            # Определяем тип населённого пункта
            if settlement_name.startswith("с.") or settlement_name.startswith("с "):
                settlement_type = "village"
                score += 1000  # Село - высший приоритет
            elif settlement_name.startswith("г.") or settlement_name.startswith("г "):
                settlement_type = "city"
                score += 900  # Город
            elif settlement_name.startswith("п.") or settlement_name.startswith("пгт."):
                settlement_type = "town"
                score += 950  # Посёлок
            break
    
    # 2. Приоритет по типу объекта (для не-населённых пунктов)
    if not is_settlement:
        if "улица" in address_name or "улица" in full_name:
            score += 500  # Улица
        elif "переулок" in address_name or "переулок" in full_name:
            score += 300  # Переулок - низкий приоритет
        elif "проспект" in address_name or "проспект" in full_name:
            score += 600  # Проспект
        elif "бульвар" in address_name or "бульвар" in full_name:
            score += 550
        elif item_type == "branch" or item_type == "attraction":
            score += 200  # POI
        else:
            score += 400  # Неизвестный тип
    
    # 3. Точность совпадения с запросом
    if query_lower in address_name:
        score += 100
    elif query_lower in full_name:
        score += 80
    elif query_lower in name:
        score += 60
    
    # 4. Бонус если запрос - это точное начало названия
    if address_name.startswith(query_lower) or name.startswith(query_lower):
        score += 50
    
    # 5. Штраф за переулки если нет явного указания "переулок" в запросе
    if "переулок" in address_name and "переулок" not in query_lower:
        score -= 200
    
    return score


@router.get("/suggest")
async def suggest_places(
    query: str = Query(..., min_length=2, description="Начало адреса или названия места"),
    limit: int = Query(8, ge=1, le=20, description="Максимум результатов"),
):
    """Подсказки адресов/POI из Geoapify с умной логикой как в Яндекс.Навигаторе."""

    trimmed = (query or "").strip()
    if not trimmed:
        raise HTTPException(status_code=400, detail="Query cannot be empty")

    require_key()

    # Определяем, есть ли цифры в запросе (пользователь начал вводить номер дома)
    has_digits = any(char.isdigit() for char in trimmed)
    
    # Добавляем контекст Кыргызстана если нужно
    search_query = trimmed
    if "бишкек" not in search_query.lower() and "ош" not in search_query.lower() and "кыргызстан" not in search_query.lower():
        search_query = f"{trimmed}, Кыргызстан"

    async with httpx.AsyncClient(timeout=10.0) as client:
        try:
            # Geoapify Autocomplete API
            # https://apidocs.geoapify.com/docs/geocoding/address-autocomplete/
            params = {
                "text": search_query,
                "apiKey": GEOAPIFY_API_KEY,
                "lang": "ru",
                "limit": limit,
                "filter": "rect:69.0,39.0,81.0,43.5",  # Кыргызстан bbox
                "bias": "proximity:74.590682,42.874772",  # Центр Бишкека
            }
            
            resp = await client.get("https://api.geoapify.com/v1/geocode/autocomplete", params=params)
            resp.raise_for_status()
            data = resp.json()
            
            print(f"[DEBUG SUGGEST] Geoapify response: {data}")
            
            features = data.get("features", [])
            
            print(f"[DEBUG SUGGEST] Geoapify returned {len(features)} features for query '{trimmed}'")

            # Формируем результаты
            results = []
            seen = set()
            
            for feature in features[:limit]:
                props = feature.get("properties", {})
                geom = feature.get("geometry", {})
                coords = geom.get("coordinates", [])
                
                if len(coords) < 2:
                    continue
                
                lon, lat = coords[0], coords[1]
                
                if not is_in_kg(lat, lon):
                    continue

                # Получаем название и адрес
                formatted = props.get("formatted", "")
                name = props.get("name", "")
                street = props.get("street", "")
                housenumber = props.get("housenumber", "")
                city = props.get("city", "")
                village = props.get("village", "")
                suburb = props.get("suburb", "")
                result_type = props.get("result_type", "")
                address_line1 = props.get("address_line1", "")
                
                print(f"[DEBUG SUGGEST] Feature: type={result_type}, street={street}, house={housenumber}, village={village}, city={city}, name={name}")
                
                # Формируем title (главный текст) - без районов!
                if village:
                    # Село
                    title = f"с. {village}"
                    if housenumber:
                        title += f", {housenumber}"
                elif housenumber and street:
                    # Улица с номером дома
                    title = f"{street}, {housenumber}"
                elif street:
                    # Просто улица
                    title = street
                elif name and result_type in ["amenity", "building"]:
                    # POI или здание
                    title = name
                elif city and not suburb:
                    # Город (но не район!)
                    title = city
                elif address_line1:
                    # Используем address_line1, но убираем районы
                    clean = address_line1.replace("Kyrgyzstan, ", "").replace("Кыргызстан, ", "")
                    # Пропускаем если это только "Сокулукский район" или подобное
                    if "район" in clean.lower() and "," not in clean:
                        continue
                    title = clean
                elif formatted:
                    # Последний fallback
                    clean = formatted.replace("Kyrgyzstan, ", "").replace("Кыргызстан, ", "")
                    # Пропускаем если это только район
                    if "район" in clean.lower() and "," not in clean:
                        continue
                    title = clean
                else:
                    continue
                
                # Дедупликация
                dedup_key = ' '.join(title.lower().split())
                if dedup_key in seen:
                    continue
                seen.add(dedup_key)
                
                # Формируем subtitle (тип/город)
                subtitle_parts = []
                if city and city not in title:
                    subtitle_parts.append(city)
                if result_type:
                    type_ru = {
                        "amenity": "Объект",
                        "building": "Здание",
                        "street": "Улица",
                        "suburb": "Район",
                        "city": "Город",
                        "postcode": "Почтовый индекс",
                        "village": "Село",
                    }.get(result_type, result_type)
                    subtitle_parts.append(type_ru)
                
                subtitle = ", ".join(subtitle_parts) if subtitle_parts else None
                
                # Формируем финальный адрес для использования
                if village:
                    final_address = f"с. {village}"
                    if housenumber:
                        final_address += f", {housenumber}"
                elif street:
                    final_address = street
                    if housenumber:
                        final_address += f", {housenumber}"
                elif name:
                    final_address = name
                else:
                    final_address = title
                
                results.append({
                    "title": title,
                    "subtitle": subtitle,
                    "latitude": lat,
                    "longitude": lon,
                    "address": final_address,
                })
                
                print(f"[DEBUG SUGGEST] Added: {title}")

            return {"results": results}
        except httpx.HTTPError as e:
            print(f"[ERROR SUGGEST] HTTP error: {str(e)}")
            raise HTTPException(status_code=502, detail=f"2GIS suggestion request failed: {str(e)}")
        except Exception as e:
            print(f"[ERROR SUGGEST] Exception: {str(e)}")
            raise HTTPException(status_code=500, detail=f"Internal error: {str(e)}")

