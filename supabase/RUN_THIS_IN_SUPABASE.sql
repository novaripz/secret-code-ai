-- ============================================================================
--  PANDA — migrations 0007, 0008 and 0009, together.
--
--  Paste this whole file into the Supabase SQL editor and press Run. Once.
--  Safe to run more than once; running it twice changes nothing.
--
--  0007  Redeeming a teacher code can no longer report a success it did not
--        achieve. This is the one that was costing teachers their role.
--  0008  A teacher can turn teacher mode off themselves.
--  0009  Only a teacher can create a class, enforced by the database rather
--        than by hiding a button.
-- ============================================================================



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

