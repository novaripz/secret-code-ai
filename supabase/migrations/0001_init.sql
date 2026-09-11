-- Panda's database. One migration, the whole schema.
--
-- Everything in Panda has lived in the browser until now, which was the right
-- call while Panda was a single-player tool: no server, no accounts to manage,
-- nothing to leak. It stops being the right call the moment a teacher wants a
-- roster, because a roster is by definition something two people share.
--
-- So this is the shape the data has had all along -- stable ids, foreign keys,
-- an `external_id` on the entities Canvas owns -- written out as tables. The
-- interesting part is not the columns. It is the row-level security, which is
-- the only thing standing between a curious sixteen-year-old and their
-- classmates' work. Postgres enforces it on every query, including the ones a
-- future bug in our own code would otherwise get wrong, which is why the rules
-- live here and not in a React component.
--
-- Two ideas run through the policies:
--
--   1. Nobody asks for permission to see a row. They either own it, are
--      enrolled in the class it belongs to, or teach that class. Every policy
--      below is one of those three sentences.
--
--   2. Roles are not self-service. An account cannot make itself a teacher,
--      because the only thing separating a student from every other student's
--      data is that word. Promotion is a line of SQL run by the person who
--      owns the Supabase project. See docs/DATABASE.md.
--
-- Run this once, in the Supabase SQL editor. docs/DATABASE.md walks through it
-- in plain language and says what to do when it complains.

-- ---------------------------------------------------------------------------
-- Vocabulary
-- ---------------------------------------------------------------------------

-- These mirror the string unions in src/lib/school/types.ts exactly. Enums
-- rather than text columns because a typo in a status is a bug that should
-- fail at write time, in the database, not surface three screens later as an
-- assignment that never appears in any filter.

create type public.user_role as enum ('student', 'teacher');

create type public.content_source as enum ('local', 'canvas');

-- Named `assignment_state`, not `assignment_status`, only because Postgres
-- keeps types and tables in the same namespace and the table below wants that
-- name. The application-facing word is "status" in both places.
create type public.assignment_state as enum ('todo', 'doing', 'done');

-- How far Panda will go toward handing over an answer on one assignment.
create type public.answers_policy as enum ('guided', 'after_understanding', 'allowed');

-- Used by both the translation and simplification switches. One type for two
-- columns because they really are the same question asked twice.
create type public.feature_policy as enum ('allowed', 'disabled');

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

-- One row per account, created automatically by the trigger at the bottom of
-- this file. Supabase owns `auth.users` and we do not get to add columns to
-- it, so everything Panda knows about a person lives here and is keyed to it.
--
-- `email` is a denormalised copy of auth.users.email, kept lowercase. It is
-- duplicated on purpose: an invite is matched by email, and matching it means
-- reading a table that ordinary users are not allowed anywhere near. Keeping a
-- lowercased copy here lets the invite functions do their work in one place
-- and keeps auth.users out of the application's reach entirely.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.user_role not null default 'student',
  display_name text not null default '',
  email text,
  -- Language the interface is drawn in, and the language Panda replies in.
  -- 'auto' means "follow the interface", which is what most students want;
  -- the two are separate because a student learning English often wants the
  -- buttons in Spanish and the answers in English.
  interface_language text not null default 'en',
  reply_language text not null default 'auto',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Not unique: auth.users already guarantees one account per address, and a
-- unique index here would turn any drift between the two tables into a failed
-- sign-up rather than a mismatched row somebody can fix.
create index profiles_email_idx on public.profiles (email);

-- ---------------------------------------------------------------------------
-- classes
-- ---------------------------------------------------------------------------

-- A class is owned by exactly one account, and ownership is the whole
-- permission story: the owner writes it, enrolled students read it.
--
-- `teacher_id` points at a profile rather than requiring role = 'teacher',
-- which is deliberate. Students have always been able to make their own
-- classes in Panda and to pull them in from Canvas, and that still works --
-- such a class is simply one the student owns with nobody enrolled in it.
-- Requiring the teacher role here would delete a feature to enforce a rule
-- nothing actually needs.
--
-- `teacher_name` is the free-text label the UI already shows ("Ms. Alvarez",
-- "Period 3"). It is not a reference to anyone; the account that owns the
-- class is `teacher_id`.
create table public.classes (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  teacher_name text,
  color text,
  source public.content_source not null default 'local',
  external_id text,
  created_at timestamptz not null default now(),

  -- What makes a Canvas re-sync an update instead of a second copy of every
  -- class. A table constraint rather than a partial index, even though only
  -- Canvas classes have an external id, because `on conflict` can only infer a
  -- partial index if the caller repeats its WHERE clause -- and the caller here
  -- is PostgREST, which has no way to say that. Locally made classes are
  -- unaffected: two nulls do not collide.
  unique (teacher_id, external_id)
);

