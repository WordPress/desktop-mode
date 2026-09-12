# Async agent HTTP regression

`agents-async-http.py` uses the dedicated test WordPress at port 8891 and its
`admin` / `password` account. It logs in with cookies and obtains a real REST
nonce. The worker fixture waits 35 seconds without contacting an AI provider.

Start `npm run env:start:tests`, activate `desktop-mode` in that instance, and
copy `fixtures/agents-async-worker.php` to that instance's MU-plugin directory.
Create a disposable agent with an empty abilities list, then run:

```sh
python3 tests/e2e/agents-async-http.py AGENT_ID
```

The script asserts HTTP 202, retry with the same UUID, running status and the
final answer after 35 seconds. Each HTTP call must finish within five seconds.
It fails if a status endpoint waits for generation or if the worker never runs.
Use only the dedicated test site: the fixture enables Agents and substitutes a
test provider that rejects every message except the smoke-test marker.

Remove the MU-plugin fixture, delete the disposable agent and its job options
using `openstation_agent_job_cleanup()`, and stop `npm run env:stop:tests` when
finished. The fixture is excluded from release packaging. Browser transport and
chat delivery regressions (including timeout, reconnect, backoff, hidden tabs
and pending state) live in `tests/vitest/agents-jobs.test.ts`.
