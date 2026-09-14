import type { Metadata } from "next";
import Link from "next/link";
import { Callout, LegalShell, List, Section, type LegalSection } from "../_components/LegalShell";
import { ContactBlock } from "../_components/ContactBlock";
import { COMPANY_NAME } from "../contact-details";

// Panda's terms of service.
//
// The voice is the same one the rest of this repo uses: say the true thing,
// say the cost of it, and stop. A sixteen-year-old has to be able to read this
// — they are the person actually agreeing to it — while a district lawyer has
// to find the limitation of liability without hunting.
//
// What is deliberately absent: arbitration clauses, class-action waivers,
// choice-of-venue boilerplate and indemnities. Not because they are wrong, but
// because copying them from another company's terms would put clauses in here
// that nobody at Prismly has decided to stand behind. A short honest document
// that counsel extends is better than a long borrowed one it has to unpick.

export const metadata: Metadata = {
  title: "Terms of Service — Panda by Prismly",
  description: "The rules for using Panda, in plain language.",
};

const SECTIONS: LegalSection[] = [
  { id: "agreement", title: "The short version" },
  { id: "who-can-use", title: "Who can use Panda" },
  { id: "what-panda-is", title: "What Panda is, and is not" },
  { id: "your-work", title: "Your work is yours" },
  { id: "fair-use", title: "Using Panda fairly" },
  { id: "schools", title: "Schools and districts" },
  { id: "availability", title: "Availability and changes" },
  { id: "liability", title: "Limits on our responsibility" },
  { id: "ending", title: "Ending this" },
  { id: "contact", title: "Contact" },
];

