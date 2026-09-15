-- ============================================================================
--  PANDA — every migration after 0003, in order.
--
--  Paste the whole file into the Supabase SQL editor and press Run. Once.
--  Every statement is idempotent, so running it again changes nothing. If you
--  have already applied some of these, running it is still the right move —
--  it is how the ones you missed get caught.
--
--  0004  Lets a teacher pin an assignment so it rises in each student's plan.
--  0005  The gradebook: weighted categories, marks, and assignment resources.
--  0007  Redeeming a teacher code can no longer report a success it did not
--        achieve.
--  0008  A teacher can turn teacher mode off themselves.
--  0009  Only a teacher can create a class, enforced by the database rather
--        than by hiding a button.
-- ============================================================================



-- ===========================================================================
--  0004_assignment_priority.sql
-- ===========================================================================

-- Let a teacher say "this one matters".
--
-- Apply after 0003. Safe to re-run.
--
-- Panda's plan has always ordered a student's work by arithmetic: what is
-- overdue, then what is due soonest, then what it is worth. That is the right
-- default and it stays the default. What it cannot know is the thing only the
-- teacher knows -- that this week's lab report is the one the unit is actually
-- assessed on, or that the short reading has to happen before Thursday's
-- discussion or the discussion does not work. This column is where the teacher
-- says so.
--
-- One boolean rather than a priority number. A scale invites a teacher to rank
-- every assignment against every other, which is work they will not do and
-- which the due dates already answer; a flag asks one question they can answer
-- in a second, and answering it for nothing has no cost. Defaulting to false
-- means every row that already exists keeps behaving exactly as it did.
--
-- It is a hint to the ordering, not an override of it. src/lib/school/planner.ts
-- clamps the lift so a pinned assignment can never outrank something that is
-- actually late: a student who misses overdue work because a pinned thing sat
-- on top of it is worse off than one who never saw the pin.
--
-- No policy changes. This lives on a row a teacher already owns and a student
-- already reads: `assignments_update_by_teacher` in 0001 covers writing it, and
-- `assignments_select_visible` covers reading it. Adding a column to a table
-- whose RLS is already right is the whole reason to put the flag here rather
-- than in a table of its own.
alter table public.assignments
  add column if not exists teacher_priority boolean not null default false;

comment on column public.assignments.teacher_priority is
  'Teacher marked this as priority. A lift in the planner''s ordering, never an override of an overdue item.';

-- Partial index: the planner only ever asks "which of these are pinned", and
-- pinned work is by design the small minority of rows. Indexing only the true
-- ones keeps the index a fraction of the size of the table it serves, and
-- costs nothing on the false rows nobody queries for.
create index if not exists assignments_priority_idx
  on public.assignments (class_id)
  where teacher_priority;

-- No grant needed: 0001 grants column-less `update` on the table to
-- `authenticated`, so a new column is covered by the grant that is already
-- there, and 0003's revoke from `anon` is likewise table-wide.


-- ===========================================================================
--  0005_gradebook.sql
-- ===========================================================================

-- The gradebook: categories, weights, and the grades themselves.
--
-- Apply after 0004. Safe to re-run.
--
-- Panda has known what work exists and whether a student says they finished it.
-- It has never known how they did. That gap is why a student still had to open
-- a second app to answer the one question they actually care about -- "what is
-- my grade" -- and why a teacher had no reason to keep this one up to date.
-- Three things close it: a per-class list of weighted categories, a nullable
-- category on each assignment, and a score per (student, assignment).
--
-- The whole design turns on one distinction that the rest of this file, and
-- src/lib/school/grades.ts, exist to protect: **a missing grade is not a zero**.
-- A student two weeks into a term with one marked quiz has a grade based on one
-- quiz, not a grade of 4%. So ungraded work is the *absence of a row* here,
-- never a row containing 0, and there is no default and no nullable
-- `points_earned` column that could blur the two. The type that comes back from
-- src/lib/db/grades.ts is `Grade | null` for the same reason: TypeScript will
-- not let a caller quietly read a missing grade as a number.
--
-- The other decision worth naming: weights are stored as the teacher typed
-- them, and are *not* constrained to sum to 100. A teacher mid-way through
-- setting up "Tests 75" has 75, and a database that refuses that write makes
-- the form unusable. The app normalises at read time and says on screen that it
-- did. Deciding this in SQL would mean deciding it in a place the teacher
-- cannot see.

