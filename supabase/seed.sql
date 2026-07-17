-- Local dev seed: sample catalog + dedicated E2E test profile.
-- Match E2E_PROFILE_SLUG / E2E_PROFILE_TOKEN in .env.local to the profile below.

INSERT INTO public.films (
  id,
  title,
  director,
  year,
  country,
  duration_minutes,
  synopsis,
  technique,
  moods,
  aesthetic_tags,
  narrative_tags,
  cold_start_score
) VALUES
  (
    '11111111-1111-4111-8111-111111111101',
    'The Red Turtle',
    'Michael Dudok de Wit',
    2016,
    'France',
    80,
    'A man washes ashore on a deserted island and meets a mysterious red turtle.',
    '2D animation',
    ARRAY['melancholy', 'wonder', 'solitude'],
    ARRAY['watercolor', 'minimalist'],
    ARRAY['survival', 'fable'],
    0.92
  ),
  (
    '11111111-1111-4111-8111-111111111102',
    'Lorenzo',
    'José Luis Aguirre',
    2004,
    'Spain',
    7,
    'A boy discovers how drawing can change his life.',
    '2D animation',
    ARRAY['joy', 'nostalgia'],
    ARRAY['sketchy', 'expressive'],
    ARRAY['coming of age'],
    0.88
  ),
  (
    '11111111-1111-4111-8111-111111111103',
    'Mind Games',
    'Various',
    2010,
    'International',
    12,
    'Short anthology exploring playful visual ideas.',
    'mixed media',
    ARRAY['playful', 'surreal'],
    ARRAY['graphic', 'bold color'],
    ARRAY['experimental'],
    0.75
  )
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (
  id,
  name,
  slug,
  share_token
) VALUES (
  '22222222-2222-4222-8222-222222222201',
  'E2E Test Profile',
  'e2e-test',
  'local-e2e-test-token'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.profiles (
  id,
  name,
  slug,
  share_token
) VALUES
  (
    '22222222-2222-4222-8222-222222222202',
    'E2E Test Profile (chromium)',
    'e2e-test-chromium',
    'local-e2e-chromium-token'
  ),
  (
    '22222222-2222-4222-8222-222222222203',
    'E2E Test Profile (firefox)',
    'e2e-test-firefox',
    'local-e2e-firefox-token'
  ),
  (
    '22222222-2222-4222-8222-222222222204',
    'E2E Test Profile (webkit)',
    'e2e-test-webkit',
    'local-e2e-webkit-token'
  ),
  (
    '22222222-2222-4222-8222-222222222205',
    'E2E Test Profile (mobile-chrome)',
    'e2e-test-mobile-chrome',
    'local-e2e-mobile-chrome-token'
  ),
  (
    '22222222-2222-4222-8222-222222222206',
    'E2E Test Profile (mobile-safari)',
    'e2e-test-mobile-safari',
    'local-e2e-mobile-safari-token'
  )
ON CONFLICT (id) DO NOTHING;