create index classes_teacher_idx on public.classes (teacher_id);

-- ---------------------------------------------------------------------------
-- enrollments
-- ---------------------------------------------------------------------------

-- Who is in which class. This is the row a teacher writes when they add a
-- student, and the row every student-side read policy hangs off.
create table public.enrollments (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (class_id, student_id)
);

create index enrollments_student_idx on public.enrollments (student_id);
create index enrollments_class_idx on public.enrollments (class_id);

-- ---------------------------------------------------------------------------
-- assignments
-- ---------------------------------------------------------------------------

-- One assignment, plus the rules attached to it.
--
-- The rules live in the same row rather than in a table of their own. They are
-- one-to-one with an assignment, they are read on every single read of an
-- assignment, and splitting them would buy a join and a second set of security
-- policies in exchange for nothing. src/lib/school/types.ts still models them
-- as a separate `AssignmentRules` object, and the data layer pulls them apart
-- on the way out -- that separation is for the UI's benefit, not the disk's.
--
-- Note what is NOT here: whether the work is done. That is per student, it
-- belongs to the student, and it lives in its own table below.
create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes (id) on delete cascade,
  title text not null check (length(btrim(title)) > 0),
  instructions text,
  -- Null when the class has no deadline for it.
  due_at timestamptz,
  -- Numeric, not integer: Canvas happily reports 2.5 points.
  points numeric,
  -- Roughly how long it should take. Feeds the planner.
  estimate_minutes integer check (estimate_minutes is null or estimate_minutes > 0),
  source public.content_source not null default 'local',
  external_id text,

  -- The rules. Free text from the teacher, folded into Panda's instructions.
  panda_instructions text,
  answers public.answers_policy not null default 'guided',
  translation public.feature_policy not null default 'allowed',
  simplification public.feature_policy not null default 'allowed',
  -- Shown to the student when something is switched off, so it isn't a mystery.
  restriction_reason text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Same reasoning as on classes: this is what a Canvas re-sync conflicts
  -- against, so it has to be a constraint PostgREST can name.
  unique (class_id, external_id)
);

create index assignments_class_idx on public.assignments (class_id);
create index assignments_due_idx on public.assignments (due_at);

-- ---------------------------------------------------------------------------
-- assignment_status
-- ---------------------------------------------------------------------------

-- How far one student has got with one assignment.
--
-- Separate from `assignments` for a reason that matters: this is the student's
-- row, and nothing else in the system is allowed to write it. A Canvas sync
-- updates titles, due dates and point values -- things Canvas owns -- and it
-- physically cannot touch this table, because the policies below give writes
-- to the student alone. Not even the teacher who set the assignment can mark
-- it done on a student's behalf. That was already the rule in the browser
-- version; here it is enforced rather than merely observed.
create table public.assignment_status (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  status public.assignment_state not null default 'todo',
  updated_at timestamptz not null default now(),
  unique (assignment_id, student_id)
);

create index assignment_status_student_idx on public.assignment_status (student_id);
create index assignment_status_assignment_idx on public.assignment_status (assignment_id);

-- ---------------------------------------------------------------------------
-- invites
-- ---------------------------------------------------------------------------

-- A teacher adding a student who does not have an account yet.
--
-- This is one-sided on purpose. A teacher types an email address; that is the
-- end of their work. There is no code for the student to enter, no request for
-- them to approve, nothing in their way at all -- when someone signs in with
-- that address, whether a minute later or next term, they are simply in the
-- class. A high-school class has thirty students and one of them will lose any
-- invite code you give them, so the design removes the code.
--
-- The email is stored lowercased and trimmed because nobody types their own
-- address the same way twice, and "Ana@school.org" must find Ana.
create table public.invites (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes (id) on delete cascade,
  email text not null check (email = lower(btrim(email)) and position('@' in email) > 1),
  invited_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  -- Set when an account with this address turns up. Kept rather than deleted,
  -- so a teacher's roster can honestly say "invited, hasn't signed in yet".
  claimed_at timestamptz,
  claimed_by uuid references public.profiles (id) on delete set null,
  unique (class_id, email)
);