-- ---------------------------------------------------------------------------
-- grade_categories
-- ---------------------------------------------------------------------------

-- "Tests 75%, Homework 25%", per class.
--
-- A table rather than a jsonb column on `classes`, because an assignment has to
-- reference a category and a foreign key is the only thing that makes renaming
-- one safe. `position` rather than sorting by name: the order a teacher lists
-- their categories in is information -- it is usually weightiest first -- and
-- alphabetising it throws that away.
--
-- `weight` is numeric and not an integer. Real syllabi say 12.5%.
create table if not exists public.grade_categories (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes (id) on delete cascade,
  name text not null check (length(btrim(name)) > 0),
  -- Percentage points, not a fraction: the teacher types 75 and reads back 75.
  -- Bounded only at the ends. A negative weight is nonsense; anything over 100
  -- on one category is a mistake the app should point at rather than refuse,
  -- but a single category cannot be worth more than the whole grade either.
  weight numeric not null default 0 check (weight >= 0 and weight <= 100),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Two categories called "Tests" in one class is always a typo, and it is a
  -- typo that silently splits a weight in half. Named so PostgREST can report
  -- it back as something the form can explain.
  unique (class_id, name)
);

create index if not exists grade_categories_class_idx
  on public.grade_categories (class_id, position);

comment on column public.grade_categories.weight is
  'Percentage points as the teacher typed them. Not constrained to sum to 100 -- the app normalises across the categories that have graded work, and says so on screen.';

-- ---------------------------------------------------------------------------
-- assignments.category_id
-- ---------------------------------------------------------------------------

-- Nullable, and staying nullable. Every assignment that already exists has no
-- category, a teacher who never sets any categories still has a working
-- gradebook (points across everything -- see `buildGrades`), and "not filed
-- yet" is a real state during the week a teacher is setting a class up.
--
-- `on delete set null` rather than cascade: deleting the "Homework" category
-- must not delete the homework. The assignments fall back to uncategorised,
-- which the grade maths already handles, and the teacher can re-file them.
alter table public.assignments
  add column if not exists category_id uuid
    references public.grade_categories (id) on delete set null;

create index if not exists assignments_category_idx
  on public.assignments (category_id)
  where category_id is not null;

-- ---------------------------------------------------------------------------
-- assignments.resources
-- ---------------------------------------------------------------------------

-- Links and materials a student can open from the assignment: the reading, the
-- slide deck, the practice set.
--
-- jsonb rather than a `resources` table because nothing ever queries across
-- them -- they are read exactly when the assignment they belong to is read, and
-- written only by the teacher editing that assignment. A table would buy a
-- join, a second set of policies and an ordering column for no query anyone
-- will ever write.
--
-- The check is deliberately shallow: it enforces that this is an array, and
-- nothing about what is in it. Validating a URL in a check constraint means
-- writing a URL parser in SQL, and the honest version of that is the one in
-- src/lib/school/types.ts, which rejects anything that is not http or https so
-- a `javascript:` link can never reach an anchor tag. The constraint here stops
-- the shape from being wrong; the app stops the contents from being dangerous.
alter table public.assignments
  add column if not exists resources jsonb not null default '[]'::jsonb
    check (jsonb_typeof(resources) = 'array');

comment on column public.assignments.resources is
  'Array of {label, url}. URL scheme is validated in the app (http/https only) -- see src/lib/school/types.ts.';

