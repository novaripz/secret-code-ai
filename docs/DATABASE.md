# Setting up Panda's database

Everything in Panda used to live in the browser. That was fine while Panda was
a single-player tool, but a roster is by definition something two people share,
so classes, assignments and progress now live in Postgres — inside the same
Supabase project you already made for sign-in.

This page is the whole setup. It is one file of SQL, run once, by hand. You do
not need to install anything, and there is no command line involved.

**Time: about ten minutes.** Do the steps in order.

Before you start you need:

- A Supabase project (the one whose URL and key are already in your
  `.env.local` as `SUPABASE_URL` and `SUPABASE_ANON_KEY`). If you have not
  made one yet, `.env.example` walks through it.
- To be the person who owns that project — i.e. you can sign in at
  supabase.com and open the project yourself. Only the owner can do step 4.

---

## A word on what you are about to do

The file you are running, `supabase/migrations/0001_init.sql`, does two
things. It makes six tables (`profiles`, `classes`, `enrollments`,
`assignments`, `assignment_status`, `invites`), and it attaches a long list of
**security policies** to them. Those policies are the important half — see
[section 6](#6-what-row-level-security-is-actually-doing) — and they are why
this is one file rather than something you can half-do.

Running it a second time will not work. See [section 5](#5-when-it-errors).

---

## 1. Open the SQL editor

1. Go to <https://supabase.com/dashboard> and sign in.
2. Click your project. If you have more than one, pick the one whose URL
   matches the `SUPABASE_URL` in your `.env.local` — the project URL is shown
   on the project home page and looks like
   `https://abcdefghijklm.supabase.co`. Getting the wrong project here is the
   single easiest mistake to make, so check it.
3. In the left sidebar, click **SQL Editor**. The icon is a small database
   symbol; if the sidebar is collapsed to icons, hover to find the label.
4. Click **New query** (top of the editor, or the `+` tab). You get an empty
   text box with a **Run** button.

That text box is a direct line to your database. Whatever you paste there runs
as the project owner, which means it ignores every security rule in this file.
That is exactly why steps 4 and onward can only happen here and not in the app.

## 2. Run the migration

1. Open `supabase/migrations/0001_init.sql` from this repository in your text
   editor.
2. Select **all** of it — every line, about 840 of them — and copy it. Partial
   copies are the most common cause of the errors in section 5: the tables get
   made and the security policies do not, which is worse than not running it at
   all.
3. Paste it into the empty SQL editor query.
4. Click **Run** (or press Ctrl+Enter / Cmd+Enter).

It should take a second or two. When it finishes you want to see **Success. No
rows returned** underneath the editor.

That message is correct and is not an error. The file creates things; it does
not ask any questions, so there is nothing to show you. If you see red text
instead, skip to [section 5](#5-when-it-errors).

## 3. Check that it actually worked

"Success" means the last statement ran. Verify the whole thing landed by
running a query that counts what should now exist.

Open a **New query**, paste this, and Run:

```sql
select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  count(p.polname) as policy_count
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policy p on p.polrelid = c.oid
where n.nspname = 'public'
  and c.relkind = 'r'
group by c.relname, c.relrowsecurity
order by c.relname;
```

This asks Postgres directly: which tables exist, is row-level security switched
on for each, and how many policies does each have. The correct output is
exactly these six rows:

| table_name          | rls_enabled | policy_count |
| ------------------- | ----------- | ------------ |
| `assignment_status` | `true`      | 4            |
| `assignments`       | `true`      | 4            |
| `classes`           | `true`      | 4            |
| `enrollments`       | `true`      | 3            |
| `invites`           | `true`      | 3            |
| `profiles`          | `true`      | 4            |

Read it like this:

- **Six rows.** Fewer means the file stopped partway through. Go to section 5.
- **`rls_enabled` is `true` on every single row.** If any row says `false`,
  **stop** — that table is readable by anybody signed in, including other
  schools' students if you ever share the project. Go to section 5 and re-run
  from a clean database.
- **`policy_count` matches.** A table with RLS on and zero policies denies
  everyone including you, so the app would look broken rather than unsafe.
  A count that is too low means some policies failed to create.

Also confirm the two helper functions the app calls exist:

```sql
select proname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and proname in ('invite_student', 'claim_invites')
order by proname;
```

You should get exactly two rows: `claim_invites` and `invite_student`. These
are how a teacher adds a student by email address; without them, the roster
screen cannot work.

## 4. Make yourself (or your teacher) a teacher

Every account that signs up is a **student**. There is no button anywhere in
Panda that makes someone a teacher, and that is on purpose — see the warning
below. Promotion happens here, in the SQL editor, by the person who owns the
project.

Open a **New query**, put the real email address in, and Run:

```sql
update public.profiles
set role = 'teacher'
where email = lower(btrim('teacher@yourschool.org'));
```

Replace `teacher@yourschool.org` with the address they signed in with. The
`lower(btrim(...))` is there so `  Ms.Alvarez@School.org ` still finds the
right person — Panda stores every address lowercased and trimmed.

You should see **Success. 1 row returned** or a row-count of 1.

**If it says 0 rows**, the account does not exist yet. Nothing is wrong; the
profile row is only created when someone signs in for the first time. Have them
sign in to Panda once, then run the statement again.

Check it stuck:

```sql
select email, role, display_name
from public.profiles
where email = lower(btrim('teacher@yourschool.org'));
```

You want one row with `role` reading `teacher`.

To undo it, run the same `update` with `set role = 'student'`.

> ### Why this cannot be a button in the app
>
> A teacher account can read things a student account cannot: the roster of
> every class it owns, the names and email addresses on that roster, and every
> student's progress on every assignment it set.
>
> That is the whole security model in one sentence — so the word `teacher` on
> your row is the *only* thing standing between a curious sixteen-year-old and
> their classmates' work. If Panda had a "make me a teacher" setting, any
> student could flip it, create nothing, and then... well, they would still be
> limited to classes they own, but the design would rest on the app never
> having a bug, instead of on the database refusing.
>
> So the database refuses. There is a trigger on the `profiles` table that
> raises an error if an account tries to change its own `role` — including
> through a bug in Panda's own code, including through a hand-crafted request
> that skips the app entirely. The only case it lets through is the one where
> there is no signed-in user at all, which is precisely this SQL editor, which
> is precisely you.
>
> The practical consequence: **do not hand out access to your Supabase
> dashboard.** It is the one door that bypasses all of this.

## 5. When it errors

Red text under the editor. Find the message below.

### `type "user_role" already exists`, or `relation "profiles" already exists`

You have run the migration before, or run part of it. This is by far the most
common problem and it usually happens on a second, nervous attempt after the
first one looked like it had failed.

**Do not just delete the failing lines and re-run the rest.** That is how you
end up with tables that exist and policies that do not — which passes a casual
glance and leaves student data readable.

First find out whether the first run actually finished: go back to
[section 3](#3-check-that-it-actually-worked) and run the verification query.

- **If you get all six rows with the correct counts: you are done.** The
  migration already applied. The error was just you running it twice. Move on
  to step 4.
- **If the output is short or any `rls_enabled` says `false`:** the schema is
  half-built. Clear it out and start over. In a **New query**, run:

  ```sql
  drop table if exists
    public.assignment_status,
    public.invites,
    public.enrollments,
    public.assignments,
    public.classes,
    public.profiles
    cascade;

  drop type if exists public.assignment_state;
  drop type if exists public.answers_policy;
  drop type if exists public.feature_policy;
  drop type if exists public.content_source;
  drop type if exists public.user_role;

  drop function if exists public.handle_new_user() cascade;
  drop function if exists public.handle_user_email_change() cascade;
  drop function if exists public.claim_invites() cascade;
  drop function if exists public.invite_student(uuid, text) cascade;
  drop function if exists public.touch_updated_at() cascade;
  drop function if exists public.enforce_role_not_self_serviceable() cascade;
  drop function if exists public.owns_class(uuid) cascade;
  drop function if exists public.is_enrolled(uuid) cascade;
  drop function if exists public.teaches_assignment(uuid) cascade;
  drop function if exists public.can_see_assignment(uuid) cascade;
  drop function if exists public.teaches_student(uuid) cascade;
  ```

  **This deletes every class, assignment and roster in the project.** It does
  *not* delete anyone's account or sign-in — those live in Supabase's own
  `auth` tables, which nothing above touches. Everyone stays signed in; their
  classes are gone. On a fresh setup that is nothing. If real students have
  been using it, do not run this without saying so first.

  Then go back to [section 2](#2-run-the-migration) and run the whole file
  again from the top.

### `permission denied for schema public` or `must be owner of ...`

You are not running as the project owner. Make sure you are in the **SQL
Editor** on supabase.com, and not connected through some other database tool
with a limited login.

### `function gen_random_uuid() does not exist`

Very old Supabase projects are missing an extension that new ones have. Run
this once, then re-run the migration:

```sql
create extension if not exists pgcrypto;
```

### `syntax error at or near ...`

Almost always a partial copy — the paste was cut off, or your editor had a
region selected. Re-copy the entire file, confirm the last line you pasted
matches the last line of `0001_init.sql`, and try again.

### Something else

Copy the exact error message. The line number Supabase reports refers to the
text in the editor box, so open `0001_init.sql` at that line — the file is
heavily commented and the comment above each block explains what it is for.

## 6. What row-level security is actually doing

You will be asked "is my students' data safe?" Here is the honest answer, in
the order it is worth explaining.

**The short version.** Every table has rules attached that say who is allowed
to see each individual row. Postgres checks those rules on every single query,
no matter where the query came from. Panda does not get to decide who sees
what; the database decides, and Panda has to live with the answer.

**Why that is different from the usual promise.** Most apps check permissions
in application code: "if the user is a teacher, show the roster." That works
until someone writes a bug — one missing `if`, one screen that forgets to
filter — and then the data is out. Here, the check does not live in the app at
all. If Panda asks for every assignment in the database, Postgres hands back
only the ones that particular account is entitled to, and the bug produces an
empty screen instead of a leak.

**The rules, in plain language.** There are only three sentences in the whole
schema. Someone may see a row if they *own* it, if they are *enrolled in the
class* it belongs to, or if they *teach that class*. That is it. Specifically:

- A student sees their own profile, their own classes, the assignments in
  those classes, and their own progress. They cannot see who else is in the
  class, their classmates' progress, or their classmates' email addresses.
- A teacher sees the classes they created, the roster for those classes, and
  progress on the assignments they set. They **cannot** look up an account by
  email or browse students they do not teach — a teacher account is not a
  directory of the school.
- Nobody who is not signed in can read anything at all. Not a locked door they
  can rattle; no door.

**One rule worth mentioning to a teacher specifically:** marking work done is
the *student's* write and nobody else's. There is deliberately no rule
anywhere that lets a teacher, an import, or an automated job set a student's
status. "Done" is the student's word.

**What this does not protect against.** Be straight about this part:

- Anyone with your Supabase dashboard password can read and change everything.
  Row-level security is aimed at the app's users, not at the project owner.
- Anyone signed in as a student can see that student's own data — so a shared,
  unlocked laptop with a session left open is still a shared, unlocked laptop.
- Panda sends assignment text to Google's Gemini API to do its actual job.
  That is a separate question from this database, and it is worth answering
  separately rather than letting "the database is secure" imply more than it
  says.

---

## Step 6 — apply `0002_signals_and_teacher_codes.sql`

Same as before: open the SQL editor, paste the whole file, Run. It adds two
things.

**Learning signals.** These used to live in each student's browser, where you
could never see them. Now they are rows, and the rule that decides who may read
one is worth knowing because a teacher will ask you:

- A student can read all of their own signals.
- A teacher can read a signal **only if it is attached to a class they own**.
- A signal from the general chat belongs to no class, so **no teacher can read
  it, ever.** That is where a student asks about things that are not
  schoolwork, and it stays theirs.
- No signal ever contains message text. It records that difficulty happened and
  on which assignment, never what was said.

**Teacher codes.** Instead of you running SQL every time a teacher joins, you
issue a code once and they redeem it when they sign up.

Make a code:

```sql
insert into public.teacher_codes (code, label, max_uses, expires_at)
values ('choose-something-hard-to-guess', 'Ms Rivera, room 214', 1, now() + interval '14 days');
```

Give that string to the teacher. They sign up in the app, enter it, and become a
teacher. Change `max_uses` if one code should cover a whole department.

See who used what:

```sql
select code, label, uses, max_uses, revoked, expires_at from public.teacher_codes;
```

Turn one off:

```sql
update public.teacher_codes set revoked = true where code = 'the-code';
```

**A student still cannot promote themselves.** The rule from step 5 is
unchanged — a role change is refused while anyone is signed in. Redeeming is the
one exception, and it only opens for a code you deliberately created. Treat a
code like a password: it is the whole authorisation.

---

## Step 7 — apply `0003_revoke_anon.sql`

Paste and Run, same as the others. Two lines of what it does, because a teacher
or a district may ask you:

Signed-out visitors had a leftover table privilege on the new tables. Nothing
leaked — row-level security refused every row, which is why an anonymous read
came back empty instead of full. This takes the privilege away too, so a
stranger is stopped twice rather than once.

It changes nothing for students or teachers.

**How to check it worked.** From any browser, with your publishable key, reading
a table should now say `permission denied` rather than returning `[]`. "There is
nothing here for you" and "this is not yours to ask about" are different
answers, and the second is the one you want a stranger to get.
