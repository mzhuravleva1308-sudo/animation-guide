# Weekly film import

Orchestration around the existing `process-film-batch` pipeline. It does **not** change import/enrichment logic — it claims candidates from a Supabase queue, runs each film through the same pipeline, stores per-film outcomes, and emails a run report.

## Quick start: пополнение очереди

Вручную заполнять поля фильмов в Supabase **не нужно**. Достаточно обычного batch JSON и одной команды enqueue.

### Итоговый сценарий

1. Подготовить JSON в формате `examples/film-import-batch.template.json`.
2. Выполнить:

```bash
APP_ENV=hosted npm run films:enqueue -- --file path/to/batch.json
```

3. При необходимости **безопасно повторить** ту же команду — уже активные (`pending` / `processing`) фильмы будут `skipped_already_queued`, дубликаты не создадутся.
4. Посмотреть размер очереди (SQL ниже).
5. По пятницам (18:00 UTC) получать email-отчёт; при остатке pending **< 7** — предупреждение low queue.

Перед первым использованием один раз:

```bash
npm run hosted:migrate
```

### 1. Подготовить JSON

Формат тот же, что для обычного импорта: `examples/film-import-batch.template.json` / `schemas/film-import-batch.schema.json`.

Один файл может содержать **весь список кандидатов** (30–50 фильмов и больше) — каждый объект из `films[]` станет отдельной строкой очереди.

### 2. (Опционально) провалидировать

```bash
npm run films:validate-batch -- --file path/to/batch.json
```

### 3. Положить фильмы в очередь (hosted)

```bash
APP_ENV=hosted npm run films:enqueue -- --file path/to/batch.json
```

Только план без записи:

```bash
APP_ENV=hosted npm run films:enqueue -- --file path/to/batch.json --dry-run
```

Исправить payload у уже стоящего в активной очереди фильма (вместо второй строки):

```bash
APP_ENV=hosted npm run films:enqueue -- --file path/to/corrected.json --replace-active
```

Пример успешного вывода:

```text
Enqueue plan: 3 film(s) from batch "annecy-2026-july"
- Film title (2026) queue_key=film title:2026 sort_order=1722780000000
- Another Film (2025) queue_key=another film:2025 sort_order=1722780000001
- Third Film (2024) queue_key=third film:2024 sort_order=1722780000002
Enqueue summary for "annecy-2026-july": added=2, skipped_already_queued=1, replaced_active=0
[added] Film title (2026) 8f3a2c1d-....
[skipped_already_queued] Another Film (2025) active=a91b0e22-....
[added] Third Film (2024) c4d5e678-....
```

Повторный запуск того же файла безопасен: уже активные записи пропускаются.

### Что хранится в очереди

| Поле | Содержание |
|------|------------|
| `payload` | **Весь** film-объект из JSON (`jsonb`), без потери полей |
| `queue_key` | `normalize(title):year` — тот же hard-duplicate ключ, что у каталога |
| `tmdb_id` | Извлекается из `source_urls.tmdb`, если есть |
| `title` / `year` | Для отчётов |
| `sort_order` | Порядок обработки (как в файле) |
| `status` | Сразу `pending` |

### Дубликаты при enqueue

Идентичность совпадает с pipeline / `films_prevent_exact_duplicate`: нормализованный title + year (`normalizeFilmString` / SQL `normalize_film_title`). Дополнительно — уникальность `tmdb_id` среди active-строк. Защита на уровне БД: partial unique indexes на `pending`/`processing` (гонка двух enqueue не создаст две active-записи).

| Ситуация | Что происходит |
|----------|----------------|
| Тот же фильм уже `pending` или `processing` | `skipped_already_queued` — вторая active-строка **не** создаётся |
| Фильм уже `completed` или `failed` | Новый `pending` **разрешён** (повторная обработка допустима) |
| Фильм уже есть в каталоге `films` | Enqueue **не блокируется**; в выводе может быть advisory note. Pipeline позже вернёт `duplicate_skipped` → `completed_with_warnings` |
| Дубликат title+year **внутри одного** JSON | Валидация отклонит файл до записи |
| Исправленный payload для active-строки | `--replace-active` обновляет существующую запись |

