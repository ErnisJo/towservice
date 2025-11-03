import json
import urllib.request

url = "http://127.0.0.1:4001/users/1/chat"
payload = json.dumps({"text": "Hello from script"}).encode("utf-8")
req = urllib.request.Request(
    url,
    data=payload,
    headers={"Content-Type": "application/json"},
    method="POST",
)
with urllib.request.urlopen(req) as resp:
    print(resp.status)
    print(resp.read().decode("utf-8"))
