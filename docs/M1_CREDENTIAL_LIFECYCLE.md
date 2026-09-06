# M1 Credential Lifecycle

Neo AVO V1 uses one opaque Bearer token per project/environment. Registration and explicit rotation return the plaintext token once; the database stores only a SHA-256 digest and a short prefix. Tokens are generated with Node's cryptographically secure `randomBytes`.

Authentication requires both `Authorization: Bearer <token>` and `X-Neo-Avo-Environment`. The environment must match the project and credential row. Revocation is explicit and immediate. Rotation revokes the active credential for that project/environment before creating its replacement, so there is no overlap in V1. There is no automatic expiry or recovery channel; operators must securely retain the one-time token and rotate it if lost. Tokens are never written to logs, Git, event payloads, or AI context.

Project identity (`slug` and `environment`) is immutable through the M1 configuration API; changing credential scope requires a new project registration. The registration endpoint is intended for a private operator-controlled deployment until an operator-authentication milestone is defined.