-- ---------------------------------------------------------------------------
-- grades
-- ---------------------------------------------------------------------------

-- One student's score on one assignment.
--
-- Read the absence of a row as "not marked yet", never as zero. That is the
-- single most important sentence in this migration. There is no `graded`
-- boolean to get out of step with the number beside it, and `points_earned` is
-- `not null` precisely so that a row cannot exist in a half-state: if a row is
-- here, it is a mark; if there is no row, nobody has marked it.
--
-- Zero is still writable, and means what it says -- "I marked this and they got
-- nothing" -- which a teacher does need to be able to record, and which is a
-- different fact from silence.
--
-- The points *possible* are not copied here. They live on the assignment, and
-- duplicating them would let the two drift: a teacher who changes a test from
-- 50 points to 60 expects every grade on it to be out of 60.
create table if not exists public.grades (
  id uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references public.assignments (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  -- Numeric for the same reason `assignments.points` is: half marks are real.
  -- Not bounded above by the assignment's points -- extra credit exists, and a
  -- constraint that reaches into another table costs a trigger to enforce and
  -- would tell a teacher they are wrong about their own class.
  points_earned numeric not null check (points_earned >= 0),
  comment text,
  -- Who marked it. Not `auth.uid()` as a default: a row written by a Canvas
  -- import or a future co-teacher should say so, and a default would quietly
  -- claim otherwise. `on delete set null` because a teacher leaving the school
  -- must not delete their students' grades.
  recorded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- One mark per student per assignment. This is also what makes the teacher's
  -- grid an upsert: typing over a score updates the row rather than growing a
  -- history of scores nobody asked for.
  unique (assignment_id, student_id)
);

create index if not exists grades_assignment_idx on public.grades (assignment_id);
-- The student's own view reads every grade they have, across classes, in one
-- query. This is the index that serves it.
create index if not exists grades_student_idx on public.grades (student_id);

comment on table public.grades is
  'A mark. NO ROW means ungraded, which is not zero -- nothing in this system may treat the two as the same.';

-- `updated_at` maintained by the same trigger function 0001 defines, so "when
-- was this mark last changed" is answered the same way everywhere.
drop trigger if exists grades_touch on public.grades;
create trigger grades_touch before update on public.grades
  for each row execute function public.touch_updated_at();

drop trigger if exists grade_categories_touch on public.grade_categories;
create trigger grade_categories_touch before update on public.grade_categories
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.grade_categories enable row level security;
alter table public.grades enable row level security;

-- ---- grade_categories -----------------------------------------------------

-- Same sentence as assignments: you set it, or you were given it. A student
-- reads the categories of a class they are in because their own grade
-- breakdown is meaningless without them -- "78%" is a number to argue with,
-- "78% because tests are three quarters of it" is one to act on.
drop policy if exists grade_categories_select_visible on public.grade_categories;
create policy grade_categories_select_visible on public.grade_categories
  for select to authenticated
  using (public.owns_class(class_id) or public.is_enrolled(class_id));

-- Writing is the teacher's, entirely. The `with check` repeats the test on
-- update so a category cannot be moved into a class the caller does not own --
-- the same reasoning as `assignments_update_by_teacher` in 0001.
drop policy if exists grade_categories_insert_by_teacher on public.grade_categories;
create policy grade_categories_insert_by_teacher on public.grade_categories
  for insert to authenticated
  with check (public.owns_class(class_id));

drop policy if exists grade_categories_update_by_teacher on public.grade_categories;
create policy grade_categories_update_by_teacher on public.grade_categories
  for update to authenticated
  using (public.owns_class(class_id))
  with check (public.owns_class(class_id));

drop policy if exists grade_categories_delete_by_teacher on public.grade_categories;
create policy grade_categories_delete_by_teacher on public.grade_categories
  for delete to authenticated
  using (public.owns_class(class_id));

-- ---- grades ---------------------------------------------------------------

-- The one policy in this file that is load-bearing against a person rather than
-- against a bug.
--
-- A student reads rows where `student_id = auth.uid()`. Not "rows in their
-- class", not "rows they can name the id of" -- rows that are theirs. Postgres
-- applies this to every query including the ones inside a join, so asking for
-- `grades` embedded under `assignments` returns a classmate's marks stripped
-- out rather than included: there is no shape of request that gets them back.
--
-- `teaches_assignment` is asked about the assignment and not about the student,
-- which is what keeps a teacher's reach inside their own classes. A teacher who
-- also teaches someone else's student in period 4 sees the period 4 marks and
-- nothing from period 2.
drop policy if exists grades_select_own_or_teacher on public.grades;
create policy grades_select_own_or_teacher on public.grades
  for select to authenticated
  using (student_id = auth.uid() or public.teaches_assignment(assignment_id));

-- Marking is the teacher's and only the teacher's.
--
-- Note what is deliberately absent: there is no insert, update or delete policy
-- mentioning `student_id = auth.uid()` anywhere below. With RLS enabled and no
-- matching policy, Postgres denies -- so a student writing their own grade is
-- refused by default. Saying it in a comment rather than writing a policy that
-- evaluates to false is the honest version: a `with check (false)` policy would
-- read as though there were a case where it passes.
--
-- `student_id` is not checked against the class roster here. `teaches_assignment`
-- already means the caller owns the class, and the foreign key means the student
-- exists; a teacher marking someone they have since removed from the roster is
-- recording a fact about work that was really set, and refusing it would lose
-- the mark rather than prevent anything.
drop policy if exists grades_insert_by_teacher on public.grades;
create policy grades_insert_by_teacher on public.grades
  for insert to authenticated
  with check (public.teaches_assignment(assignment_id));

drop policy if exists grades_update_by_teacher on public.grades;
create policy grades_update_by_teacher on public.grades
  for update to authenticated
  using (public.teaches_assignment(assignment_id))
  with check (public.teaches_assignment(assignment_id));

-- Deleting a grade is how a teacher un-marks something -- back to ungraded,
-- which is why it has to be possible and why it is not the same as writing a 0.
drop policy if exists grades_delete_by_teacher on public.grades;
create policy grades_delete_by_teacher on public.grades
  for delete to authenticated
  using (public.teaches_assignment(assignment_id));

-- ---------------------------------------------------------------------------
-- Who may reach any of this
-- ---------------------------------------------------------------------------

-- Spelled out the same way 0001 and 0003 do it: `authenticated` gets the table
-- privilege, `anon` gets no door at all. The grant is the outer lock and the
-- policies above are the inner one, and a table holding other people's
-- children's grades is the last place to rely on only one of them.
--
-- A student needs `select` on `grades` and nothing else; the grant is per table
-- rather than per role, so the policies are what hold the line on writes. That
-- is the same arrangement `assignment_status` has had since 0001.
grant select, insert, update, delete on public.grade_categories to authenticated;
grant select, insert, update, delete on public.grades to authenticated;

revoke all on public.grade_categories from anon;
revoke all on public.grades from anon;

-- `assignments` already had its grant and its revoke in 0001 and 0003; the two
-- new columns above are covered by both, which is the reason they live on that
-- row rather than in tables of their own.


-- ===========================================================================
--  0007_redeem_cannot_lie.sql
-- ===========================================================================

-- Redeeming a code cannot report success it did not achieve.
--
-- Apply after 0006 (or after 0005 if there is no 0006). Safe to re-run.
--
-- The bug: `redeem_teacher_code` updated `public.profiles` by id and then
-- returned 'teacher' whatever happened. An account with no profile row -- a
-- sign-up whose trigger did not fire, an account created before 0001 was
-- applied and missed by its backfill -- matched nothing. The update touched
-- zero rows, the function reported success, and the code's use was already
-- spent.
--
-- What a teacher experienced: "That code worked", then being a student again on
-- the next page load, with no way to tell why. Redeeming again spent another
-- use, and a code issued with max_uses = 1 then refused them entirely. Reported
-- as "they keep having to sign in with the code and they lose their classes" --
-- the classes were never lost, the gate simply stopped recognising the owner.
--
-- Two changes. The row is created if it is missing, so the ordinary case now
-- works. And the function checks what it actually changed before claiming
-- anything, so a failure that cannot be fixed here is loud instead of silent.
-- A spent code with nothing to show for it is the worst outcome available: the
-- one thing the teacher cannot do is issue themselves another.

create or replace function public.redeem_teacher_code(p_code text)
returns public.user_role
language plpgsql
security definer
set search_path = ''
as $$
declare
  found public.teacher_codes;
  v_uid uuid := auth.uid();
  v_changed integer;
begin
  if v_uid is null then
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

  perform set_config('panda.role_change_authorized', 'on', true);

  -- Create the row if this account never got one. The email and display name
  -- come from auth.users rather than from an argument, so a caller cannot use
  -- this to write somebody else's details into a profile.
  insert into public.profiles (id, email, display_name, role)
  select
    u.id,
    nullif(lower(btrim(coalesce(u.email, ''))), ''),
    coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', ''),
    'teacher'
  from auth.users u
  where u.id = v_uid
  on conflict (id) do update set role = 'teacher', updated_at = now();

  get diagnostics v_changed = row_count;

  perform set_config('panda.role_change_authorized', '', true);

  -- Nothing changed means the account has no row in auth.users either, which
  -- should be impossible for a caller auth.uid() just identified. Raising
  -- rolls the whole function back, including the use it would otherwise have
  -- spent, so the teacher keeps their code and can try again or ask for help.
  if v_changed = 0 then
    raise exception 'We could not set up your teacher account. Nothing was changed; your code is still good.'
      using errcode = 'P0001';
  end if;

  -- Counted only once the promotion is real. Spending a use for a promotion
  -- that did not happen is how a single-use code becomes worthless.
  update public.teacher_codes set uses = uses + 1 where code = found.code;

  return 'teacher'::public.user_role;
end;
$$;

revoke all on function public.redeem_teacher_code(text) from public, anon;
grant execute on function public.redeem_teacher_code(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Backfill the rows that were missing in the first place
-- ---------------------------------------------------------------------------
--
-- 0001 ran this once. Anyone who signed up between then and now is covered by
-- the sign-up trigger, but an account that slipped past both is exactly the
-- case above, and it costs nothing to sweep again.

insert into public.profiles (id, email, display_name)
select
  u.id,
  nullif(lower(btrim(coalesce(u.email, ''))), ''),
  coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', '')
from auth.users u
on conflict (id) do nothing;


-- ===========================================================================
--  0008_leaving_teacher_mode.sql
-- ===========================================================================

-- Leaving teacher mode, without being able to arrive by the same door.
--
-- Apply after 0007. Safe to re-run.
--
-- Teachers asked for a way out. The role guard from 0002 refuses any role
-- change made by the account it belongs to, which is exactly right for
-- promotion -- a student who could write 'teacher' into their own row would be
-- able to read every roster in the school -- and it also catches the harmless
-- direction on the way past. So the way down is a function, the same shape as
-- `redeem_teacher_code`: it sets the transaction-local flag the guard accepts,
-- makes the one update it is allowed to make, and checks what actually changed
-- before it reports anything.
--
-- The asymmetry is deliberate and is the whole security story here:
--
--   * the new role is the literal 'student'. It is not an argument, so there is
--     no value a caller can pass that raises them;
--   * the update only matches a row that is currently 'teacher', so this cannot
--     be aimed at anything but a demotion;
--   * the row is `id = auth.uid()`, so it only ever touches the caller's own
--     account, teacher or not.
--
-- Nothing is deleted. The account keeps owning its classes, rosters,
-- assignments, categories and grades -- those rows are keyed to this account's
-- id and are still there afterwards. What goes is the view: `owns_class` and
-- friends are role-blind, but every teacher screen is gated on
-- `profiles.role`, so the dashboard stops opening. Redeeming a fresh code puts
-- it all back, which is why the confirmation in Settings says to ask for one
-- rather than implying the work is gone.

create or replace function public.leave_teacher_mode()
returns public.user_role
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_changed integer;
begin
  if v_uid is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;

  perform set_config('panda.role_change_authorized', 'on', true);

  -- `role = 'teacher'` in the predicate is not an optimisation. It is what
  -- makes this function unable to do anything except take the role away: an
  -- account that is already a student matches nothing and falls into the
  -- branch below.
  update public.profiles
  set role = 'student', updated_at = now()
  where id = v_uid and role = 'teacher';

  get diagnostics v_changed = row_count;

  perform set_config('panda.role_change_authorized', '', true);

  -- 0007's lesson, applied in the other direction: a function that reports
  -- success it did not achieve is worse than one that fails loudly. Zero rows
  -- here means the account was not a teacher to begin with (a stale tab, a
  -- second click, a profile row that never existed), and saying so beats
  -- returning 'student' as if something had happened.
  if v_changed = 0 then
    raise exception 'This account is not a teacher account, so there was nothing to turn off.'
      using errcode = 'P0001';
  end if;

  return 'student'::public.user_role;
end;
$$;

revoke all on function public.leave_teacher_mode() from public, anon;
grant execute on function public.leave_teacher_mode() to authenticated;


-- ===========================================================================
--  0009_only_teachers_make_classes.sql
-- ===========================================================================

-- Only a teacher can create a class, enforced by Postgres rather than by a
-- hidden button.
--
-- Apply after 0008. Safe to re-run.
--
-- `classes_insert_own` asks whether the row you are filing is yours. It never
-- asked whether you are a teacher. So the policy correctly stopped a student
-- creating a class owned by somebody else, and permitted one owned by
-- themselves.
--
-- Nothing leaked: a student doing that would see a single empty class of their
-- own and could reach no other account's rows, since every other policy is
-- keyed on ownership or enrolment. But the app was removing the button and
-- calling the matter closed, and a rule that lives only in an interface is not
-- a rule — it is a suggestion to anyone who opens the network tab. A class that
-- no teacher made is also a class no grade can belong to and no roster can
-- reach, sitting in the database looking real.

-- ---------------------------------------------------------------------------
-- is_teacher
-- ---------------------------------------------------------------------------
--
-- Security definer for the same reason as the other helpers: a policy on
-- `classes` cannot read `profiles` on the caller's behalf without either
-- granting them a view of that table or answering the question for them. This
-- answers exactly one question about the caller and returns nothing else.
-- There is no argument, so there is no id to pass in and learn about somebody
-- else.

create or replace function public.is_teacher()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'teacher'
  );
$$;

revoke all on function public.is_teacher() from public, anon;
grant execute on function public.is_teacher() to authenticated;

-- ---------------------------------------------------------------------------
-- The policy
-- ---------------------------------------------------------------------------
--
-- Both halves are required and they guard different things. Ownership stops a
-- teacher filing a class under a colleague's name; the role check stops an
-- account that is not a teacher creating one at all.

drop policy if exists classes_insert_own on public.classes;
create policy classes_insert_own on public.classes
  for insert to authenticated
  with check (teacher_id = auth.uid() and public.is_teacher());

-- Updating is left as it was, deliberately. It already refuses to move a class
-- to another owner, and a teacher who is demoted should not have the classes
-- they already made become uneditable rows nobody can reach -- the dashboard
-- closing is the intended consequence of leaving teacher mode, not their work
-- freezing in place.

