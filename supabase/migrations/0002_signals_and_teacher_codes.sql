-- Learning signals, and a way to make somebody a teacher without SQL.
--
-- Two additions, both driven by the same fact: this is no longer one student's
-- project. Signals lived in each student's browser, where a teacher could never
-- reach them, and the teacher role could only be granted by the project owner
-- typing into the SQL editor, which does not survive a dozen teachers.
--
-- Apply this AFTER 0001_init.sql. It is safe to re-run.

-- ---------------------------------------------------------------------------
-- struggle_signals
-- ---------------------------------------------------------------------------
--
-- One row per piece of evidence: a student pressed "I don't understand", said
-- they were lost, came back to the same assignment a day later. Small, additive
-- rows rather than a running score, because a score cannot be re-derived if the
-- thresholds change and a teacher cannot argue with it.
--
-- What is deliberately NOT here is any message text. The teacher-facing types
-- in src/lib/insights/teacherReport.ts are built so a transcript cannot leak
-- into them; storing transcript text here would route around that by putting it
-- somewhere a future query could pick it up. A signal records that difficulty
-- happened and where, never what was said.

create table if not exists public.struggle_signals (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.profiles (id) on delete cascade,

  -- The class this belongs to, and therefore the teacher who may read it.
  -- NULL means it happened in the general chat, outside any class. Those rows
  -- are readable by the student alone and by no teacher at all -- see the
  -- select policy below, which is the single most important rule in this file.
  class_id uuid references public.classes (id) on delete cascade,
  assignment_id uuid references public.assignments (id) on delete cascade,

  -- A stable key for grouping and a human label for showing. The label is
  -- copied rather than joined so a finding still reads correctly after an
  -- assignment is renamed or deleted -- a teacher looking at last week should
  -- see what it said last week.
  topic_key text not null,
  topic_label text not null,

  -- 'action' (a button), 'phrase' (said they were lost), 'retry' (came back),
  -- 'dwell' (a long pause). Kept as text rather than an enum so the engine can
  -- learn a new kind of evidence without a migration.
  kind text not null,
  -- Which button, when kind = 'action'.
  action text,
  -- How much this counts toward a finding. A pause can colour a conclusion but
  -- must never create one, so it arrives weighted far below a button press.
  weight real not null default 1,

  occurred_at timestamptz not null default now()
);

-- The engine reads a 14-day window for one student, usually filtered by class.
create index if not exists struggle_signals_student_time_idx
  on public.struggle_signals (student_id, occurred_at desc);
create index if not exists struggle_signals_class_time_idx
  on public.struggle_signals (class_id, occurred_at desc);

alter table public.struggle_signals enable row level security;

-- A student reads their own signals -- all of them, including the ones from
-- the general chat that no teacher can see.
drop policy if exists struggle_signals_select_own on public.struggle_signals;
create policy struggle_signals_select_own on public.struggle_signals
  for select to authenticated
  using (student_id = auth.uid());

-- A teacher reads signals attached to a class they own, and nothing else.
--
-- This is the rule that makes the feature safe to hand to a district. A
-- teacher cannot read a signal from another teacher's class, and cannot read
-- anything a student did outside a class at all -- the general chat is where a
-- student asks about things that are not schoolwork, and that stays theirs.
-- Note the check is on class ownership, not on the student: knowing a student
-- id buys nothing.
drop policy if exists struggle_signals_select_by_teacher on public.struggle_signals;
create policy struggle_signals_select_by_teacher on public.struggle_signals
  for select to authenticated
  using (class_id is not null and public.owns_class(class_id));

-- Only the student who lived it may record it, and only about themselves.
-- Without the student_id check a signed-in caller could manufacture evidence
-- against somebody else, which would land on a teacher's screen as fact.
drop policy if exists struggle_signals_insert_own on public.struggle_signals;
create policy struggle_signals_insert_own on public.struggle_signals
  for insert to authenticated
  with check (student_id = auth.uid());

-- A student may clear their own history. Nobody may edit a signal: evidence
-- that can be quietly rewritten is not evidence.
drop policy if exists struggle_signals_delete_own on public.struggle_signals;
create policy struggle_signals_delete_own on public.struggle_signals
  for delete to authenticated
  using (student_id = auth.uid());

