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
