-- Batch prediction workflow. Prediction input files are inference-only and are
-- intentionally isolated from import_batches/respondent_records.

create table public.prediction_runs (
  id uuid primary key default gen_random_uuid(),
  filename text not null check (length(trim(filename)) between 1 and 180),
  storage_path text not null unique,
  mime_type text not null,
  byte_size bigint not null check (byte_size > 0 and byte_size <= 10485760),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  original_record_count integer not null default 0 check (original_record_count >= 0),
  valid_record_count integer not null default 0 check (valid_record_count >= 0),
  invalid_record_count integer not null default 0 check (invalid_record_count >= 0),
  duplicate_record_count integer not null default 0 check (duplicate_record_count >= 0),
  missing_data_record_count integer not null default 0 check (missing_data_record_count >= 0),
  uploaded_by uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'uploaded'
    check (status in ('uploaded', 'validated', 'validation_failed', 'processing', 'completed', 'failed')),
  model_versions jsonb not null default '{}'::jsonb check (jsonb_typeof(model_versions) = 'object'),
  summary_json jsonb not null default '{}'::jsonb check (jsonb_typeof(summary_json) = 'object'),
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (valid_record_count + invalid_record_count = original_record_count)
);

create table public.prediction_staged_rows (
  id bigint generated always as identity primary key,
  prediction_run_id uuid not null references public.prediction_runs(id) on delete cascade,
  source_row integer not null check (source_row > 1),
  normalized_data jsonb not null check (jsonb_typeof(normalized_data) = 'object'),
  is_valid boolean not null,
  created_at timestamptz not null default now(),
  unique (prediction_run_id, source_row)
);

create table public.prediction_validation_issues (
  id bigint generated always as identity primary key,
  prediction_run_id uuid not null references public.prediction_runs(id) on delete cascade,
  row_number integer,
  column_name text,
  severity public.issue_severity not null,
  code text not null,
  message text not null,
  raw_value text,
  created_at timestamptz not null default now()
);

alter table public.prediction_results
  alter column respondent_record_id drop not null,
  add column prediction_run_id uuid references public.prediction_runs(id) on delete cascade,
  add column source_row integer check (source_row is null or source_row > 1),
  add column source_identifier text,
  add column interpreted_label text;

alter table public.prediction_results
  add constraint prediction_result_has_source check (
    (respondent_record_id is not null and prediction_run_id is null and source_row is null and source_identifier is null)
    or
    (respondent_record_id is null and prediction_run_id is not null and source_row is not null and source_identifier is not null)
  );

create unique index prediction_results_run_row_kind_unique
  on public.prediction_results(prediction_run_id, source_row, kind)
  where prediction_run_id is not null;
create index prediction_runs_created_idx on public.prediction_runs(created_at desc);
create index prediction_staged_run_valid_idx on public.prediction_staged_rows(prediction_run_id, is_valid);
create index prediction_issues_run_row_idx on public.prediction_validation_issues(prediction_run_id, row_number);
create index prediction_results_run_idx on public.prediction_results(prediction_run_id, source_row);

create trigger prediction_runs_touch before update on public.prediction_runs
for each row execute function public.touch_updated_at();

alter table public.prediction_runs enable row level security;
alter table public.prediction_staged_rows enable row level security;
alter table public.prediction_validation_issues enable row level security;

grant select, insert, update on public.prediction_runs to authenticated;
grant select, insert, delete on public.prediction_staged_rows to authenticated;
grant select, insert, delete on public.prediction_validation_issues to authenticated;
grant usage, select on sequence public.prediction_staged_rows_id_seq to authenticated;
grant usage, select on sequence public.prediction_validation_issues_id_seq to authenticated;

create policy authorized_read_prediction_runs on public.prediction_runs for select to authenticated
using (public.is_authorized_user());
create policy authorized_create_prediction_runs on public.prediction_runs for insert to authenticated
with check (public.is_authorized_user() and uploaded_by = auth.uid());
create policy owner_or_admin_update_prediction_runs on public.prediction_runs for update to authenticated
using (uploaded_by = auth.uid() or public.is_admin())
with check (uploaded_by = auth.uid() or public.is_admin());

