# Security Policy

OpenCoffer is designed for self-hosting sensitive personal finance data.

## Supported Versions

Security fixes target the latest `main` branch until versioned releases are established.

## Reporting A Vulnerability

Do not open a public issue with secrets, account data, setup tokens, database dumps, or screenshots containing private financial details. Use a private disclosure channel for the repository owner or maintainer.

## Operational Guidance

- Keep `.env`, database backups, SimpleFIN access URLs, model API keys, ChatGPT auth JSON, and MCP bearer tokens private.
- Generate `NEXTAUTH_SECRET` and `APP_ENCRYPTION_KEY` with `openssl rand -base64 32`.
- Do not rotate `APP_ENCRYPTION_KEY` unless you also re-enter all encrypted SimpleFIN and model credentials.
- Treat MCP tokens like API keys. Revoke unused tokens in `Settings -> MCP`.
- Run the worker in production so stale data and stale categorization do not mislead users.
