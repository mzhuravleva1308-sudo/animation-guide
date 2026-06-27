# Film data policy

## Adding new films

**Do not add new films manually** through:

- The admin UI (`/admin/new`, `/admin/import`) — disabled/deprecated
- Direct inserts in the Supabase dashboard or SQL editor

New films must go through the **controlled import pipeline** so each record gets:

- Duplicate detection (`lib/insert-film.mjs`, `lib/film-duplicate-check.mjs`)
- Validation and normalized title fields
- Poster fetching/caching (`scripts/cache-posters.mjs`)
- Post-import enrichment (`npm run after-films`)

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

Manual database edits are acceptable **only for correcting existing records** (typos, missing metadata, fixing bad URLs). Do not use manual edits to create new film rows.

## Deprecated admin UI

The former admin pages for manual entry and paste-to-import were removed from the product surface. Routes remain but show a deprecation notice instead of forms. Server APIs used by scripts (`/api/import-film`, `/api/films/check-duplicate`) are kept for pipeline and tooling use.