grant select, insert, delete on public.struggle_signals to authenticated;

-- Old rows are outside the engine's window and are nobody's business. Call
-- this from a scheduled job, or occasionally by hand; it is deliberately not a
-- trigger, because deleting rows on every insert would make writes slow for no
-- reason a student would ever notice.
create or replace function public.prune_struggle_signals(p_days integer default 30)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed integer;
begin
  delete from public.struggle_signals
  where occurred_at < now() - make_interval(days => greatest(p_days, 14));
  get diagnostics removed = row_count;
  return removed;
end;
$$;

-- ---------------------------------------------------------------------------
-- teacher_codes
-- ---------------------------------------------------------------------------
--
-- 0001 made the teacher role grantable only by the project owner in the SQL
-- editor. That is correct and it does not scale: a dozen teachers means a dozen
-- times somebody opens a SQL console, and consoles opened often get opened
-- carelessly.
--
-- So the owner issues a code once and hands it to a teacher, who redeems it at
-- sign-up. Self-promotion is still impossible -- what changed is that the
-- authorisation now exists as a row the owner created deliberately, rather than
-- as a statement they typed. A code is single-purpose, expirable, countable and
-- revocable, which a typed UPDATE is not.

create table if not exists public.teacher_codes (
  code text primary key,
  -- Who or what this was issued for, so the owner can revoke the right one.
  label text not null default '',
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  -- Both are limits, not suggestions: redeem checks each one.
  expires_at timestamptz,
  max_uses integer not null default 1,
  uses integer not null default 0,
  revoked boolean not null default false
);

alter table public.teacher_codes enable row level security;

-- No policies granting select, on purpose. A code is a secret; a signed-in
-- student being able to list the codes would defeat the whole mechanism. The
-- owner reads this table in the SQL editor, which bypasses RLS, and the redeem
-- function below reads it as definer. Nobody reads it from a browser.
revoke all on public.teacher_codes from authenticated, anon;

-- ---------------------------------------------------------------------------
-- Redeeming a code
-- ---------------------------------------------------------------------------
--
-- The role guard in 0001 refuses any role change made while somebody is signed
-- in, which is what stops a student promoting themselves. A redeem has to get
-- past that without weakening it, so the guard now also accepts a
-- transaction-local flag that only this function can set. The flag lives for
-- the statement and cannot be set from PostgREST, so possessing a valid code
-- remains the only way through.

create or replace function public.enforce_role_not_self_serviceable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.role is distinct from old.role
     and auth.uid() is not null
     and coalesce(current_setting('panda.role_change_authorized', true), '') <> 'on'
  then
    raise exception 'An account cannot change its own role. A teacher is promoted with a code issued by the owner of this Supabase project; see docs/DATABASE.md.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.redeem_teacher_code(p_code text)
returns public.user_role
language plpgsql
security definer
set search_path = ''
as $$
declare
  found public.teacher_codes;
begin
  if auth.uid() is null then
    raise exception 'Sign in before redeeming a code.' using errcode = '42501';
  end if;

  -- Locked so two people redeeming the last use of a code cannot both win.
  select * into found from public.teacher_codes
  where code = btrim(p_code) for update;

  -- One message for every failure. Saying which code exists, which expired and
  -- which is spent would let someone discover valid codes by trying.
  if found is null
     or found.revoked
     or (found.expires_at is not null and found.expires_at < now())
     or found.uses >= found.max_uses
  then
    raise exception 'That code is not valid.' using errcode = '42501';
  end if;

  update public.teacher_codes set uses = uses + 1 where code = found.code;

  perform set_config('panda.role_change_authorized', 'on', true);
  update public.profiles set role = 'teacher', updated_at = now()
  where id = auth.uid();
  perform set_config('panda.role_change_authorized', '', true);

  return 'teacher'::public.user_role;
end;
$$;

revoke all on function public.redeem_teacher_code(text) from public, anon;
grant execute on function public.redeem_teacher_code(text) to authenticated;