### Batch из 30–50 фильмов

Да — одной командой. Weekly job забирает по **5** фильмов за запуск (переопределяется через `batch_size` / `WEEKLY_FILM_IMPORT_BATCH_SIZE`).

### Посмотреть очередь и остаток

```sql
select id, title, year, status, queue_key, attempts, sort_order, result_message, film_id
from film_import_queue
order by sort_order, created_at;

select count(*) as pending_remaining
from film_import_queue
where status = 'pending'
  and attempts < max_attempts;
```

Или: `select count_pending_film_import_queue_items();`

### Удалить или исправить ошибочный pending

```sql
delete from film_import_queue
where id = '<queue-uuid>'
  and status = 'pending';
```

Или исправить через enqueue с `--replace-active` (см. выше).

Не трогайте `processing` без необходимости — строка может быть в работе у текущего job.

---

## Where the queue lives

Table: `public.film_import_queue`  
Migrations: `20260804_create_film_import_queue.sql`, `20260805_film_import_queue_active_dedupe.sql`.

Service-role only. Claimed via `claim_film_import_queue_items(limit, stale_after_minutes)` using `FOR UPDATE SKIP LOCKED`.

Each row stores:

- `payload` — one film object matching `schemas/film-import-batch.schema.json`
- `queue_key` / `tmdb_id` — active-queue identity (unique while `pending`/`processing`)
- `sort_order` — processing order (ascending)
- `status` — `pending` → `processing` → `completed` | `completed_with_warnings` | `failed`
- `attempts` / `max_attempts`
- `started_at` / `finished_at` / `locked_at`
- `result_status` / `result_message`
- `film_id` — created film UUID when import succeeds (or existing UUID on duplicate)

## Schedule

GitHub Actions workflow: `.github/workflows/weekly-film-import.yml`

| Setting | Value |
|--------|--------|
| Cron (UTC) | `0 18 * * 5` — every **Friday** at 18:00 UTC |
| Europe/Amsterdam | Friday **20:00** during CEST (UTC+2); Friday **19:00** during CET (UTC+1) |

Default batch size: **5** films per run.

Change defaults without editing code:

- Repository variable `WEEKLY_FILM_IMPORT_BATCH_SIZE` (default 5)
- Repository variable `WEEKLY_FILM_IMPORT_STALE_MINUTES` (default 90; stale `processing` rows are reclaimed)
- Repository variable `WEEKLY_FILM_IMPORT_LOW_QUEUE_THRESHOLD` (default **7**)
- Or edit the cron / defaults in the workflow file

## Low queue warning

After every run the job counts **pending** rows still available for future processing (`status = pending` and `attempts < max_attempts`). Completed and exhausted failed rows are **not** part of this stock.

Retryable failed rows (`status = failed` and `attempts < max_attempts`) are reported separately — they need a manual `films:retry-queue` before they re-enter the pending stock.

If `remainingPending < WEEKLY_FILM_IMPORT_LOW_QUEUE_THRESHOLD` (default **7**, strict less-than), the email includes:

```text
Low film queue: only N films remaining. Please prepare and enqueue a new batch.
```

Subjects:

| Situation | Subject |
|-----------|---------|
| Empty queue (`remainingPending === 0`) | `⚠️ Resonale weekly import — queue is empty` |
| Low queue (`remainingPending < 7`) | `⚠️ Resonale weekly import — 5 added, only 6 remaining` |
| Healthy stock (`remainingPending >= 7`) | `Resonale weekly import — 5 added, 24 remaining` |

The warning also fires when the queue was already thin before the run, when fewer than 5 films were claimed, when part of the batch failed, or when the queue is empty.

Each report lists: pending before run, selected, succeeded, warnings, failed, remaining pending, retryable failed, and the low-queue warning when applicable.
## Manual run

