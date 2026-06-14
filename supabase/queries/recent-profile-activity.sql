-- Recent profile activity (last 7 days)
-- Run in Supabase SQL editor or psql

SELECT
  l.created_at,
  p.slug AS profile_slug,
  l.event_type,
  f.title AS film_title,
  l.event_data,
  l.user_agent,
  l.referrer
FROM profile_activity_logs l
JOIN profiles p ON p.id = l.profile_id
LEFT JOIN films f ON f.id = l.film_id
WHERE l.created_at >= now() - interval '7 days'
ORDER BY l.created_at DESC
LIMIT 200;

-- Event counts by type (last 7 days)
SELECT
  event_type,
  count(*) AS event_count
FROM profile_activity_logs
WHERE created_at >= now() - interval '7 days'
GROUP BY event_type
ORDER BY event_count DESC;