create policy owner_or_admin_read_prediction_staging on public.prediction_staged_rows for select to authenticated
using (exists (
  select 1 from public.prediction_runs r
  where r.id = prediction_run_id and (r.uploaded_by = auth.uid() or public.is_admin())
));
create policy owner_or_admin_manage_prediction_staging on public.prediction_staged_rows for all to authenticated
using (exists (
  select 1 from public.prediction_runs r
  where r.id = prediction_run_id and (r.uploaded_by = auth.uid() or public.is_admin())
))
with check (exists (
  select 1 from public.prediction_runs r
  where r.id = prediction_run_id and (r.uploaded_by = auth.uid() or public.is_admin())
));

create policy owner_or_admin_read_prediction_issues on public.prediction_validation_issues for select to authenticated
using (exists (
  select 1 from public.prediction_runs r
  where r.id = prediction_run_id and (r.uploaded_by = auth.uid() or public.is_admin())
));
create policy owner_or_admin_manage_prediction_issues on public.prediction_validation_issues for all to authenticated
using (exists (
  select 1 from public.prediction_runs r
  where r.id = prediction_run_id and (r.uploaded_by = auth.uid() or public.is_admin())
))
with check (exists (
  select 1 from public.prediction_runs r
  where r.id = prediction_run_id and (r.uploaded_by = auth.uid() or public.is_admin())
));

create or replace function public.complete_prediction_run(
  target_run_id uuid,
  result_rows jsonb,
  completed_model_versions jsonb,
  completed_summary jsonb
)
returns integer
language plpgsql security invoker set search_path = public
as $$
declare
  inserted_count integer;
begin
  if jsonb_typeof(result_rows) <> 'array'
     or jsonb_typeof(completed_model_versions) <> 'object'
     or jsonb_typeof(completed_summary) <> 'object' then
    raise exception using errcode = '22023', message = 'Prediction completion payload is invalid.';
  end if;

  perform 1 from public.prediction_runs r
  where r.id = target_run_id and r.status = 'processing'
    and (r.uploaded_by = auth.uid() or public.is_admin())
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'The processing run is unavailable.';
  end if;

  if jsonb_array_length(result_rows) <> (
    select valid_record_count * 2 from public.prediction_runs where id = target_run_id
  ) then
    raise exception using errcode = '22023', message = 'Prediction result count does not match the validated run.';
  end if;

  insert into public.prediction_results (
    prediction_run_id, respondent_record_id, model_id, kind, source_row,
    source_identifier, interpreted_label, predicted_class, probability,
    class_probabilities, factor_associations, input_snapshot, generated_by
  )
  select
    target_run_id,
    null,
    (item->>'model_id')::uuid,
    (item->>'kind')::public.prediction_kind,
    (item->>'source_row')::integer,
    item->>'source_identifier',
    nullif(item->>'interpreted_label', ''),
    item->>'predicted_class',
    (item->>'probability')::double precision,
    item->'class_probabilities',
    case when item->'factor_associations' = 'null'::jsonb then null else item->'factor_associations' end,
    item->'input_snapshot',
    auth.uid()
  from jsonb_array_elements(result_rows) item;

  get diagnostics inserted_count = row_count;
  update public.prediction_runs
  set status = 'completed', model_versions = completed_model_versions,
      summary_json = completed_summary, completed_at = now(), error_message = null
  where id = target_run_id;
  delete from public.prediction_staged_rows where prediction_run_id = target_run_id;
  insert into public.audit_logs(actor_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), 'prediction.completed', 'prediction_run', target_run_id::text,
          jsonb_build_object('result_rows', inserted_count, 'models', completed_model_versions));
  return inserted_count;
end;
$$;

revoke all on function public.complete_prediction_run(uuid, jsonb, jsonb, jsonb) from public;
grant execute on function public.complete_prediction_run(uuid, jsonb, jsonb, jsonb) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('prediction-inputs', 'prediction-inputs', false, 10485760,
  array['text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy prediction_input_owner_insert on storage.objects for insert to authenticated
with check (
  bucket_id = 'prediction-inputs' and public.is_authorized_user()
  and (storage.foldername(name))[1] = auth.uid()::text
);
create policy prediction_input_owner_or_admin_read on storage.objects for select to authenticated
using (
  bucket_id = 'prediction-inputs' and public.is_authorized_user()
  and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
);
create policy prediction_input_owner_delete on storage.objects for delete to authenticated
using (
  bucket_id = 'prediction-inputs' and public.is_authorized_user()
  and (storage.foldername(name))[1] = auth.uid()::text
);
