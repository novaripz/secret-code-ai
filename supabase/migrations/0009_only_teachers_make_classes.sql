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
