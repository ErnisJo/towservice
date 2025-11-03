import asyncio
import httpx
import json
import sys
sys.path.append('.')
from app.core.config import settings

async def test_new_logic():
    # Пример ответа от 2GIS
    item = {
      "address": {
        "building_id": "15763234351044583",
        "components": [
          {
            "number": "321",
            "street": "улица Луч",
            "street_id": "15763337430176331",
            "type": "street_number"
          }
        ]
      },
      "address_name": "улица Луч, 321",
      "adm_div": [
        {"id": "23", "name": "Кыргызстан", "type": "country"},
        {"id": "15763616603045889", "name": "Чуйская область", "type": "region"},
        {"id": "15763612308078596", "name": "Сокулукский район", "type": "district_area"},
        {"city_alias": "bishkek", "id": "70030076129533266", "name": "с. Луч", "type": "settlement"}
      ],
      "full_name": "Луч, улица Луч, 321",
      "id": "15763234351044583",
      "name": "улица Луч, 321",
      "purpose_name": "Частный дом",
      "type": "building"
    }
    
    # Приоритет 1: address_name
    address_name = item.get("address_name", "").strip()
    if address_name:
        adm_div = item.get("adm_div", [])
        for adm in adm_div:
            if adm.get("type") in ("settlement", "city"):
                settlement_name = adm.get("name", "")
                for pref in ["с. ", "г. ", "п. ", "пгт. "]:
                    if settlement_name.startswith(pref):
                        settlement_name = settlement_name[len(pref):]
                if address_name.startswith(f"{settlement_name}, "):
                    address_name = address_name[len(f"{settlement_name}, "):]
                    break
        
        print(f"✅ Результат: {address_name}")
        return address_name

asyncio.run(test_new_logic())
