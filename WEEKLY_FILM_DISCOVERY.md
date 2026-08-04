# Weekly film discovery

First version of the **discovery** workflow (find + review candidates).  
This is **not** the weekly import/enrichment pipeline (`WEEKLY_FILM_IMPORT.md`).

## Safety defaults

| Action | Default |
|--------|---------|
| Hosted migration apply | **Not run** — local SQL only until you confirm |
| Scheduled live discovery | Gated by `WEEKLY_FILM_DISCOVERY_ENABLED=1` |
| Schedule live writes | Also needs `WEEKLY_FILM_DISCOVERY_LIVE=1` (otherwise dry-run) |
| Seed 50 candidates write | Needs `WEEKLY_FILM_DISCOVERY_SEED_CONFIRM=1` after dry-run |
| Approve | Sets `review_status=approved` only — **no** `films` insert, enrichment, poster, trailer, synopsis |

## Exclusion index (Researcher + Eligibility)

Built in `lib/film-discovery-exclusion.mjs` / `buildRoundExclusionIndex` (workflow).

| Source table | Included rows |
|--------------|---------------|
| `films` | all (compact identity only) |
| `film_discovery_candidates` | `pending_review`, `approved`, permanent `rejected`, retriable `rejected` |
| current run | passed candidates + permanent fails |

**Live Researcher prompt** includes the **full** compact exclusion list (every entry), one line each:

```text
- Seoul Station / 서울역 (2016)
```

Only `title`, `original_title`, `year`. No synopsis/directors/countries/etc.

Programmatic `filterResearcherCandidatesAgainstIndex` and Eligibility still re-check after the model responds.

Retriable rejects also carry prior `source_urls` in the programmatic index. Re-propose only with **new** source URLs.

Permanent `reject_reason` codes: `duplicate`, `not_animation`, `hybrid_animation`, `short_film`, `series_or_episode`, `primarily_for_children`, `not_independent_auteur_festival`.

Retriable: `insufficient_sources`, `metadata_unclear`, `eligibility_uncertain`.

Unicode-safe identity: `normalizeDiscoveryIdentityString` (NFKC, keeps `\p{L}`). Empty norms are never dedupe keys. Fuzzy (≥80 similarity) is a verification signal only — not an automatic FAIL.

Manager never receives the exclusion index (analytics brief only).

## Architecture

```text
catalog-analytics data
        │
        ▼
   Manager brief (deterministic from analyzeFilmCatalog)
        │
        ▼
   Researcher (OpenAI) → up to 3 rounds → 10 candidates
        │
        ▼
   Eligibility reviewer (deterministic + optional LLM)
        │
        ▼
   film_discovery_candidates (pending_review)
        │
        ├── Resend email (owner)
        └── /admin/film-discovery  Approve | Reject
```

Staging tables (migration `20260806_create_film_discovery_candidates.sql`):

- `film_discovery_batches`
- `film_discovery_candidates`

Statuses on candidates:

- `pending_review` — awaiting manual decision
- `approved` — approved **candidate** (not published, not enriched)
- `rejected` — rejected (optional `reject_reason`)

Public catalog still uses only `films.catalog_visible = true`. Discovery rows never appear there.

## Commands

Dry-run discovery (no persist, no email):

```bash
WEEKLY_FILM_DISCOVERY_ENABLED=1 APP_ENV=hosted npm run films:discovery -- --dry-run
```

Dry-run minimal seed (50-film fixture or your file):

```bash
npm run films:discovery-seed -- --file examples/imports/film-discovery-minimal-50.fixture.json --dry-run
```

Real seed write (only after you confirm):

```bash
WEEKLY_FILM_DISCOVERY_SEED_CONFIRM=1 APP_ENV=hosted npm run films:discovery-seed -- --file path/to/real-50.json
```

## Email recipient

Uses existing Resend infra:

1. `WEEKLY_FILM_DISCOVERY_REPORT_EMAIL` if set
2. else `WEEKLY_FILM_IMPORT_REPORT_EMAIL`

From address falls back the same way (`WEEKLY_FILM_DISCOVERY_EMAIL_FROM` → `WEEKLY_FILM_IMPORT_EMAIL_FROM` → Resend onboarding default).

## Admin UI

`/admin/film-discovery` — Approve / Reject for `pending_review` rows.  
API: `POST /api/admin/film-discovery/review` with `{ id, action, reject_reason? }`.

## Relation to weekly import

| | Discovery | Import queue |
|--|-----------|--------------|
| Table | `film_discovery_candidates` | `film_import_queue` |
| Goal | Find + manual gate | Enrich + insert into `films` |
| Schedule | Thu 22:00 UTC (gated) | Fri 18:00 UTC |
| Email | discovery report | import run report |

Approved discovery candidates are **not** auto-enqueued into `film_import_queue` in v1.
