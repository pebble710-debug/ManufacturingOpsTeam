# Lessons — UX/UI Designer (Maya)

- 2026-11-25 (T-013) Context: wrote the V1-CORE UI spec before the permissions matrix and API contract were final. Lesson: read the matrix and contract first; five rules (R-4, R-7 scrap, Viewer, reset cooldown, rework gate on reopen) changed after review. Re-check upstream docs before declaring a UI spec done.
- Edits to a long spec: keep one open-questions table with a Status column, so answered items are visible instead of deleted.
- No shell tool in this role: contrast ratios were computed by hand; always flag them as unverified for QA.
- 2026-11-26 (T-025) CSS without a shell is unverified: ask Quinn/Felix to run Playwright screenshots at 360/768/1366/1920 and axe. Nav is a `<details>`; desktop always-open relies on `::details-content` (fallback: working Menu button). Chart cards stay light in dark mode because Chart.js colors are fixed in JS.
- Public demo site: login page must show unpublished-admin and session-timeout facts in plain text, since visitors are not trained users.
