import type { Metadata } from "next";
import Link from "next/link";
import { Callout, LegalShell, List, Section, SubHeading, type LegalSection } from "../_components/LegalShell";
import { ContactBlock } from "../_components/ContactBlock";
import { COMPANY_NAME } from "../contact-details";

// Panda's privacy policy.
//
// Written from the code, not from a template. Every factual claim below was
// checked against a file, and the ones that matter most are checked against the
// SQL, because a policy that describes an intention is worth nothing next to one
// that describes an enforced rule:
//
//   - what a teacher can and cannot see:  supabase/migrations/0002_...sql,
//     the two select policies on struggle_signals, and
//     src/lib/insights/teacherReport.ts
//   - what a signal contains:             the struggle_signals columns (no text)
//   - what stays in the browser:          src/store/useChatStore.ts,
//     useSchoolStore.ts, useMemoryStore.ts, useInsightsStore.ts
//   - where prompts go:                   src/lib/ai/chain.ts
//
// The hard rule for editing this file: if you cannot point at the line of code
// that makes a sentence true, delete the sentence. The temptation in a document
// a district reads is to round "we do not do that" up from "we have no plans
// to". That rounding is how a company ends up lying to a parent.

export const metadata: Metadata = {
  title: "Privacy Policy — Panda by Prismly",
  description:
    "What Panda stores, what a teacher can see, where messages go, and how to delete your data.",
};

const SECTIONS: LegalSection[] = [
  { id: "who-we-are", title: "Who runs Panda" },
  { id: "what-we-store", title: "What we store, and where" },
  { id: "teachers", title: "What a teacher can see" },
  { id: "ai-providers", title: "Messages go to AI companies" },
  { id: "other-services", title: "Other services we send data to" },
  { id: "who-can-see", title: "Who else can see your data" },
  { id: "delete", title: "Deleting your data" },
  { id: "not-yet", title: "What we do not claim" },
  { id: "changes", title: "Changes and contact" },
];

