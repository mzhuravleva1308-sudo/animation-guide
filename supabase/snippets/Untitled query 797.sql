select title, year, quick_filters
from public.films
where 'sci-fi' = any(quick_filters)
order by year desc nulls last, title;