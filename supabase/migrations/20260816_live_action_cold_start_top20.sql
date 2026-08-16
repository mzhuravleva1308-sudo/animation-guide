-- Live-action cold-start opening order (analogous to animation top-20).
-- Catalogs are filtered by media_type, so the 120..101 band does not collide
-- with animation cold-start scores.
-- sortFilmsByColdStart + diversity rerank remain the only sorter.

UPDATE public.films AS f
SET cold_start_score = v.score
FROM (
  VALUES
    ('01946329-f6ba-413f-869a-35305dff97ee'::uuid, 120, 'Perfect Days'),
    ('303cc244-ebca-4ea2-8a1e-25d5d066933f'::uuid, 119, 'Portrait of a Lady on Fire'),
    ('d7378a24-f147-4fa2-bf5b-7f281cac5bed'::uuid, 118, 'Moonlight'),
    ('54e96253-bc62-47ff-a1fe-913d0e93340a'::uuid, 117, 'All We Imagine as Light'),
    ('45b746fe-300f-4b75-b923-be9b21036a3e'::uuid, 116, 'Godland'),
    ('3345e288-f544-4f74-991e-0478e0abb62f'::uuid, 115, 'The Banshees of Inisherin'),
    ('e2f99077-2a3a-4c6a-8f6f-a05e80aba327'::uuid, 114, 'Little Forest'),
    ('8c21af4b-56ae-4754-a4db-0c0c7397424b'::uuid, 113, 'In the Mood for Love'),
    ('3eead01f-c9f5-4915-b934-fabfedd3aafd'::uuid, 112, 'Happy as Lazzaro'),
    ('34dd55b6-0627-4982-b15a-2b66786c832d'::uuid, 111, 'Atlantics'),
    ('1c6079ff-2560-4434-8fce-a90964e72557'::uuid, 110, 'The Quiet Girl'),
    ('0a02751a-2d4d-4dd7-8f15-ff78ffbf337e'::uuid, 109, 'First Cow'),
    ('1731e75d-430c-41c0-817b-626da23967a5'::uuid, 108, 'Burning'),
    ('d2cd9f14-f3d3-4439-a3c4-d33bd41ff06a'::uuid, 107, 'The Taste of Things'),
    ('0fca0dbf-002d-46a4-b55c-bd8abfd8a406'::uuid, 106, 'The Eight Mountains'),
    ('aa64676e-97d0-480e-9483-221d0efea32c'::uuid, 105, 'A Separation'),
    ('bb6dfb48-8804-43a1-ae1d-c45d98f4c741'::uuid, 104, 'Lost in Translation'),
    ('9fc3be44-c7f5-41b3-b9bf-0995bfe5aed7'::uuid, 103, 'Evil Does Not Exist'),
    ('70586bae-73bd-439f-b79c-f81e0c53dfdc'::uuid, 102, 'Summer 1993'),
    ('c721118c-01bf-4e3f-a8ec-a7c57d04a248'::uuid, 101, 'Tracks')
) AS v(id, score, expected_title)
WHERE f.id = v.id
  AND f.title = v.expected_title
  AND f.media_type = 'live_action';
