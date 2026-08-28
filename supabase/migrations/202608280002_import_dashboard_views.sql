-- Main-dashboard analytics are intentionally scoped to committed CSV/XLSX
-- imports. Public survey submissions remain persisted but cannot affect these
-- aggregates.

create index if not exists respondent_records_source_analytics_idx
  on public.respondent_records(source, graduation_year, strand, current_status);

create or replace view public.analytics_import_overview
with (security_invoker = true) as
select
  count(*)::bigint as total_imported_records,
  count(*) filter (where current_status = 'employed')::bigint as employed,
  count(*) filter (where current_status = 'higher_education')::bigint as higher_education,
  count(*) filter (where current_status = 'self_employed')::bigint as self_employed,
  count(*) filter (where current_status = 'training')::bigint as training,
  count(*) filter (where current_status = 'neet')::bigint as neet,
  round(avg(subject_relevance)::numeric, 2) as average_subject_relevance,
  round(avg(preparedness)::numeric, 2) as average_preparedness
from public.respondent_records
where source = 'import';

create or replace view public.analytics_import_by_batch_strand_status
with (security_invoker = true) as
select graduation_year, strand, current_status, count(*)::bigint as respondent_count
from public.respondent_records
where source = 'import'
group by graduation_year, strand, current_status;

grant select on public.analytics_import_overview,
  public.analytics_import_by_batch_strand_status to authenticated;
