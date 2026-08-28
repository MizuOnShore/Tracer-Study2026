-- DJIHS tracer decision-support system
-- Apply with `supabase db push` to a new Supabase project.

create extension if not exists pgcrypto;

create type public.app_role as enum ('admin', 'user');
create type public.account_status as enum ('active', 'inactive');
create type public.import_status as enum ('uploaded', 'validated', 'committed', 'failed');
create type public.record_source as enum ('survey', 'import');
create type public.post_shs_status as enum (
  'higher_education', 'employed', 'self_employed', 'training', 'neet'
);
create type public.model_kind as enum ('pathway', 'neet');
create type public.model_status as enum ('training', 'evaluated', 'active', 'retired', 'failed');
create type public.prediction_kind as enum ('pathway', 'neet');
create type public.issue_severity as enum ('error', 'warning');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique check (email = lower(email)),
  full_name text not null check (length(trim(full_name)) between 2 and 150),
  role public.app_role not null default 'user',
  status public.account_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  uploaded_by uuid not null references public.profiles(id) on delete restrict,
  original_file_name text not null,
  storage_path text not null unique,
  mime_type text not null,
  byte_size bigint not null check (byte_size > 0 and byte_size <= 10485760),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  status public.import_status not null default 'uploaded',
  total_rows integer not null default 0 check (total_rows >= 0),
  valid_rows integer not null default 0 check (valid_rows >= 0),
  invalid_rows integer not null default 0 check (invalid_rows >= 0),
  committed_at timestamptz,
  failure_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sha256, uploaded_by),
  check (valid_rows + invalid_rows <= total_rows)
);

create table public.respondent_records (
  id uuid primary key default gen_random_uuid(),
  import_batch_id uuid references public.import_batches(id) on delete restrict,
  source public.record_source not null,
  source_row_number integer check (source_row_number is null or source_row_number > 0),
  email text not null check (email = lower(email)),
  full_name text not null check (length(trim(full_name)) between 2 and 150),
  gender text not null check (gender in ('Female', 'Male', 'Prefer not to say', 'Other')),
  age smallint not null check (age between 14 and 100),
  graduation_year smallint not null check (graduation_year between 2018 and 2025),
  strand text not null check (strand in ('ABM', 'GAS', 'HUMMS', 'ICT', 'STEM', 'SPORTS', 'TVL')),
  certification text not null,
  current_status public.post_shs_status not null,
  subject_relevance smallint not null check (subject_relevance between 1 and 5),
  preparedness smallint not null check (preparedness between 1 and 5),
  challenges text not null,
  support_needed text not null,
  feedback text not null,
  canonical_data jsonb not null default '{}'::jsonb check (jsonb_typeof(canonical_data) = 'object'),
  record_fingerprint text not null unique check (record_fingerprint ~ '^[a-f0-9]{64}$'),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((source = 'import' and import_batch_id is not null) or (source = 'survey' and import_batch_id is null))
);

create table public.survey_responses (
  id uuid primary key default gen_random_uuid(),
  respondent_record_id uuid not null unique references public.respondent_records(id) on delete cascade,
  questionnaire_version text not null default 'DJIHS-SHS-GRAD-SURVEY-2025-v1',
  consent_given boolean not null check (consent_given),
  higher_education_course text,
  higher_education_relation text check (higher_education_relation is null or higher_education_relation in ('Yes', 'No', 'Partially')),
  employer_name text,
  job_title text,
  employment_relation text check (employment_relation is null or employment_relation in ('Yes', 'No', 'Partially')),
  business_nature text,
  business_relation text check (business_relation is null or business_relation in ('Yes', 'No', 'Partially')),
  training_center text,
  training_title text,
  training_relation text check (training_relation is null or training_relation in ('Directly related', 'Indirectly related', 'Not related / new skill')),
  neet_reasons text[],
  actively_seeking boolean,
  submitted_at timestamptz not null default now(),
  client_request_id uuid not null unique,
  check (
    (higher_education_course is null and higher_education_relation is null)
    or (length(trim(higher_education_course)) > 0 and higher_education_relation is not null)
  ),
  check (
    (employer_name is null and job_title is null and employment_relation is null)
    or (length(trim(employer_name)) > 0 and length(trim(job_title)) > 0 and employment_relation is not null)
  ),
  check (
    (business_nature is null and business_relation is null)
    or (length(trim(business_nature)) > 0 and business_relation is not null)
  ),
  check (
    (training_center is null and training_title is null and training_relation is null)
    or (length(trim(training_center)) > 0 and length(trim(training_title)) > 0 and training_relation is not null)
  ),
  check ((neet_reasons is null and actively_seeking is null) or (cardinality(neet_reasons) > 0 and actively_seeking is not null))
);

