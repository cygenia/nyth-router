# Security release checklist

Use this checklist before pushing changes to a public repository.

## Never commit

- Real `.env` files or encrypted/plain runtime config.
- API keys, OAuth access tokens, refresh tokens, session cookies, private keys, passphrases, or wallet material.
- Local database files, runtime logs, request captures, HAR files, browser profiles, or uploaded artifacts.
- VPS-specific hostnames, public IP addresses, usernames, absolute private paths, account IDs, or operational details.
- Personal email addresses or account labels from real connected accounts.

## Required pre-push checks

1. Review the staged diff, not only the working tree:
   ```bash
   git diff --cached --stat
   git diff --cached
   ```
2. Search staged content for sensitive patterns:
   ```bash
   git diff --cached | grep -E -i 'api[_-]?key|secret|token|password|passphrase|private|oauth|cookie|authorization|[0-9]{1,3}(\.[0-9]{1,3}){3}'
   ```
3. Confirm only intended source, tests, documentation, and safe examples are staged.
4. Use placeholders in examples, such as `name@example.com`, `example.com`, `127.0.0.1`, and `YOUR_*`.
5. Run the relevant tests before pushing.
6. If a secret is accidentally staged or committed, stop immediately, remove it from Git history if needed, and rotate the secret.

## Safe examples

- Example email: `name@example.com`
- Example local endpoint: `http://127.0.0.1:9879`
- Example token text: `[redacted]` or `YOUR_TOKEN_HERE`
