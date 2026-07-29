-- Reorder cold-start catalog opening (same 20 films, new sequence).
-- Applied via films.cold_start_score; sortFilmsByColdStart remains the only sorter.
-- Scores 120..101 sit above remaining scored films (max 82) so positions 21+ stay put.

UPDATE public.films AS f
SET cold_start_score = v.score
FROM (
  VALUES
    ('faebbb5e-5176-40fb-a542-256f3ed5a941'::uuid, 120, 'Flow'),
    ('d789aa51-f72e-40b2-bcff-2dd5fcc2b00d'::uuid, 119, 'Persepolis'),
    ('e1e116e0-528c-471a-a689-332af260fae5'::uuid, 118, 'Mary and Max'),
    ('60d2420a-0dda-472d-bcc3-77f69484c038'::uuid, 117, 'Robot Dreams'),
    ('27eb2bf6-22a3-49b4-922f-81fb2757322c'::uuid, 116, 'My Life as a Courgette'),
    ('d7873b1c-6414-477e-8da4-29af43ff6c98'::uuid, 115, 'Fantastic Planet'),
    ('6557a0ef-adf1-4c1c-9457-5adf00497a10'::uuid, 114, 'Wolfwalkers'),
    ('ee0c4431-7264-4e3b-b0a2-968e96163731'::uuid, 113, 'I Lost My Body'),
    ('b53212ed-840a-43a8-bc27-e0a505114e18'::uuid, 112, 'The Triplets of Belleville'),
    ('0ae7abb9-72b5-49a9-9693-0fb351094c3f'::uuid, 111, 'Flee'),
    ('612b63d5-b719-4bfb-abdf-1b92422f8db5'::uuid, 110, 'The Red Turtle'),
    ('8760b376-56fe-4ddc-8435-62a8ca8a081b'::uuid, 109, 'Anomalisa'),
    ('0be04901-0401-4be6-acb5-a82125f7abc3'::uuid, 108, 'Song of the Sea'),
    ('cc94d66f-2fba-41fd-8e03-a9d4c21db159'::uuid, 107, 'Memoir of a Snail'),
    ('612b5f04-5f47-4668-b9a7-c3b51947e817'::uuid, 106, 'Chicken for Linda!'),
    ('39597074-9cad-403a-885f-bcf2a69e8ee1'::uuid, 105, 'A Town Called Panic'),
    ('76f428a1-a622-4fba-8d1a-83a3c9734cbd'::uuid, 104, 'Waltz with Bashir'),
    ('f35236e8-ceda-403c-ac47-8c74b2568d76'::uuid, 103, 'The Wolf House'),
    ('1b6d1e20-962c-47a0-9545-d854a33eb5de'::uuid, 102, 'No Dogs or Italians Allowed'),
    ('00c8d7ea-0156-4efd-9ee1-e36115bddc9c'::uuid, 101, 'The Illusionist')
) AS v(id, score, expected_title)
WHERE f.id = v.id
  AND f.title = v.expected_title;