-- Contains only one-way HMAC digests, never raw network addresses. This table
-- is private and is used solely by the server-only survey RPC.
create table public.survey_rate_limits (
  ip_hash text primary key check (ip_hash ~ '^[a-f0-9]{64}$'),
  window_started_at timestamptz not null default now(),
  attempt_count smallint not null default 1 check (attempt_count > 0),
  updated_at timestamptz not null default now()
);

create table public.import_validation_issues (
  id bigint generated always as identity primary key,
  import_batch_id uuid not null references public.import_batches(id) on delete cascade,
  row_number integer,
  column_name text,
  severity public.issue_severity not null,
  code text not null,
  message text not null,
  raw_value text,
  created_at timestamptz not null default now()
);

create table public.import_staged_rows (
  id bigint generated always as identity primary key,
  import_batch_id uuid not null references public.import_batches(id) on delete cascade,
  row_number integer not null check (row_number > 1),
  normalized_data jsonb not null check (jsonb_typeof(normalized_data) = 'object'),
  record_fingerprint text not null check (record_fingerprint ~ '^[a-f0-9]{64}$'),
  is_valid boolean not null,
  created_at timestamptz not null default now(),
  unique (import_batch_id, row_number)
);

create table public.model_registry (
  id uuid primary key default gen_random_uuid(),
  kind public.model_kind not null,
  version text not null,
  status public.model_status not null default 'training',
  artifact_path text,
  preprocessing_path text,
  metadata_path text,
  sha256 text check (sha256 is null or sha256 ~ '^[a-f0-9]{64}$'),
  feature_schema_version text not null,
  training_data_hash text check (training_data_hash is null or training_data_hash ~ '^[a-f0-9]{64}$'),
  training_record_count integer check (training_record_count is null or training_record_count > 0),
  activated_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (kind, version)
);

create unique index one_active_model_per_kind
  on public.model_registry(kind) where status = 'active';

create table public.model_metrics (
  id bigint generated always as identity primary key,
  model_id uuid not null references public.model_registry(id) on delete cascade,
  split_name text not null check (split_name in ('validation', 'test')),
  metric_name text not null,
  metric_value double precision,
  class_label text,
  matrix jsonb,
  created_at timestamptz not null default now(),
  unique nulls not distinct (model_id, split_name, metric_name, class_label)
);

create table public.cluster_profiles (
  id bigint generated always as identity primary key,
  model_id uuid not null references public.model_registry(id) on delete cascade,
  cluster_id integer not null check (cluster_id >= 0),
  interpreted_label text,
  profile jsonb not null check (jsonb_typeof(profile) = 'object'),
  interpretation_approved_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (model_id, cluster_id)
);

create table public.prediction_results (
  id uuid primary key default gen_random_uuid(),
  respondent_record_id uuid not null references public.respondent_records(id) on delete restrict,
  model_id uuid not null references public.model_registry(id) on delete restrict,
  kind public.prediction_kind not null,
  predicted_class text not null,
  probability double precision not null check (probability between 0 and 1),
  class_probabilities jsonb not null check (jsonb_typeof(class_probabilities) = 'object'),
  factor_associations jsonb check (factor_associations is null or jsonb_typeof(factor_associations) = 'array'),
  input_snapshot jsonb not null check (jsonb_typeof(input_snapshot) = 'object'),
  generated_by uuid not null references public.profiles(id) on delete restrict,
  generated_at timestamptz not null default now(),
  check ((kind = 'pathway' and factor_associations is null) or kind = 'neet')
);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb check (jsonb_typeof(metadata) = 'object'),
  request_id uuid,
  ip_hash text,
  created_at timestamptz not null default now()
);