-- The lookup every sign-in does. Partial, because a claimed invite is history.
create index invites_pending_idx on public.invites (email) where claimed_at is null;

-- ---------------------------------------------------------------------------
-- Keeping updated_at honest
-- ---------------------------------------------------------------------------

-- Client-supplied timestamps drift, and one device with a wrong clock would
-- poison everyone's ordering. The database stamps these itself.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

create trigger assignments_touch before update on public.assignments
  for each row execute function public.touch_updated_at();

create trigger assignment_status_touch before update on public.assignment_status
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Roles are not self-service
-- ---------------------------------------------------------------------------

-- The single most important rule in this file.
--
-- Being a teacher is what lets an account read other people's work, so if an
-- account could set `role = 'teacher'` on itself, every policy below would be
-- decoration. The profiles UPDATE policy has to let people edit their own row
-- -- that is where their name and language preferences live -- and a policy
-- cannot compare the new row against the old one. A trigger can, so the rule
-- is a trigger.
--
-- The escape hatch is deliberate: when there is no signed-in user, the change
-- goes through. That is the project owner typing into the Supabase SQL editor,
-- which is exactly who is allowed to hand out the teacher role, and it is
-- nobody else -- a browser always carries a user.
create or replace function public.enforce_role_not_self_serviceable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.role is distinct from old.role and auth.uid() is not null then
    raise exception 'An account cannot change its own role. A teacher is promoted by the owner of this Supabase project; see docs/DATABASE.md.'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger profiles_role_guard before update on public.profiles
  for each row execute function public.enforce_role_not_self_serviceable();

-- ---------------------------------------------------------------------------
-- The three questions every policy asks
-- ---------------------------------------------------------------------------

-- Row-level security applies to subqueries inside policies too, so a policy on
-- `classes` that reads `enrollments` would trip over the policy on
-- `enrollments`, which reads `classes`, and Postgres would refuse the whole
-- thing as infinite recursion. These helpers are SECURITY DEFINER, so they run
-- with the owner's rights and see the tables plainly, which breaks the loop.
--
-- That sounds alarming and is not: every one of them answers a yes/no question
-- about the caller's own relationships and returns nothing else. Ask
-- `owns_class` about a class you do not own and it says false. There is no
-- argument you can pass that makes one of these return somebody else's data.

create or replace function public.owns_class(p_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.classes c
    where c.id = p_class_id and c.teacher_id = auth.uid()
  );
$$;

create or replace function public.is_enrolled(p_class_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.enrollments e
    where e.class_id = p_class_id and e.student_id = auth.uid()
  );
$$;

-- True when the caller teaches the class this assignment belongs to.
create or replace function public.teaches_assignment(p_assignment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.assignments a
    join public.classes c on c.id = a.class_id
    where a.id = p_assignment_id and c.teacher_id = auth.uid()
  );
$$;

-- True when the caller is enrolled in the class this assignment belongs to.
create or replace function public.can_see_assignment(p_assignment_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.assignments a
    join public.enrollments e on e.class_id = a.class_id
    where a.id = p_assignment_id and e.student_id = auth.uid()
  );
$$;

-- True when this student is enrolled in any class the caller owns. This is
-- what lets a teacher see names on their own roster without being handed a
-- directory of the whole school.
create or replace function public.teaches_student(p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.enrollments e
    join public.classes c on c.id = e.class_id
    where e.student_id = p_student_id and c.teacher_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

-- Every table, no exceptions. A table with RLS on and no policy for you denies
-- everything, which is the right default: forgetting to write a policy locks
-- data away rather than leaving it open.

alter table public.profiles enable row level security;
alter table public.classes enable row level security;
alter table public.enrollments enable row level security;
alter table public.assignments enable row level security;
alter table public.assignment_status enable row level security;
alter table public.invites enable row level security;

-- ---- profiles -------------------------------------------------------------

-- You can read yourself. This is the row holding your name and language
-- settings, and it is the only profile most accounts will ever read.
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = auth.uid());

-- A teacher can read the profile of a student on one of their own rosters,
-- and only that. It stops a roster showing a column of anonymous uuids; it
-- does not open the rest of the school, because a student the teacher does
-- not teach fails `teaches_student` and the row is invisible.
create policy profiles_select_own_students on public.profiles
  for select to authenticated
  using (public.teaches_student(id));

