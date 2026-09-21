# Personal guide security

## Scope and trust boundary

`firestore.rules` and `storage.rules` enforce authorization for Firebase client SDK requests. The Admin SDK, service accounts, privileged Google Cloud access, and Firebase Console access are separate IAM trust boundaries and can bypass these rules. No client-granted editor/admin role or UID allowlist is used. A verified Google identity means both `firebase.sign_in_provider == 'google.com'` and `email_verified == true` in the Firebase-issued token; a nickname is not identity verification.

This change was tested only against `demo-acer-wiki` on loopback emulators with synthetic identities. It does not deploy rules, modify production records, or prove a real Google OAuth sign-in. Browser/UI testing and any later deployment are separate activities.

## Firestore contract

Only `guides/{id}` is accessible. Other collections and nested subcollections are denied.

| Field | Required validation |
| --- | --- |
| `authorId` | String; creating user's Firebase UID; immutable |
| `nickname` | String, 1–30 characters |
| `title` | String, 1–120 characters |
| `category` | `초보자`, `병사·조합`, `전투`, `성장·운영`, or `기타` |
| `body` | String, at most 100,000 characters |
| `status` | `draft` or `published` |
| `createdAt` | Timestamp, `request.time` on creation; immutable |
| `updatedAt` | Timestamp, `request.time` on every creation/update |

All fields are required, unknown fields are rejected, and null/wrong-type values are rejected. Use `serverTimestamp()` for new timestamps and retain the original `createdAt` on replacement writes. A verified Google author can create, edit, publish, unpublish, or delete only their own guide.

Anyone can get a published guide, including all its fields (`authorId`, nickname, body, timestamps). Only its verified Google owner can get a draft. `get` is separate from `list`; reading one document does not require a query limit. Every list query requires `limit <= 20` and a provably authorized scope:

- Public feed: `where('status', '==', 'published')`, `orderBy('updatedAt', 'desc')`, `limit(20)`.
- My guides: `where('authorId', '==', currentUid)`, `orderBy('updatedAt', 'desc')`, `limit(20)`.
- Rules are not post-query filters. Unscoped queries are denied even if there happen to be no private documents.

`firestore.indexes.json` defines the two collection-scope composite indexes for those queries. The emulator validates authorization but does not prove that production composite indexes exist or have finished building. No TTL policy, backup schedule, or point-in-time recovery is enabled by these files.

### Body rendering is another security boundary

Rules cannot parse JSON, validate TipTap nodes/marks/attributes, sanitize links, or detect script payloads. They deliberately only enforce the body's string type and size. Clients must parse and validate JSON with a restricted document schema before rendering in read-only TipTap, reject malformed/unsupported structures and unsafe URL protocols, and never render this string as trusted HTML. A client can bypass its editor and store invalid JSON; all readers must handle this safely. The rules tests are not an XSS audit of the renderer.

## Storage contract

Only `guide-images/{uid}/{guideId}/{slot}.webp` is supported. The filename is exactly `0.webp` through `9.webp`, without extra path components or leading zeros.

- Create/overwrite: verified Google user matching `{uid}`, existing Firestore parent `guides/{guideId}` whose `authorId` matches `{uid}`, declared `contentType == 'image/webp'`, and size at most 1,048,576 bytes.
- Get: the parent must exist and match the UID prefix, for **all** readers. Published parents permit public reads; drafts permit only the verified Google owner.
- List: always denied, including owners. Clients address the ten known slot paths directly.
- Delete: verified Google UID-prefix owner with a valid filename, even if the parent has already been removed. This permits explicit orphan cleanup. Deletion never grants an orphan read or upload permission.
- All other object paths deny read/write/delete.

Firestore and Storage deletion is not a cross-service atomic transaction. Delete the known objects explicitly; if document deletion happens first, the original owner can still delete known orphan slots. Orphans are not automatically removed. Do not recycle guide IDs across authors.

Storage rules use `firestore.exists` / `firestore.get` against the default Firestore database. Before a later production rules deployment, the exact Firebase Storage service agent must be authorized for cross-service Firestore rule evaluation (`roles/firebaserules.firestoreServiceAgent`). This is an operator IAM prerequisite, not a client permission. The integration suite exercises real Storage-to-Firestore emulator lookups; it does not change or independently verify production IAM.

### Downloads and privacy

Use authenticated SDK `getBlob()` in browser clients (the Node integration tests use `getBytes()`), then temporary browser blob URLs. Revoke those local URLs when no longer needed. Do not persist or render `getDownloadURL()` URLs for private assets. Load only known permitted paths, not bucket listings. Configure only the needed CORS origins for browser SDK downloads; CORS is not an authorization boundary.