create index respondent_records_graduation_year_idx on public.respondent_records(graduation_year);
create index respondent_records_strand_idx on public.respondent_records(strand);
create index respondent_records_status_idx on public.respondent_records(current_status);
create index respondent_records_name_idx on public.respondent_records using gin (to_tsvector('simple', full_name));
create index survey_responses_submitted_at_idx on public.survey_responses(submitted_at desc);
create index predictions_respondent_idx on public.prediction_results(respondent_record_id, generated_at desc);
create index audit_logs_actor_created_idx on public.audit_logs(actor_id, created_at desc);
create index validation_issues_batch_idx on public.import_validation_issues(import_batch_id, row_number);
create index staged_rows_batch_valid_idx on public.import_staged_rows(import_batch_id, is_valid);

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles
for each row execute function public.touch_updated_at();
create trigger import_batches_touch before update on public.import_batches
for each row execute function public.touch_updated_at();
create trigger respondent_records_touch before update on public.respondent_records
for each row execute function public.touch_updated_at();

create or replace function public.current_app_role()
returns public.app_role
language sql stable security definer set search_path = public
as $$ select role from public.profiles where id = auth.uid() and status = 'active' $$;

create or replace function public.is_authorized_user()
returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce(public.current_app_role() in ('admin', 'user'), false) $$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$ select coalesce(public.current_app_role() = 'admin', false) $$;

revoke all on function public.current_app_role() from public;
revoke all on function public.is_authorized_user() from public;
revoke all on function public.is_admin() from public;
grant execute on function public.current_app_role(), public.is_authorized_user(), public.is_admin() to authenticated;

alter table public.profiles enable row level security;
alter table public.import_batches enable row level security;
alter table public.respondent_records enable row level security;
alter table public.survey_responses enable row level security;
alter table public.survey_rate_limits enable row level security;
alter table public.import_validation_issues enable row level security;
alter table public.import_staged_rows enable row level security;
alter table public.model_registry enable row level security;
alter table public.model_metrics enable row level security;
alter table public.cluster_profiles enable row level security;
alter table public.prediction_results enable row level security;
alter table public.audit_logs enable row level security;

create policy profiles_self_read on public.profiles for select to authenticated
using (id = auth.uid());
create policy profiles_admin_read on public.profiles for select to authenticated
using (public.is_admin());
create policy profiles_admin_update on public.profiles for update to authenticated
using (public.is_admin()) with check (public.is_admin());

create policy authorized_read_imports on public.import_batches for select to authenticated
using (public.is_authorized_user());
create policy authorized_create_imports on public.import_batches for insert to authenticated
with check (public.is_authorized_user() and uploaded_by = auth.uid());
create policy owner_or_admin_update_imports on public.import_batches for update to authenticated
using (uploaded_by = auth.uid() or public.is_admin())
with check (uploaded_by = auth.uid() or public.is_admin());

create policy authorized_manage_respondents on public.respondent_records for all to authenticated
using (public.is_authorized_user()) with check (public.is_authorized_user());
create policy authorized_read_surveys on public.survey_responses for select to authenticated
using (public.is_authorized_user());
create policy authorized_read_validation on public.import_validation_issues for select to authenticated
using (public.is_authorized_user());
create policy import_owner_manage_validation on public.import_validation_issues for all to authenticated
using (exists (select 1 from public.import_batches b where b.id = import_batch_id and (b.uploaded_by = auth.uid() or public.is_admin())))
with check (exists (select 1 from public.import_batches b where b.id = import_batch_id and (b.uploaded_by = auth.uid() or public.is_admin())));
create policy import_owner_manage_staging on public.import_staged_rows for all to authenticated
using (exists (select 1 from public.import_batches b where b.id = import_batch_id and (b.uploaded_by = auth.uid() or public.is_admin())))
with check (exists (select 1 from public.import_batches b where b.id = import_batch_id and (b.uploaded_by = auth.uid() or public.is_admin())));

create policy authorized_read_models on public.model_registry for select to authenticated
using (public.is_authorized_user());
create policy admin_manage_models on public.model_registry for all to authenticated
using (public.is_admin()) with check (public.is_admin());
create policy authorized_read_metrics on public.model_metrics for select to authenticated
using (public.is_authorized_user());
create policy admin_manage_metrics on public.model_metrics for all to authenticated
using (public.is_admin()) with check (public.is_admin());
create policy authorized_read_clusters on public.cluster_profiles for select to authenticated
using (public.is_authorized_user());
create policy admin_manage_clusters on public.cluster_profiles for all to authenticated
using (public.is_admin()) with check (public.is_admin());

