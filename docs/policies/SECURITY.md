# Security Policy — Draft

## Security boundary

The current frontend prototype has no server-side credentials and performs no privileged external action.

## Production requirements

Before production release, implement and verify:

- secure authentication and session management
- server-side authorization / RBAC
- input validation and output encoding
- rate limiting and abuse protection
- CSRF protections where applicable
- secure headers and content security policy
- secret management outside source control
- encrypted transport and appropriate encryption at rest
- audit logging for sensitive actions
- dependency and license auditing
- secure file handling if uploads are added
- tenant isolation if multi-tenant functionality is added
- backup and restore testing
- security incident response
- vulnerability disclosure process

Never expose API keys, database credentials, signing secrets, or private tokens to the browser.

## Reporting

A production release should publish a security contact and clear responsible-disclosure process.
