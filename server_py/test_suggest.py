import requests
import json

def test_suggest():
    base_url = "http://localhost:4001"
    
    # Тест 1: поиск улицы без цифр
    print("=" * 60)
    print("Тест 1: Поиск 'Мира' (без цифр - должны быть только улицы)")
    print("=" * 60)
    try:
        response = requests.get(f"{base_url}/geocode/suggest?query=Мира&limit=8")
        print(f"Status: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            print(f"Количество результатов: {len(data.get('results', []))}")
            for i, item in enumerate(data.get('results', []), 1):
                print(f"{i}. {item.get('title', 'N/A')}")
                if item.get('subtitle'):
                    print(f"   Подзаголовок: {item.get('subtitle')}")
        else:
            print(f"Ошибка: {response.text}")
    except Exception as e:
        print(f"Исключение: {e}")
    
    print("\n")
    
    # Тест 2: поиск с номером дома
    print("=" * 60)
    print("Тест 2: Поиск 'Мира 10' (с цифрами - должны быть полные адреса)")
    print("=" * 60)
    try:
        response = requests.get(f"{base_url}/geocode/suggest?query=Мира 10&limit=8")
        print(f"Status: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            print(f"Количество результатов: {len(data.get('results', []))}")
            for i, item in enumerate(data.get('results', []), 1):
                print(f"{i}. {item.get('title', 'N/A')}")
                if item.get('subtitle'):
                    print(f"   Подзаголовок: {item.get('subtitle')}")
        else:
            print(f"Ошибка: {response.text}")
    except Exception as e:
        print(f"Исключение: {e}")
    
    print("\n")
    
    # Тест 3: короткий запрос
    print("=" * 60)
    print("Тест 3: Поиск 'Луч' (без цифр)")
    print("=" * 60)
    try:
        response = requests.get(f"{base_url}/geocode/suggest?query=Луч&limit=8")
        print(f"Status: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            print(f"Количество результатов: {len(data.get('results', []))}")
            for i, item in enumerate(data.get('results', []), 1):
                print(f"{i}. {item.get('title', 'N/A')}")
                if item.get('subtitle'):
                    print(f"   Подзаголовок: {item.get('subtitle')}")
        else:
            print(f"Ошибка: {response.text}")
    except Exception as e:
        print(f"Исключение: {e}")

if __name__ == "__main__":
    test_suggest()
