# Security update, 2026-10-21

Use Node.js 22.23.4 or a newer patched supported release. The development runtime is pinned in `.node-version`; `engines.node` excludes affected older releases in the supported Node lines.

Validation: `npm run build` passed; `npm audit --json` reports zero known advisories for the updated lockfile. No deployment was performed.