create policy authorized_read_predictions on public.prediction_results for select to authenticated
using (public.is_authorized_user());
create policy authorized_create_predictions on public.prediction_results for insert to authenticated
with check (public.is_authorized_user() and generated_by = auth.uid());
create policy admin_read_audit on public.audit_logs for select to authenticated
using (public.is_admin());
create policy authorized_create_audit on public.audit_logs for insert to authenticated
with check (public.is_authorized_user() and (actor_id = auth.uid() or actor_id is null));

-- Public submission is intentionally available only to the server-side route,
-- which calls this transaction with the service role. The anon key cannot call it.
-- search_path includes `extensions` so pgcrypto's digest() resolves under the
-- fixed search_path that SECURITY DEFINER requires.
create or replace function public.submit_tracer_survey(payload jsonb, submission_ip_hash text)
returns uuid
language plpgsql security definer set search_path = public, extensions
as $$
declare
  record_id uuid;
  response_id uuid;
  status_value public.post_shs_status;
  duplicate_hash text;
  request_uuid uuid;
  current_attempts smallint;
begin
  if submission_ip_hash is null or submission_ip_hash !~ '^[a-f0-9]{64}$' then
    raise exception using errcode = '22023', message = 'A valid submission throttle key is required.';
  end if;

  insert into public.survey_rate_limits(ip_hash, window_started_at, attempt_count, updated_at)
  values (submission_ip_hash, now(), 1, now())
  on conflict (ip_hash) do update set
    window_started_at = case
      when public.survey_rate_limits.window_started_at < now() - interval '10 minutes' then now()
      else public.survey_rate_limits.window_started_at
    end,
    attempt_count = case
      when public.survey_rate_limits.window_started_at < now() - interval '10 minutes' then 1
      else public.survey_rate_limits.attempt_count + 1
    end,
    updated_at = now()
  returning attempt_count into current_attempts;

  -- A moderate ceiling limits automated flooding without immediately blocking
  -- a supervised alumni session behind one shared school network address.
  if current_attempts > 20 then
    raise exception using errcode = 'P0001', message = 'SURVEY_RATE_LIMIT_EXCEEDED';
  end if;

  if coalesce((payload->>'consent_given')::boolean, false) is not true then
    raise exception using errcode = '22023', message = 'Consent is required before submission.';
  end if;

  status_value := (payload->>'current_status')::public.post_shs_status;
  request_uuid := (payload->>'client_request_id')::uuid;
  duplicate_hash := encode(digest(
    lower(trim(payload->>'email')) || '|' || lower(trim(payload->>'full_name')) || '|' || (payload->>'graduation_year'),
    'sha256'
  ), 'hex');

  if status_value = 'higher_education' and
     (nullif(trim(payload->>'higher_education_course'), '') is null or payload->>'higher_education_relation' is null) then
    raise exception using errcode = '22023', message = 'Higher education details are required.';
  elsif status_value = 'employed' and
     (nullif(trim(payload->>'employer_name'), '') is null or nullif(trim(payload->>'job_title'), '') is null or payload->>'employment_relation' is null) then
    raise exception using errcode = '22023', message = 'Employment details are required.';
  elsif status_value = 'self_employed' and
     (nullif(trim(payload->>'business_nature'), '') is null or payload->>'business_relation' is null) then
    raise exception using errcode = '22023', message = 'Business details are required.';
  elsif status_value = 'training' and
     (nullif(trim(payload->>'training_center'), '') is null or nullif(trim(payload->>'training_title'), '') is null or payload->>'training_relation' is null) then
    raise exception using errcode = '22023', message = 'Training details are required.';
  elsif status_value = 'neet' and
     (jsonb_array_length(coalesce(payload->'neet_reasons', '[]'::jsonb)) = 0 or payload->>'actively_seeking' is null) then
    raise exception using errcode = '22023', message = 'NEET follow-up details are required.';
  end if;

  insert into public.respondent_records (
    source, email, full_name, gender, age, graduation_year, strand, certification,
    current_status, subject_relevance, preparedness, challenges, support_needed,
    feedback, canonical_data, record_fingerprint
  ) values (
    'survey', lower(trim(payload->>'email')), trim(payload->>'full_name'), payload->>'gender',
    (payload->>'age')::smallint, (payload->>'graduation_year')::smallint, payload->>'strand',
    trim(payload->>'certification'), status_value, (payload->>'subject_relevance')::smallint,
    (payload->>'preparedness')::smallint, trim(payload->>'challenges'), trim(payload->>'support_needed'),
    trim(payload->>'feedback'),
    payload - array[
      'client_request_id','consent_given','website','email','full_name','gender','age',
      'graduation_year','strand','certification','current_status','subject_relevance',
      'preparedness','challenges','support_needed','feedback'
    ],
    duplicate_hash
  ) returning id into record_id;

  insert into public.survey_responses (
    respondent_record_id, consent_given, higher_education_course, higher_education_relation,
    employer_name, job_title, employment_relation, business_nature, business_relation,
    training_center, training_title, training_relation, neet_reasons, actively_seeking,
    client_request_id
  ) values (
    record_id, true,
    case when status_value = 'higher_education' then trim(payload->>'higher_education_course') end,
    case when status_value = 'higher_education' then payload->>'higher_education_relation' end,
    case when status_value = 'employed' then trim(payload->>'employer_name') end,
    case when status_value = 'employed' then trim(payload->>'job_title') end,
    case when status_value = 'employed' then payload->>'employment_relation' end,
    case when status_value = 'self_employed' then trim(payload->>'business_nature') end,
    case when status_value = 'self_employed' then payload->>'business_relation' end,
    case when status_value = 'training' then trim(payload->>'training_center') end,
    case when status_value = 'training' then trim(payload->>'training_title') end,
    case when status_value = 'training' then payload->>'training_relation' end,
    case when status_value = 'neet' then array(select jsonb_array_elements_text(payload->'neet_reasons')) end,
    case when status_value = 'neet' then (payload->>'actively_seeking')::boolean end,
    request_uuid
  ) returning id into response_id;

  insert into public.audit_logs(action, entity_type, entity_id, metadata, request_id)
  values ('survey.submitted', 'survey_response', response_id::text,
          jsonb_build_object('questionnaire_version', 'DJIHS-SHS-GRAD-SURVEY-2025-v1'), request_uuid);
  return response_id;
