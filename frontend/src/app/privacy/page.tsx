import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy Policy | UC+D Awards Submissions',
  description:
    'How Utah Construction + Design collects, uses, and stores information submitted to the Most Outstanding Projects Competition.',
};

// Shown in the page body and in the OAuth consent screen's privacy policy link.
// Update when the substance of the policy changes, not for typo fixes.
const LAST_UPDATED = 'October 7, 2026';

const CONTACT_EMAIL = 'lmarshall@utahcdmag.com';

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-white">
      <header className="bg-navy-500 shadow-md">
        <div className="max-w-3xl mx-auto px-8 lg:px-12 py-10">
          <Link href="/awards" className="inline-block mb-6">
            <img
              src="/ucd-logo.png"
              alt="Utah Construction + Design"
              className="h-14 w-auto"
            />
          </Link>
          <h1 className="text-3xl lg:text-4xl font-heading font-bold text-white">
            Privacy Policy
          </h1>
          <p className="mt-2 text-white/80 text-sm font-light">
            Last updated {LAST_UPDATED}
          </p>
        </div>
      </header>

      <article className="max-w-3xl mx-auto px-8 lg:px-12 py-12 text-gray-700 font-light leading-relaxed space-y-8">
        <section className="space-y-3">
          <p>
            This policy covers the awards submission site at{' '}
            <span className="font-medium">awards.utahcdmag.com</span>, operated by{' '}
            <span className="font-medium">Utah Construction + Design</span> (&ldquo;UC+D&rdquo;),
            which accepts entries for the Most Outstanding Projects Competition. It
            does not cover the printed magazine or any other UC+D website.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-heading font-bold text-black">
            What we collect
          </h2>
          <p>Everything we hold comes from a submission form you choose to fill out:</p>
          <ul className="list-disc list-outside ml-6 space-y-2">
            <li>
              <span className="font-medium">Contact details</span> — the submitter&rsquo;s
              name, job title, email address, phone number, and firm name.
            </li>
            <li>
              <span className="font-medium">Project details</span> — project name,
              location, cost, completion date, delivery method, square footage, number
              of stories, and award categories entered.
            </li>
            <li>
              <span className="font-medium">Project team credits</span> — the names of
              firms and individuals credited on the project, including the owner,
              owner&rsquo;s representative, design team, and construction trades.
            </li>
            <li>
              <span className="font-medium">Files you upload</span> — the completed
              submission form (PDF) and any project photographs.
            </li>
          </ul>
          <p>
            We do not ask for payment details, government identifiers, or any special
            category of personal data, and the site has no account system, so there is
            no password to store.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-heading font-bold text-black">
            How we use it
          </h2>
          <ul className="list-disc list-outside ml-6 space-y-2">
            <li>To review and judge entries for the competition.</li>
            <li>
              To send a confirmation email to the address on the submission, and to
              contact the submitter about the entry if something is missing or unclear.
            </li>
            <li>
              To publish material about winning and featured projects in{' '}
              <span className="italic">Utah Construction + Design</span> and its related
              channels. Project details, team credits, and submitted photography are
              provided for publication; personal contact details are not published.
            </li>
          </ul>
          <p>
            We do not sell this information, and we do not use it for advertising or
            share it with advertisers.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-heading font-bold text-black">
            Where it is stored
          </h2>
          <p>
            Submissions are stored in Google Cloud Storage, Google Drive, and Google
            Sheets, in accounts controlled by UC+D. Access is limited to UC+D editorial
            and production staff and to the contractors who maintain this site. Google
            acts as our hosting provider; see the{' '}
            <a
              href="https://policies.google.com/privacy"
              className="text-charcoal-500 underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Google Privacy Policy
            </a>
            .
          </p>
          <p>
            Confirmation emails are delivered through a third-party email service, which
            processes the recipient address solely to deliver that message.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-heading font-bold text-black">
            Spam protection
          </h2>
          <p>
            This site uses Google reCAPTCHA to tell real submitters from automated abuse.
            reCAPTCHA collects hardware and software information and sends it to Google
            for analysis. Its use is subject to the{' '}
            <a
              href="https://policies.google.com/privacy"
              className="text-charcoal-500 underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Google Privacy Policy
            </a>{' '}
            and{' '}
            <a
              href="https://policies.google.com/terms"
              className="text-charcoal-500 underline"
              target="_blank"
              rel="noopener noreferrer"
            >
              Terms of Service
            </a>
            .
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-heading font-bold text-black">
            How long we keep it
          </h2>
          <p>
            Submissions are retained as part of the magazine&rsquo;s editorial archive,
            because published issues reference the projects and credits they contain. If
            you want a submission removed, write to us and we will delete it, except
            where it has already appeared in print.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-heading font-bold text-black">
            Your choices
          </h2>
          <p>
            You can ask us what we hold about you, ask for a correction, or ask us to
            delete a submission. Email{' '}
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-charcoal-500 underline">
              {CONTACT_EMAIL}
            </a>{' '}
            and we will respond within 30 days.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-heading font-bold text-black">Contact</h2>
          <p>
            Utah Construction + Design
            <br />
            2075 S. Pioneer Road, Suite B
            <br />
            Salt Lake City, UT 84104
            <br />
            <a href={`mailto:${CONTACT_EMAIL}`} className="text-charcoal-500 underline">
              {CONTACT_EMAIL}
            </a>
          </p>
        </section>

        <section className="pt-4 border-t border-gray-200">
          <Link href="/awards" className="text-charcoal-500 underline">
            ← Back to submissions
          </Link>
        </section>
      </article>
    </main>
  );
}
