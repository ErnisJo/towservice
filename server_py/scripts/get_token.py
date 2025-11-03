import json
import urllib.request

BASE_URL = "http://127.0.0.1:4001"
PHONE = "0999999999"


def post(path: str, payload: dict) -> dict:
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(
        f"{BASE_URL}{path}",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req) as resp:
        body = resp.read().decode("utf-8")
        print(f"POST {path} -> {resp.status}\n{body}\n")
        return json.loads(body)


def main() -> None:
    send_resp = post("/api/v1/auth/send-code", {"phone": PHONE})
    code = send_resp.get("devCode")
    if not code:
        raise RuntimeError("Не удалось получить devCode из ответа send-code")
    verify_resp = post(
        "/api/v1/auth/verify-code",
        {"phone": PHONE, "code": code},
    )
    token = verify_resp.get("access_token")
    if not token:
        raise RuntimeError("Не удалось получить access_token из ответа verify-code")
    print(f"Токен для {PHONE}: {token}")


if __name__ == "__main__":
    main()