exception
  when unique_violation then
    raise exception using errcode = '23505', message = 'A response for this graduate already exists.';
end;
$$;

revoke all on function public.submit_tracer_survey(jsonb, text) from public;
grant execute on function public.submit_tracer_survey(jsonb, text) to service_role;

create or replace function public.commit_import_batch(target_batch_id uuid)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  committed_count integer;
  owner_id uuid;
begin
  select uploaded_by into owner_id
  from public.import_batches
  where id = target_batch_id and status = 'validated'
  for update;

  if owner_id is null then
    raise exception using errcode = '22023', message = 'The import batch is not ready to commit.';
  end if;
  if owner_id <> auth.uid() and not public.is_admin() then
    raise exception using errcode = '42501', message = 'You do not own this import batch.';
  end if;
  if exists (select 1 from public.import_staged_rows where import_batch_id = target_batch_id and not is_valid) then
    raise exception using errcode = '22023', message = 'Invalid rows must be corrected before commit.';
  end if;

  insert into public.respondent_records (
    import_batch_id, source, source_row_number, email, full_name, gender, age,
    graduation_year, strand, certification, current_status, subject_relevance,
    preparedness, challenges, support_needed, feedback, canonical_data,
    record_fingerprint, created_by
  )
  select
    target_batch_id, 'import', s.row_number,
    s.normalized_data->>'email', s.normalized_data->>'full_name', s.normalized_data->>'gender',
    (s.normalized_data->>'age')::smallint, (s.normalized_data->>'graduation_year')::smallint,
    s.normalized_data->>'strand', s.normalized_data->>'certification',
    (s.normalized_data->>'current_status')::public.post_shs_status,
    (s.normalized_data->>'subject_relevance')::smallint, (s.normalized_data->>'preparedness')::smallint,
    s.normalized_data->>'challenges', s.normalized_data->>'support_needed',
    s.normalized_data->>'feedback',
    s.normalized_data - array[
      'email','full_name','gender','age','graduation_year','strand','certification',
      'current_status','subject_relevance','preparedness','challenges','support_needed','feedback'
    ],
    s.record_fingerprint, auth.uid()
  from public.import_staged_rows s
  where s.import_batch_id = target_batch_id and s.is_valid;

  get diagnostics committed_count = row_count;
  update public.import_batches
  set status = 'committed', committed_at = now()
  where id = target_batch_id;
  delete from public.import_staged_rows where import_batch_id = target_batch_id;
  insert into public.audit_logs(actor_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), 'import.committed', 'import_batch', target_batch_id::text,
          jsonb_build_object('record_count', committed_count));
  return committed_count;
