select f.title, f.quick_filters, r.rating
from public.films f
left join public.film_ratings r on r.film_id = f.id
where 'connection' = any(f.quick_filters)
order by r.rating nulls first, f.title;