-- Creating your own profile. The trigger at the bottom of this file normally
-- does it at sign-up; this is the fallback for an account that predates this
-- migration. Pinned to 'student' so the fallback cannot be used as a way in --
-- promotion happens outside the application, never through it.
create policy profiles_insert_own on public.profiles
  for insert to authenticated
  with check (id = auth.uid() and role = 'student');

-- Editing your own name and languages. Note there is no protection here
-- against changing `role` -- a policy cannot see the row as it was. The
-- `profiles_role_guard` trigger above does that, and it fires on this
-- statement too.
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- No delete policy anywhere on profiles. An account is deleted through
-- Supabase Auth, and this row follows it via the foreign key.

-- ---- classes --------------------------------------------------------------

-- The people who have a reason to see a class: the account that owns it, and
-- the students in it. Anyone else -- including a teacher browsing for class
-- ids they did not create -- gets nothing back, not an error, just no rows.
create policy classes_select_visible on public.classes
  for select to authenticated
  using (teacher_id = auth.uid() or public.is_enrolled(id));

-- You may create a class, and only in your own name. Without the check you
-- could file a class under someone else's account and then, by the policy
-- above, never be able to see it again.
create policy classes_insert_own on public.classes
  for insert to authenticated
  with check (teacher_id = auth.uid());

-- Renaming, recolouring. The `with check` clause is what stops a class being
-- handed to another account by editing `teacher_id`.
create policy classes_update_own on public.classes
  for update to authenticated
  using (teacher_id = auth.uid())
  with check (teacher_id = auth.uid());

-- Deleting takes the assignments, the roster and the invites with it, through
-- the foreign keys. Only the owner can do it; an enrolled student cannot
-- delete a class out from under thirty classmates.
create policy classes_delete_own on public.classes
  for delete to authenticated
  using (teacher_id = auth.uid());

-- ---- enrollments ----------------------------------------------------------

-- A student sees which classes they are in. A teacher sees the roster of the
-- classes they own. Neither can see the other's: a student querying this table
-- gets their own rows and nothing about who else is in the room.
create policy enrollments_select_visible on public.enrollments
  for select to authenticated
  using (student_id = auth.uid() or public.owns_class(class_id));

-- Only the owner of the class adds people to it. This is the half of the
-- one-sided design that matters: a student who learns a class id still cannot
-- write themselves into it, because their own id is not what is checked.
create policy enrollments_insert_by_teacher on public.enrollments
  for insert to authenticated
  with check (public.owns_class(class_id));

-- Removing a student is the teacher's call, for the same reason the roster is:
-- a student quietly deleting their enrollment would vanish from the class they
-- are still in, and their teacher would have no idea why.
create policy enrollments_delete_by_teacher on public.enrollments
  for delete to authenticated
  using (public.owns_class(class_id));

-- No update policy. An enrollment has nothing to change -- moving a student to
-- another class is a delete and an insert, and should look like one.

-- ---- assignments ----------------------------------------------------------

-- Read an assignment if you set it or if you were given it. The student half
-- goes through the enrollment, so being removed from a class takes the
-- coursework with it on the very next query.
create policy assignments_select_visible on public.assignments
  for select to authenticated
  using (public.owns_class(class_id) or public.is_enrolled(class_id));

-- Posting work, editing it, and the rules that come with it, all belong to
-- whoever owns the class. A student in the class cannot edit an assignment --
-- which, since the rules restricting Panda live in this row, is the difference
-- between a rule and a suggestion.
create policy assignments_insert_by_teacher on public.assignments
  for insert to authenticated
  with check (public.owns_class(class_id));

-- The `with check` repeats the test so an assignment cannot be moved into a
-- class the caller does not own.
create policy assignments_update_by_teacher on public.assignments
  for update to authenticated
  using (public.owns_class(class_id))
  with check (public.owns_class(class_id));

create policy assignments_delete_by_teacher on public.assignments
  for delete to authenticated
  using (public.owns_class(class_id));

-- ---- assignment_status ----------------------------------------------------

-- A student sees their own progress. A teacher sees the progress on work they
-- set, which is what any class analytics is built from -- and nothing at all
-- about a student's other classes, because `teaches_assignment` is asked about
-- the assignment, not the person.
create policy assignment_status_select_visible on public.assignment_status
  for select to authenticated
  using (student_id = auth.uid() or public.teaches_assignment(assignment_id));