**Firebase download-token URLs are bearer capabilities, not ongoing per-request draft authorization.** Previously issued/shared token URLs can outlive a published-to-draft transition. If any such URLs have been exposed, revoke their tokens through a trusted operator workflow and account for copies/caches; merely changing the parent's status is not a guarantee that those URLs stop working. A published asset or guide can always have been downloaded/copied by a reader. The passing unpublish test verifies fresh rule-enforced SDK downloads, not revocation of cached copies or token URLs.

### No server-side content inspection

There is **no backend file-sniffing, image decoding/re-encoding, malware scanning, or content moderation service** in this change. MIME and filename are client declarations. Malicious/non-image bytes labeled `image/webp` can satisfy the rules; the tests intentionally include synthetic bytes to avoid suggesting otherwise. Browser resizing/re-encoding improves the normal workflow but is not trusted server-side enforcement. Strict image authenticity would require a trusted processing pipeline before making objects available.

## Abuse, quotas, and spending

**These rules do not implement a per-user rate limit and are not a hard spending cap.** In particular:

- Any verified Google user can create arbitrarily many distinct guide documents; ten image slots applies per guide, not per account.
- Users can repeatedly overwrite allowed objects and update documents. File/body size limits do not limit request counts, total storage, egress, or accumulated versions.
- Anonymous readers can repeatedly query published documents or download published images. A query limit of 20 only bounds one response; repeated queries and pagination remain possible.
- Cross-service Storage authorization can incur Firestore read costs. Rules evaluations, indexes, repeated denied/allowed traffic, storage, and bandwidth are not a global monetary budget.
- Budget alerts are notifications, **not an automatic spending ceiling**. App Check can be an additional abuse signal/control, but is not implemented here and is not a replacement for authorization or server-enforced quotas.

Operators should review usage, billing alerts, IAM, bucket retention/soft-delete/versioning settings, and incident shutoff procedures. Stronger quotas/rate budgets require a trusted backend and enforced accounting; they cannot be obtained from this stateless client-only design. These files do not enable paid TTL, backups, PITR, or modify bucket retention settings. Dependency audit results are separate from access-control assurance; a clean production dependency audit does not establish whole-application security.

## Reproduce the local integration suite

Prerequisites used: Node 22, Firebase SDK 12.19.0, `@firebase/rules-unit-testing` 5.0.2, Firebase CLI 13.29.1, Java 11. Existing project dependencies must already be installed.

From the repository root:

```sh
firebase emulators:exec --config firebase.emulators.json --project demo-acer-wiki --only firestore,storage,auth --non-interactive "node --test --test-concurrency=1 tests/firebase-rules.test.mjs"
```

For an independently started local browser-test session, after stopping the suite's processes:

```sh
firebase emulators:start --config firebase.emulators.json --project demo-acer-wiki --only firestore,storage,auth
```

The configuration binds Auth `127.0.0.1:9099`, Firestore `127.0.0.1:8180`, Storage `127.0.0.1:9199`, hub `127.0.0.1:4400`, and logging `127.0.0.1:4500`; emulator UI is disabled. Firestore's CLI-managed websocket also uses port 9150. Check those ports before starting. UI development may opt into these endpoints with `VITE_GUIDE_EMULATORS=1`; never connect a local test to production as a fallback.

The test module hardcodes the demo project and bucket, rejects a non-demo project environment, and requires exact loopback emulator host environment variables before initializing any Firebase client. Fixtures are synthetic SDK writes through `withSecurityRulesDisabled`; assertions run with rules enabled. No service-account file, cloud credential, real email address, or real Google login is used. The suite clears **all demo Firestore and Storage fixture data** before each test. Do not run it against the same emulator instance used for interactive browser testing.

TDD verification progressed from deny-all rules to a passing creation slice, observed schema-rejection failures before adding schema checks, observed authorized read/edit/query failures before adding those permissions, and observed authorized image-operation failures before adding Storage policy. Full final suite: **146 passed, 0 failed**, including real cross-service authorization and parent-deletion cleanup.

On this Windows/Java 11/CLI 13.29.1 combination, successful runs can emit a Storage rules-runtime `NullPointerException` only during emulator shutdown, after the test script has reported exit 0. The Firestore Java child can also survive the CLI's stop message and hold port 8180. Check the exact process command line and listening ports; stop only the owned `cloud-firestore-emulator` process for `demo-acer-wiki`, this repository's rules, and port 8180. Do not kill unrelated Java/emulator processes. A green TAP summary does not mean the ports are already free.

## Reference documentation

Official Firebase documentation: Firestore “Securely query data”; Cloud Storage “Use conditions in Firebase Cloud Storage Security Rules”; Cloud Storage Web “Download files”; Local Emulator Suite rules unit testing. The checked-in rules and executable tests are the exact application contract; emulator success is not a production deployment claim.
