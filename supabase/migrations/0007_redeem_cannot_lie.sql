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
