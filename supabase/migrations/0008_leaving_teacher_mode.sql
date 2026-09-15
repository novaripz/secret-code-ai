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
