# Event Atlas development conventions

- Every user-facing release must increment package.json and dist/release.js together, add a dated entry to CHANGELOG.md and the bilingual in-app CHANGELOG, and package a versioned ZIP. Do not relabel reports from older engine versions.
- Preserve running user audits. Do not stop, restart, overwrite an extracted user installation, or change an active audit's options to deploy an update. Use a separate preview port and output package; advise exporting the current report before upgrading.
- Maintain Indonesian and English parity for interface copy. Preserve observed event names, URLs, parameters, CSS selectors, and original site labels.
- Keep live and finished duration accurate across refresh/import. Distinguish observed requests from GA4 receipt and timing-based element attribution from proven causation.
- Validate concurrent crawling and incremental report merging when changing worker behavior. Keep the site's existing project identity and access settings.
