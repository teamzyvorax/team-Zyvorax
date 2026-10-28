# TEAM ZYVORAX

An adaptive intent-based workspace prototype: describe the outcome you want, and the interface creates a task-specific workspace instead of forcing a fixed feature maze.

## Current status

**Implemented:** adaptive UI, intent detection, workspace generation, theme switching, local history, trust/policy center, responsive layouts.

**Not yet implemented:** real authentication, database, external AI provider, production integrations, deployment automation, billing, and server-side authorization. The current prototype deliberately makes no external side effects.

## Run locally

```bash
npm install
npm run dev
```

Production build:

```bash
npm run build
```

## Product principle

`USER INTENT → SYSTEM UNDERSTANDS → WORKSPACE ADAPTS → USER PREVIEWS → ACTION → RESULT → LEARNING`

## Trust boundary

The browser prototype stores non-sensitive demo history in local storage. Do not put secrets, API keys, passwords, or private credentials in the frontend.

## Policies

See `docs/policies/` for product-policy drafts. These are not legal advice and must be reviewed for the final legal entity, jurisdiction, product behavior, and applicable laws before publication.

## License

The repository does not grant ownership rights over third-party dependencies. Any final proprietary license should be selected and reviewed before a production release.
