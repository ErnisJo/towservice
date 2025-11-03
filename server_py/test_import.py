import sys
print("Starting imports...")

try:
    print("1. Import config")
    from app.core.config import settings
    print(f"DATABASE_URL: {settings.DATABASE_URL}")
    
    print("2. Import database")
    from app.core.database import Base, engine
    
    print("3. Import main")
    from app.main import app
    
    print("All imports successful!")
except Exception as e:
    print(f"ERROR: {e}")
    import traceback
    traceback.print_exc()