export default function PrivacyPage() {
  return (
    <LegalShell
      title="Privacy Policy"
      summary="What Panda keeps, who can see it, and how to get rid of it. No padding — if it is not in here, we are not doing it."
      sections={SECTIONS}
    >
      <Section id="who-we-are" index={1} title="Who runs Panda">
        <p>
          Panda is made and operated by {COMPANY_NAME}. When this policy says &ldquo;we&rdquo;, it
          means {COMPANY_NAME}. When it says &ldquo;you&rdquo;, it means the person using Panda —
          usually a student, sometimes a teacher.
        </p>
        <p>
          Panda is a study tool. It helps you understand your work. It is not a grading system, it
          is not a monitoring system, and it is not a place where anyone reads your chats.
        </p>
      </Section>

      <Section id="what-we-store" index={2} title="What we store, and where">
        <p>
          Panda stores data in two very different places, and the difference matters more than any
          promise we could make about it.
        </p>

        <SubHeading>On our server (a Postgres database)</SubHeading>
        <List>
          <li>
            <strong className="text-[var(--text)]">Your account.</strong> Your email address, your
            display name, your role (student or teacher), and your language settings. This is what
            signing in creates.
          </li>
          <li>
            <strong className="text-[var(--text)]">Classes and assignments</strong> that a teacher
            creates or imports, plus who is enrolled in each class.
          </li>
          <li>
            <strong className="text-[var(--text)]">Assignment progress</strong> — whether you have
            marked a piece of work as to do, in progress, or done.
          </li>
          <li>
            <strong className="text-[var(--text)]">Learning signals.</strong> Small records that say
            difficulty happened and roughly where: which topic, what kind of evidence (you pressed
            &ldquo;I don&rsquo;t understand&rdquo;, you asked for a hint, you came back to the same
            assignment the next day), and when. A signal contains{" "}
            <strong className="text-[var(--text)]">no message text</strong>. There is no column for
            it.
          </li>
        </List>

        <SubHeading>Only in your own browser</SubHeading>
        <p>
          Some of Panda still has no server side at all. These never leave your device unless you
          copy them out yourself:
        </p>
        <List>
          <li>Your chats — every message you and Panda have exchanged.</li>
          <li>Photos and files you attach to a chat (see section 4 for where they are sent).</li>
          <li>Things you asked Panda to remember about you, and your profile details.</li>
          <li>Projects you build, and their saved versions.</li>
        </List>
        <p>
          Because those live in the browser, they do not follow you to another device, and clearing
          your browser&rsquo;s site data deletes them for good. That is a real limitation, not a
          feature we are dressing up.
        </p>
        <p>
          One extra detail, because it is unusual and in your favour: when Panda estimates how
          comfortable you are reading English, it needs samples of your writing. Those samples are
          held in memory for that tab only and are never written to disk or sent to us. The estimate
          restarts every session as a result.
        </p>
      </Section>

      <Section id="teachers" index={3} title="What a teacher can see">
        <Callout title="A teacher never sees your messages.">
          <p>
            Teachers see counts and topics — &ldquo;four pieces of evidence on factoring across
            three days&rdquo; — never a sentence you wrote and never a sentence Panda wrote back.
          </p>
          <p>
            The report a teacher reads is built field by field from counts and labels. The database
            row a teacher can read has no message column at all. There is no setting that turns this
            off, for them or for us.
          </p>
        </Callout>
        <p>A teacher can see, and only see:</p>
        <List>
          <li>The classes they teach, and who is enrolled in them.</li>
          <li>The assignments in those classes, and each student&rsquo;s to do / done status.</li>
          <li>
            Counted learning signals attached to <em>their own</em> classes: the topic, how many
            pieces of evidence, over how many days, how recently, and how confident the tool is.
          </li>
          <li>
            An estimate of how comfortable a student is reading English, with the reasons behind it.
          </li>
        </List>

        <Callout title="Signals from the general chat are visible to no teacher at all." tone="warn">
          <p>
            When you chat with Panda outside a class, any signal that produces is tied to no class.
            The database rule lets a teacher read signals only where the class is one they own, so a
            signal with no class matches no teacher, ever — including your own teachers. The general
            chat is where you ask about things that are not schoolwork, and it stays yours.
          </p>
        </Callout>

        <p>
          A teacher cannot see signals from another teacher&rsquo;s class, and cannot see anything by
          guessing a student&rsquo;s id — the check is on who owns the class, not on who the student
          is. The database enforces all of this on every query, so a mistake in our own app code
          still cannot hand a teacher rows they should not have.
        </p>
        <p>
          Nobody can change their own account into a teacher account. That is blocked in the
          database too.
        </p>
      </Section>

      <Section id="ai-providers" index={4} title="Messages go to AI companies">
        <p>
          Panda does not run its own AI model. To write a reply, we send your message to a
          third-party AI provider over the internet and stream back what it says. Today those
          providers are Groq, Cerebras, NVIDIA and Google (Gemini); Panda tries them in order and
          uses whichever answers first.
        </p>
        <p>What goes with a message:</p>
        <List>
          <li>What you typed, and the recent messages in that chat.</li>
          <li>Any photo or file you attached. Photos of homework go to NVIDIA, which is the provider that can read images.</li>
          <li>
            In a class chat, the assignment text and the rules your teacher set for it. The general
            chat is never given your assignments.
          </li>
          <li>
            Details you have given Panda about yourself — your name, your interests, things you asked
            it to remember — so the reply fits you. You control these in Settings, and removing one
            stops it being sent.
          </li>
        </List>
        <p>
          Once a message reaches an AI provider, that company&rsquo;s own terms and privacy policy
          govern what it does with it, including whether it keeps it. We do not control that, and we
          are not going to pretend otherwise. Do not type anything into Panda that you would not want
          leaving the school — the same advice applies to any AI chat tool.
        </p>
      </Section>

      <Section id="other-services" index={5} title="Other services we send data to">
        <List>
          <li>
            <strong className="text-[var(--text)]">Supabase</strong> hosts the database and handles
            signing in. Your email and password live there, not with us.
          </li>
          <li>
            <strong className="text-[var(--text)]">Web search.</strong> If a search provider is
            configured, asking Panda to search sends your search words to it.
          </li>
          <li>
            <strong className="text-[var(--text)]">Canvas.</strong> If your school connects Canvas,
            Panda reads your classes and assignments from it. It never writes anything back to
            Canvas, and it never changes whether you marked something done.
          </li>
        </List>
        <p>
          Panda carries no advertising, no third-party tracking scripts and no analytics SDK. We do
          not sell your data, and we do not use your chats to train an AI model of our own.
        </p>
      </Section>

      <Section id="who-can-see" index={6} title="Who else can see your data">
        <p>
          Every table has row-level security switched on in the database. In plain words: nothing is
          readable because you asked nicely. You can read a row only if you own it, you are enrolled
          in the class it belongs to, or you teach that class. Signed-out visitors are refused
          outright.
        </p>
        <p>
          The people who operate {COMPANY_NAME} can technically reach the database, because someone
          has to be able to run it and fix it. We look at your data only when we have to — to fix a
          fault, to stop abuse, or when the law requires it. A student on a shared school laptop is
          kept separate from every other student on it by account.
        </p>
      </Section>

      <Section id="delete" index={7} title="Deleting your data">
        <p>Things you can delete yourself, right now:</p>
        <List>
          <li>
            <strong className="text-[var(--text)]">A chat.</strong> Open the chat list, use the menu
            on a chat, choose delete. It is gone from your device.
          </li>
          <li>
            <strong className="text-[var(--text)]">Memories and profile details.</strong> Settings →
            Memory removes them one at a time, or all at once.
          </li>
          <li>
            <strong className="text-[var(--text)]">Everything stored in this browser</strong> —
            chats, memories, projects, your local copy of learning signals. Clear site data for
            Panda in your browser settings, or use a private window and close it.
          </li>
        </List>
        <p>Things you have to ask us for, because we have not built the button yet:</p>
        <List>
          <li>
            Deleting the learning signals held on our server, and deleting your account and
            everything attached to it. Email us (section 9) and we will do it. Deleting your account
            removes your profile, your enrolments, your progress and your signals, because the
            database is set up to remove them with it.
          </li>
        </List>
        <p>
          Learning signals older than 30 days are pruned from the server when that job is run. The
          tool only ever looks at the last 14 days.
        </p>
      </Section>

      <Section id="not-yet" index={8} title="What we do not claim">
        <Callout title="Read this part before you sign anything." tone="warn">
          <p>
            {COMPANY_NAME} does <strong className="text-[var(--text)]">not</strong> claim FERPA or
            COPPA compliance. We hold no privacy certification, no SOC 2 report, and we have had no
            independent security audit. Nobody has checked our work but us.
          </p>
          <p>
            We are telling you this in our own privacy policy because a school deserves to know it
            before students are asked to use the tool, not after.
          </p>
        </Callout>
        <p>
          If your district needs a written agreement covering student data — a DPA, a student privacy
          addendum, a security questionnaire — one is available on request. There is no such
          agreement in force between us until you have signed one with us.
        </p>
        <p>
          Panda has no age check. If you are under 13, you should have a parent or your school set it
          up with you.
        </p>
      </Section>

      <Section id="changes" index={9} title="Changes and contact">
        <p>
          If we change this policy in a way that matters, we will change the date at the top and say
          what changed. Questions, corrections, or a request to delete your data all go to the same
          place:
        </p>
        <ContactBlock />
        <p>
          See also the{" "}
          <Link href="/legal/terms" className="rounded font-medium text-[var(--text)] underline underline-offset-4">
            Terms of Service
          </Link>
          .
        </p>
      </Section>
    </LegalShell>
  );
}
