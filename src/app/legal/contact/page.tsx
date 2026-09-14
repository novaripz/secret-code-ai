import type { Metadata } from "next";
import { LegalShell, List, Section, type LegalSection } from "../_components/LegalShell";
import { ContactBlock } from "../_components/ContactBlock";
import { COMPANY_NAME } from "../contact-details";

// How to reach Prismly.
//
// No form. A form posting to a route that drops the message on the floor would
// look more finished and be worse: the student gets a green tick, nobody reads
// it, and they never write again. An address the reader can see, copy and paste
// into their own mail client is honest about where the message goes — and when
// there is no address yet, this page says so in as many words rather than
// inventing one.

export const metadata: Metadata = {
  title: "Contact Prismly — Panda",
  description: "How to reach Prismly about Panda: privacy, schools, bugs and data deletion.",
};

const SECTIONS: LegalSection[] = [
  { id: "reach-us", title: "How to reach us" },
  { id: "what-to-say", title: "What to include" },
  { id: "districts", title: "Schools and districts" },
  { id: "security", title: "Reporting a security problem" },
];

export default function ContactPage() {
  return (
    <LegalShell
      title="Contact"
      summary={`Panda is a small operation. A person reads what you send, and ${COMPANY_NAME} would rather hear a complaint than not hear it.`}
      sections={SECTIONS}
    >
      <Section id="reach-us" index={1} title="How to reach us">
        <ContactBlock />
        <p>
          If your school gave you Panda, your teacher or district IT can usually sort out an account
          problem faster than we can.
        </p>
      </Section>

      <Section id="what-to-say" index={2} title="What to include">
        <p>
          You do not have to write it formally. These are the things that save a round trip:
        </p>
        <List>
          <li>The email address on your account, if you have one.</li>
          <li>What you expected to happen, and what happened instead.</li>
          <li>Roughly when it happened, and what device or browser you were on.</li>
          <li>
            For a data deletion request: say so plainly, and say whether you want your whole account
            gone or only part of it.
          </li>
        </List>
        <p>
          Please do not paste passwords, and do not paste another student&rsquo;s work or personal
          details into a support email.
        </p>
      </Section>

      <Section id="districts" index={3} title="Schools and districts">
        <p>
          For a data protection agreement, a student privacy addendum, a security questionnaire, or a
          conversation before adopting Panda, write to the same address and say which one you need.
          These are available on request; none of them is in force until it is signed.
        </p>
        <p>
          Before you start that process, please read the Privacy Policy — particularly what a teacher
          can see and what {COMPANY_NAME} does not claim. Both are stated plainly so a review does
          not have to uncover them.
        </p>
      </Section>

      <Section id="security" index={4} title="Reporting a security problem">
        <p>
          If you have found a way to see data that is not yours, tell us before you tell anyone else.
          Include enough detail to reproduce it. We will not pursue anyone who reports a problem in
          good faith and does not go digging through other people&rsquo;s data while proving it.
        </p>
      </Section>
    </LegalShell>
  );
}