-- You may only record progress as yourself, and only on work you were actually
-- given. The second half stops rows being created for assignments in classes
-- the caller is not in, which would otherwise let someone confirm an
-- assignment id exists by watching which inserts succeed.
create policy assignment_status_insert_own on public.assignment_status
  for insert to authenticated
  with check (student_id = auth.uid() and public.can_see_assignment(assignment_id));

create policy assignment_status_update_own on public.assignment_status
  for update to authenticated
  using (student_id = auth.uid())
  with check (student_id = auth.uid());

create policy assignment_status_delete_own on public.assignment_status
  for delete to authenticated
  using (student_id = auth.uid());

-- Deliberately no teacher write policy of any kind. "Done" is the student's
-- word, and a Canvas sync, an analytics job or a teacher's misclick must not
-- be able to put it in their mouth.

-- ---- invites --------------------------------------------------------------

-- Only the owner of the class can see its invites. Students get no policy on
-- this table whatsoever, which means an invite list -- a list of classmates'
-- personal email addresses -- is not readable by the class it belongs to.
create policy invites_select_by_teacher on public.invites
  for select to authenticated
  using (public.owns_class(class_id));

-- Inviting is writing your own name into `invited_by` on a class you own.
-- Nothing here lets an invite be filed against somebody else's class, which
-- would otherwise be a way to add students to a room you cannot see.
create policy invites_insert_by_teacher on public.invites
  for insert to authenticated
  with check (public.owns_class(class_id) and invited_by = auth.uid());

-- Taking back an invite that has not been claimed yet, or tidying up an old
-- one. Unclaiming somebody is not a thing: once they are enrolled, removing
-- them is a change to the roster.
create policy invites_delete_by_teacher on public.invites
  for delete to authenticated
  using (public.owns_class(class_id));

-- No update policy at all. Claiming an invite is a write on behalf of someone
-- who, by definition, cannot see the row -- so it happens in `claim_invites()`
-- below, under controlled conditions, rather than through a policy loose
-- enough to permit it.

-- ---------------------------------------------------------------------------
-- Sign-up, and the invites waiting for it
-- ---------------------------------------------------------------------------

-- Supabase creates rows in auth.users; this puts the matching profile beside
-- it and, in the same breath, turns any invite addressed to that email into a
-- real enrollment. That second part is what makes the invite one-sided: the
-- student does nothing, accepts nothing, and is in the class before they
-- finish looking at the home screen.
--
-- The role is not set here and cannot be requested at sign-up. Everyone
-- arrives a student.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(new.email, '')));
begin
  insert into public.profiles (id, email, display_name)
  values (
    new.id,
    nullif(v_email, ''),
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      ''
    )
  )
  on conflict (id) do nothing;

  if v_email <> '' then
    insert into public.enrollments (class_id, student_id)
    select i.class_id, new.id
    from public.invites i
    where i.email = v_email and i.claimed_at is null
    on conflict (class_id, student_id) do nothing;

    update public.invites
    set claimed_at = now(), claimed_by = new.id
    where email = v_email and claimed_at is null;
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- A changed email has to follow, or invites sent to the new address would
-- never find the account and the teacher would be left staring at a student
-- who "hasn't signed in yet" and demonstrably has.
create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
  set email = nullif(lower(btrim(coalesce(new.email, ''))), '')
  where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function public.handle_user_email_change();

-- Claims any invite waiting for the signed-in account, and reports how many it
-- found. Called after sign-in.
--
-- The trigger above covers a student invited before they had an account. This
-- covers the other order -- teacher adds an address that already belongs to
-- someone -- and it covers it retroactively, so a student who was already
-- signed in on Monday walks into their new class on Tuesday without anybody
-- explaining anything to them.
--
-- SECURITY DEFINER because the caller is, by design, not allowed to read the
-- invites table. It only ever acts on invites matching the caller's own
-- verified email, which comes from auth.users and not from an argument, so
-- there is nothing here to aim at somebody else.
create or replace function public.claim_invites()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_claimed integer;
begin
  if v_uid is null then
    return 0;
  end if;

  select lower(btrim(coalesce(u.email, ''))) into v_email
  from auth.users u
  where u.id = v_uid;

  if v_email is null or v_email = '' then
    return 0;
  end if;

  insert into public.enrollments (class_id, student_id)
  select i.class_id, v_uid
  from public.invites i
  where i.email = v_email and i.claimed_at is null
  on conflict (class_id, student_id) do nothing;

  update public.invites
  set claimed_at = now(), claimed_by = v_uid
  where email = v_email and claimed_at is null;

  get diagnostics v_claimed = row_count;
  return v_claimed;
