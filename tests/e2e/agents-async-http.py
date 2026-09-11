"""HTTP regression against the dedicated wp-env test site (no provider calls).

Install fixtures/agents-async-worker.php as an MU plugin there, activate
OpenStation, and pass a disposable agent ID. Uses the wp-env admin account.
"""
import http.cookiejar
import json
import sys
import time
import urllib.parse
import urllib.request
import uuid

root = 'http://localhost:8891'
agent = int(sys.argv[1])
cookies = http.cookiejar.CookieJar()
http = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cookies))
http.open(root + '/wp-login.php', timeout=10).read()
http.open(root + '/wp-login.php', urllib.parse.urlencode({
    'log': 'admin', 'pwd': 'password', 'wp-submit': 'Log In',
    'redirect_to': root + '/wp-admin/', 'testcookie': '1',
}).encode(), timeout=10).read()
nonce = http.open(root + '/wp-admin/admin-ajax.php?action=rest-nonce', timeout=10).read().decode()
job_id = str(uuid.uuid4())
base = root + f'/index.php?rest_route=/desktop-mode/v1/agents/{agent}'
payload = {'message': '__openstation_async_http_smoke__', 'source': 'chat',
           'async': True, 'requestId': job_id}

def request(url, data=None):
    started = time.monotonic()
    req = urllib.request.Request(url, data=json.dumps(data).encode() if data else None,
                                 headers={'Content-Type': 'application/json', 'X-WP-Nonce': nonce})
    with http.open(req, timeout=10) as response:
        status = response.status
        body = json.load(response)
    elapsed = time.monotonic() - started
    assert elapsed < 5, f'Lightweight request blocked for {elapsed:.2f}s'
    print(f'{status} {body.get("status")} {elapsed:.3f}s', flush=True)
    return status, body, elapsed

started = time.monotonic()
status, body, _ = request(base + '/invoke', payload)
assert status == 202 and body['jobId'] == job_id
# A lost response may cause this exact POST to be delivered again.
_, duplicate, _ = request(base + '/invoke', payload)
assert duplicate['jobId'] == job_id
seen_running = False
for _ in range(25):
    time.sleep(3)
    _, body, _ = request(base + '/jobs/' + job_id)
    seen_running |= body['status'] == 'running'
    if body['status'] == 'completed':
        assert body['result']['text'] == 'Slow HTTP job completed.'
        assert seen_running and time.monotonic() - started >= 35
        print('PASS: >35s worker, fast HTTP requests, duplicate submission recovered.', flush=True)
        break
    assert body['status'] in ('queued', 'running'), body
else:
    raise AssertionError('WordPress did not complete the job within 75 seconds')
