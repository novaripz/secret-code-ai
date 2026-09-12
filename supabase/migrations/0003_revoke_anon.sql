-- Take the table grant away from signed-out callers.
--
-- Apply after 0002. Safe to re-run. It changes nothing a student or teacher
-- can do; it removes something a stranger currently can.
--
-- Why, when nothing was actually leaking: a Supabase project grants the `anon`
-- role table privileges by default, and 0002 added policies scoped to
-- `authenticated` without taking that grant back. Row-level security still
-- refused every row -- with no policy matching `anon`, the default is deny, and
-- an anonymous read returns an empty list rather than data.
--
-- So this is not a fix for a hole. It is the difference between one thing
-- standing between a stranger and student data, and two. The grant is the
-- outer door and RLS is the inner one; a future policy written `to public` by
-- accident, or a policy whose USING clause is subtly wrong, walks straight
-- through an unlocked outer door. Locking it costs nothing because nobody
-- signed out has any business reading these tables at all.
--
-- The difference is visible from outside: a revoked table answers a stranger
-- with "permission denied", where a merely-filtered one answers with an empty
-- list. The second says "there is nothing here for you"; the first says "this
-- is not yours to ask about".

revoke all on public.struggle_signals from anon;
revoke all on public.teacher_codes from anon;

-- The same reasoning applies to every table 0001 created. These are almost
-- certainly already covered by its own grants; the statements are here because
-- "almost certainly" is not a thing to leave in a file that guards other
-- people's children's schoolwork, and because re-running a revoke that was
-- already in force does nothing.
revoke all on public.profiles from anon;
revoke all on public.classes from anon;
revoke all on public.enrollments from anon;
revoke all on public.assignments from anon;
revoke all on public.assignment_status from anon;
revoke all on public.invites from anon;

-- Functions too. Signing in is what the anon role exists for; it is not a role
-- that should be able to invoke anything that touches a row.
revoke all on function public.redeem_teacher_code(text) from anon;
revoke all on function public.prune_struggle_signals(integer) from anon;

-- Anything added later inherits the same default, so this does not have to be
-- remembered again.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on functions from anon;