GitHub → Actions → **Weekly film import** → **Run workflow**

Inputs:

- `batch_size` — how many pending films to claim
- `dry_run` — list claimable films only (no lock, no import)
- `skip_email` — do not send Resend mail

Local equivalent:

```bash
APP_ENV=hosted node scripts/run-weekly-film-import.mjs --batch-size 2
APP_ENV=hosted node scripts/run-weekly-film-import.mjs --dry-run --skip-email
```

## GitHub Secrets

Required for the workflow:

| Secret | Purpose |
|--------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Hosted Supabase URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role (queue + import writes) |
| `OPENAI_API_KEY` | Tags / embeddings |
| `TMDB_API_KEY` | Poster matching |
| `YOUTUBE_API_KEY` | Trailers |
| `RESEND_API_KEY` | Transactional email |
| `WEEKLY_FILM_IMPORT_REPORT_EMAIL` | Recipient (project owner) |

Optional:

| Secret / var | Purpose |
|--------------|---------|
| `WEEKLY_FILM_IMPORT_EMAIL_FROM` | Verified Resend from-address (defaults to Resend onboarding sender) |
| `WEEKLY_FILM_IMPORT_BATCH_SIZE` (Actions variable) | Default batch size when schedule runs (default **5**) |
| `WEEKLY_FILM_IMPORT_STALE_MINUTES` (Actions variable) | Stale processing reclaim window |
| `WEEKLY_FILM_IMPORT_LOW_QUEUE_THRESHOLD` (Actions variable) | Warn when remaining pending is **strictly below** this (default **7**) |

Email uses [Resend](https://resend.com) because the app has no other transactional mailer (Supabase SMTP is auth-only). One API key + one HTTPS call is enough for a weekly report.

## Retry a failed film

```bash
APP_ENV=hosted node scripts/retry-film-import-queue.mjs --id <queue-uuid>
# if attempts already hit max_attempts:
APP_ENV=hosted node scripts/retry-film-import-queue.mjs --id <queue-uuid> --bump-max-attempts
```

Then either wait for the next scheduled run or trigger the workflow manually.

## Where to read the full report

1. Email from the run (always sent unless `--skip-email` / `skip_email` input).
2. GitHub Actions job summary on the workflow run page.
3. Queue rows in Supabase: `select * from film_import_queue order by updated_at desc;`

## Disable the automatic schedule temporarily

In GitHub → Actions → **Weekly film import**:

- Use **…** → **Disable workflow**, or
- Comment out / remove the `schedule:` block in `.github/workflows/weekly-film-import.yml` and push.

Manual `workflow_dispatch` still works while the schedule is disabled if the workflow file remains enabled.

## Queue lifecycle

```
pending  --claim-->  processing  --pipeline ok-->  completed
                                 --duplicate---->  completed_with_warnings
                                 --pipeline err->  failed
processing (locked_at older than stale window, attempts < max)
         --reclaim--> processing (attempts++)
processing (stale + attempts >= max)
         --job start--> failed ("Abandoned after max attempts…")
```

Successful films are never claimed again. Partial catalog writes are rolled back by the existing pipeline (`failed_rolled_back`) before the queue row is marked `failed`.

## Safe end-to-end check without publishing films

1. Ensure the migration exists on a **local** or non-production Supabase.
2. Enqueue a validated batch against that environment (not hosted), or use hosted with `catalog_visible: false` only if you accept a soft-hidden row.
3. Prefer:

```bash
APP_ENV=hosted node scripts/run-weekly-film-import.mjs --dry-run --skip-email
```

This proves claim selection and reporting without locking or importing.

4. Unit tests (no external APIs / no real email):

```bash
node --test lib/film-import-queue.test.mjs
```

## Parallelism

- Workflow `concurrency.group: weekly-film-import` prevents overlapping Actions runs.
- DB claim uses `FOR UPDATE SKIP LOCKED` so two runners cannot take the same row.
