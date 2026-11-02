# callanchor-apis

A standalone module inside cid-autopsy, excluded from the root tsconfig and ESLint.

Source of truth for CallAnchor's portal API. Read README.md first.

- `openapi/callanchor.openapi.yaml` is the contract. Change it first, then run
  `npm run generate:postman`. Never edit the generated collection by hand.
- Production holds customer PII. Only redacted fixtures are committed; `data/`, `.session`
  and `.env` stay out of git. `npm test` scans for leaks and must pass before a commit.
- Never run `sendOtp`, a `write` operation or `getRecordingLink` against production
  unless the user asked for that specific action. `sendOtp` calls a real phone.
- Don't print or store recording links or session cookies.
