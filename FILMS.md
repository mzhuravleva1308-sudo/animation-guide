# Film data policy

## Weekly import queue

Candidate films for scheduled import live in Supabase `film_import_queue`. See [WEEKLY_FILM_IMPORT.md](./WEEKLY_FILM_IMPORT.md) for enqueueing, GitHub Actions schedule, secrets, and retries.

## Discovery approve → prep → batch Go Live

1. Admin **Approve** on `/admin/film-discovery` maps the candidate (preserve-first), enqueues `film_import_queue` (`origin=discovery_release`, hidden), and **starts prep immediately** (same `process-film-batch` pipeline via `after()` — embeddings + poster cache; profile scores deferred).
2. Watch progress on `/admin/film-releases`.
3. **Go live** on `/admin/film-releases` (batch): set `catalog_visible=true` for selected ready films, then **score only those film IDs** for every profile (upsert; no full-catalog rebuild). Likes still enqueue `profile_score_rebuild_jobs` for a full per-profile rebuild.

## Adding new films

**Do not add new films manually** through:

- The admin UI (`/admin/new`, `/admin/import`) — disabled/deprecated
- Direct inserts in the Supabase dashboard or SQL editor

New films must go through the **controlled import pipeline** so each record gets:

- Duplicate detection (`lib/insert-film.mjs`, `lib/film-duplicate-check.mjs`)
- Validation and normalized title fields
- Poster fetching/caching (`scripts/cache-posters.mjs`) — catalog readiness requires a Storage `poster_url` in `film-posters`
- Post-import enrichment (`npm run after-films`) — or the discovery release prep path above

Hosted poster health check (read-only):

```bash
npm run hosted:audit-posters
```

For a **single new film**, run scoped enrichment so only that row is processed:

```bash
node scripts/import-<film>.mjs
# or, after insert:
node scripts/after-films.mjs --film-id <uuid>
node scripts/after-films.mjs --title "Film Title"
```

Full-catalog enrichment remains the default when no scope flags are passed:

```bash
npm run after-films
```

Use Cursor-assisted import flows or scripts that call `insertFilmWithDuplicateCheck` rather than raw `INSERT` statements.

## Correcting existing films

Manual database edits are acceptable **only for correcting existing records** (typos, missing metadata, fixing bad URLs). Do not use manual edits to create new film rows. Never overwrite fields that are already filled when running enrichment scripts unless you intend a deliberate correction.

## Deprecated admin UI

The former admin pages for manual entry and paste-to-import were removed from the product surface. Routes remain but show a deprecation notice instead of forms. Server APIs used by scripts (`/api/import-film`, `/api/films/check-duplicate`) are kept for pipeline and tooling use.