end;
$$;

-- Adding a student to a class, by email, in one call.
--
-- A teacher cannot look an account up by email -- `profiles_select_own` sees
-- to that, and it should, or a teacher account would be a search engine for
-- everyone in the school. But adding a student who already has an account and
-- making them wait until their next sign-in to appear on the roster is a bug
-- report waiting to happen. So this function does the lookup, enrolls them if
-- they exist, and returns the invite either way.
--
-- What the teacher learns is exactly one bit -- whether the invite came back
-- already claimed -- and they were always going to learn that from the roster.
-- They do not get the name, the id, or anything else about an account outside
-- their classes.
create or replace function public.invite_student(p_class_id uuid, p_email text)
returns public.invites
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_invite public.invites;
  v_student uuid;
begin
  -- SECURITY DEFINER turned the policies off for the length of this function,
  -- so the ownership check the policies would have made has to be made here.
  if not public.owns_class(p_class_id) then
    raise exception 'You can only add students to a class you own.'
      using errcode = '42501';
  end if;

  if position('@' in v_email) < 2 then
    raise exception 'That does not look like an email address.'
      using errcode = '22023';
  end if;

  insert into public.invites (class_id, email, invited_by)
  values (p_class_id, v_email, auth.uid())
  on conflict (class_id, email)
    do update set class_id = excluded.class_id
  returning * into v_invite;

  select p.id into v_student
  from public.profiles p
  where p.email = v_email
  limit 1;

  if v_student is not null then
    insert into public.enrollments (class_id, student_id)
    values (p_class_id, v_student)
    on conflict (class_id, student_id) do nothing;

    update public.invites
    set claimed_at = coalesce(claimed_at, now()),
        claimed_by = coalesce(claimed_by, v_student)
    where id = v_invite.id;

    select * into v_invite from public.invites where id = v_invite.id;
  end if;

  return v_invite;
end;
$$;

-- ---------------------------------------------------------------------------
-- Who may reach any of this
-- ---------------------------------------------------------------------------

-- Spelled out rather than left to whatever the project's defaults happen to
-- be, so reading this file tells you the whole story. `anon` -- a browser with
-- nobody signed in -- is given nothing: not a locked door it can rattle, no
-- door at all.

grant usage on schema public to authenticated;

grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.classes to authenticated;
grant select, insert, delete on public.enrollments to authenticated;
grant select, insert, update, delete on public.assignments to authenticated;
grant select, insert, update, delete on public.assignment_status to authenticated;
grant select, insert, delete on public.invites to authenticated;

revoke all on public.profiles from anon;
revoke all on public.classes from anon;
revoke all on public.enrollments from anon;
revoke all on public.assignments from anon;
revoke all on public.assignment_status from anon;
revoke all on public.invites from anon;

grant execute on function public.claim_invites() to authenticated;
grant execute on function public.invite_student(uuid, text) to authenticated;

-- The predicates are called by the policies, which run as the querying user,
-- so that user needs to be allowed to call them.
grant execute on function public.owns_class(uuid) to authenticated;
grant execute on function public.is_enrolled(uuid) to authenticated;
grant execute on function public.teaches_assignment(uuid) to authenticated;
grant execute on function public.can_see_assignment(uuid) to authenticated;
grant execute on function public.teaches_student(uuid) to authenticated;

revoke execute on function public.claim_invites() from anon;
revoke execute on function public.invite_student(uuid, text) from anon;

-- ---------------------------------------------------------------------------
-- Accounts that already exist
-- ---------------------------------------------------------------------------

-- Sign-in shipped before this schema did, so there are already people in
-- auth.users with no profile row. The trigger only fires on new sign-ups, and
-- an account with no profile is an account that cannot own a class or be put
-- on a roster. This catches them up.
insert into public.profiles (id, email, display_name)
select
  u.id,
  nullif(lower(btrim(coalesce(u.email, ''))), ''),
  coalesce(
    u.raw_user_meta_data ->> 'full_name',
    u.raw_user_meta_data ->> 'name',
    ''
  )
from auth.users u
on conflict (id) do nothing;