export default function TermsPage() {
  return (
    <LegalShell
      title="Terms of Service"
      summary="The rules for using Panda, written so you can actually read them. Using Panda means you agree to what is on this page."
      sections={SECTIONS}
    >
      <Section id="agreement" index={1} title="The short version">
        <p>
          Panda is a study tool made by {COMPANY_NAME}. Use it to understand your work. It can be
          wrong. Do not use it to cheat, and do not use it to hurt anyone. We will keep it running as
          well as we can, and we cannot promise it will never break.
        </p>
        <p>
          Everything below expands on that. The{" "}
          <Link href="/legal/privacy" className="rounded font-medium text-[var(--text)] underline underline-offset-4">
            Privacy Policy
          </Link>{" "}
          covers what we do with your data and is part of this agreement.
        </p>
      </Section>

      <Section id="who-can-use" index={2} title="Who can use Panda">
        <p>
          Panda is built for high-school students and their teachers. You can use it on your own, or
          through a class your school set up.
        </p>
        <p>
          If you are under 13, set Panda up with a parent or your school rather than on your own.
          Panda does not check anyone&rsquo;s age.
        </p>
        <p>
          You are responsible for what happens under your account. On a shared school laptop, sign
          out when you are done — Panda keeps accounts separate, but not if you leave yours open.
        </p>
      </Section>

      <Section id="what-panda-is" index={3} title="What Panda is, and is not">
        <Callout title="Panda can be wrong." tone="warn">
          <p>
            Panda&rsquo;s answers come from AI models. They sound confident whether or not they are
            correct. They get facts wrong, they get maths wrong, and they invent things that look
            plausible.
          </p>
          <p>
            Check anything that matters. Panda is not a substitute for your teacher, and handing in
            something Panda wrote without understanding it is both a bad idea and, at most schools,
            cheating.
          </p>
        </Callout>
        <p>
          Panda is deliberately built not to hand over answers on request. It works up from a nudge
          and gives the full answer only when you have shown you understand, genuinely tried more
          than once, are reviewing finished work, or your teacher has allowed it. That is a teaching
          decision, not a restriction we will lift because you asked.
        </p>
        <p>
          Panda is not a grading tool, a proctoring tool, or a way for anyone to monitor what you
          say. What a teacher can see is spelled out in the{" "}
          <Link href="/legal/privacy#teachers" className="rounded font-medium text-[var(--text)] underline underline-offset-4">
            Privacy Policy
          </Link>
          , and it is never your messages.
        </p>
      </Section>

      <Section id="your-work" index={4} title="Your work is yours">
        <p>
          What you write and build in Panda belongs to you. We do not claim ownership of it, we do
          not sell it, and we do not use your chats to train an AI model of our own.
        </p>
        <p>
          To produce a reply, we have to send your message to a third-party AI provider — that is how
          the tool works at all, and it is described in section 4 of the Privacy Policy. Your school
          or district may have its own rules about what may be typed into an AI tool. Follow those.
        </p>
        <p>
          Panda itself — the app, its name and its design — belongs to {COMPANY_NAME}.
        </p>
      </Section>

      <Section id="fair-use" index={5} title="Using Panda fairly">
        <p>Do not:</p>
        <List>
          <li>Use Panda to break your school&rsquo;s rules on academic honesty.</li>
          <li>Try to reach another person&rsquo;s account, chats, class or data.</li>
          <li>Send abusive, hateful or illegal content, or content that targets another student.</li>
          <li>
            Script or automate Panda to burn through the AI quota that everyone else&rsquo;s classes
            share. Requests are rate-limited, and we will cut off an account that keeps hitting the
            limit on purpose.
          </li>
          <li>Attack the service, or try to get around the rules that keep students separated.</li>
        </List>
        <p>
          If you find a security hole, tell us instead of using it. We will take that seriously and
          we will not come after you for reporting it in good faith.
        </p>
      </Section>

      <Section id="schools" index={6} title="Schools and districts">
        <p>
          A teacher who creates a class is responsible for who they enrol in it and for the rules
          they set on assignments. Teacher accounts are not self-service: an account cannot promote
          itself, and the database refuses the attempt.
        </p>
        <p>
          If your district needs a formal agreement covering student data — a DPA, a student privacy
          addendum, or a security review — one is available on request. Nothing on this page creates
          such an agreement, and none is in force until it is signed.
        </p>
        <p>
          {COMPANY_NAME} does not claim FERPA or COPPA compliance and holds no certification or
          independent audit. Please read{" "}
          <Link href="/legal/privacy#not-yet" className="rounded font-medium text-[var(--text)] underline underline-offset-4">
            section 8 of the Privacy Policy
          </Link>{" "}
          before adopting Panda.
        </p>
      </Section>

      <Section id="availability" index={7} title="Availability and changes">
        <p>
          Panda is a young product and parts of it are still being built. Features can change,
          improve, or go away. We depend on outside services — AI providers, our database host, your
          school network — and when one of them is down, Panda will be too.
        </p>
        <p>
          There is no uptime guarantee. Some of your data lives only in your browser, so back up
          anything you cannot afford to lose. If we change these terms in a way that matters, the
          date at the top changes and we will say what changed.
        </p>
      </Section>

      <Section id="liability" index={8} title="Limits on our responsibility">
        <p>
          Panda is provided as it is, without warranties of any kind. We do not promise it will be
          accurate, available, or fit for a particular purpose.
        </p>
        <p>
          To the fullest extent the law allows, {COMPANY_NAME} is not liable for indirect or
          consequential losses arising from using Panda — including a grade, a missed deadline, or a
          decision made on the strength of something Panda said. Nothing here limits liability that
          cannot be limited by law.
        </p>
        <p>
          Consumer-protection and student-privacy laws where you live may give you rights that this
          page cannot take away. They win.
        </p>
      </Section>

      <Section id="ending" index={9} title="Ending this">
        <p>
          You can stop using Panda whenever you like. Deleting your data is covered in{" "}
          <Link href="/legal/privacy#delete" className="rounded font-medium text-[var(--text)] underline underline-offset-4">
            section 7 of the Privacy Policy
          </Link>
          .
        </p>
        <p>
          We can suspend or close an account that is being used to attack the service, to reach other
          students&rsquo; data, or to abuse someone. Where we reasonably can, we will say why first.
        </p>
      </Section>

      <Section id="contact" index={10} title="Contact">
        <ContactBlock />
      </Section>
    </LegalShell>
  );
}
