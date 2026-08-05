# Contributing

Thank you for improving LLMStorm.

1. Open an issue for substantial behavior or protocol changes.
2. Create a focused branch and keep unrelated changes out of the pull request.
3. Run the checks below before submitting.
4. Describe user impact, security implications, and the protocols tested.

```powershell
python -m pip install -r requirements-dev.txt
python -m ruff check .
python -m mypy
python -m coverage run -m unittest discover -s tests -v
python -m coverage report
npm install
npx playwright install chromium
npm run check
npm run test:e2e
```

Provider and model changes must follow [ARCHITECTURE.md](ARCHITECTURE.md). New
protocol adapters require endpoint, request-body, stream-extraction, and error
tests. Existing core orchestration should not gain provider-specific branches.

Do not include real API keys, relay URLs, production outputs, or customer data
in tests, screenshots, issues, or pull requests. Tests should use a local mock
upstream.
