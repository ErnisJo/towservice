from datetime import datetime, timedelta
from jose import jwt

SECRET_KEY = "your-secret-key-here"
ALGORITHM = "HS256"
EXPIRE_MINUTES = 60 * 24

user_id = 1
expire = datetime.utcnow() + timedelta(minutes=EXPIRE_MINUTES)
token = jwt.encode({"sub": str(user_id), "exp": expire}, SECRET_KEY, algorithm=ALGORITHM)
print(token)