exception
  when unique_violation then
    raise exception using errcode = '23505', message = 'The import contains a graduate who already exists.';
end;
$$;

revoke all on function public.commit_import_batch(uuid) from public;
grant execute on function public.commit_import_batch(uuid) to authenticated;

create or replace function public.activate_model(target_model_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  target_kind public.model_kind;
begin
  if not public.is_admin() and coalesce(auth.jwt()->>'role', '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'Administrator access is required.';
  end if;
  select kind into target_kind from public.model_registry
  where id = target_model_id and status = 'evaluated'
  for update;
  if target_kind is null then
    raise exception using errcode = '22023', message = 'Only an evaluated model can be activated.';
  end if;
  update public.model_registry set status = 'retired' where kind = target_kind and status = 'active';
  update public.model_registry set status = 'active', activated_at = now() where id = target_model_id;
  insert into public.audit_logs(actor_id, action, entity_type, entity_id, metadata)
  values (auth.uid(), 'model.activated', 'model_registry', target_model_id::text,
          jsonb_build_object('kind', target_kind));
end;
$$;

revoke all on function public.activate_model(uuid) from public;
grant execute on function public.activate_model(uuid) to authenticated, service_role;

-- Read-only, aggregate analytical views. PII is deliberately excluded.
create or replace view public.analytics_overview
with (security_invoker = true) as
select
  count(*)::bigint as total_respondents,
  count(*) filter (where source = 'survey')::bigint as survey_responses,
  count(*) filter (where source = 'import')::bigint as imported_records,
  count(*) filter (where current_status = 'employed')::bigint as employed,
  count(*) filter (where current_status = 'higher_education')::bigint as higher_education,
  count(*) filter (where current_status = 'self_employed')::bigint as self_employed,
  count(*) filter (where current_status = 'training')::bigint as training,
  count(*) filter (where current_status = 'neet')::bigint as neet,
  round(avg(subject_relevance)::numeric, 2) as average_subject_relevance,
  round(avg(preparedness)::numeric, 2) as average_preparedness
from public.respondent_records;

create or replace view public.analytics_by_batch_strand_status
with (security_invoker = true) as
select graduation_year, strand, current_status, count(*)::bigint as respondent_count
from public.respondent_records
group by graduation_year, strand, current_status;

grant select on public.analytics_overview, public.analytics_by_batch_strand_status to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('raw-imports', 'raw-imports', false, 10485760, array['text/csv', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']),
  ('model-artifacts', 'model-artifacts', false, 524288000, array['application/octet-stream', 'application/json'])
on conflict (id) do nothing;

create policy raw_import_owner_insert on storage.objects for insert to authenticated
with check (bucket_id = 'raw-imports' and public.is_authorized_user() and (storage.foldername(name))[1] = auth.uid()::text);
create policy raw_import_authorized_read on storage.objects for select to authenticated
using (bucket_id = 'raw-imports' and public.is_authorized_user());
create policy raw_import_owner_delete on storage.objects for delete to authenticated
using (bucket_id = 'raw-imports' and public.is_authorized_user() and (storage.foldername(name))[1] = auth.uid()::text);
create policy model_admin_manage on storage.objects for all to authenticated
using (bucket_id = 'model-artifacts' and public.is_admin())
with check (bucket_id = 'model-artifacts' and public.is_admin());
create policy model_authorized_read on storage.objects for select to authenticated
using (bucket_id = 'model-artifacts' and public.is_authorized_user());
