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
