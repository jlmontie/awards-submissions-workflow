import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Terms of Service | UC+D Awards Submissions',
  description:
    'Terms governing use of the Utah Construction + Design Most Outstanding Projects Competition submission site.',
};

const LAST_UPDATED = 'October 7, 2026';

const CONTACT_EMAIL = 'lmarshall@utahcdmag.com';

export default function TermsPage() {
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
            Terms of Service
          </h1>
          <p className="mt-2 text-white/80 text-sm font-light">
            Last updated {LAST_UPDATED}
          </p>
        </div>
      </header>

      <article className="max-w-3xl mx-auto px-8 lg:px-12 py-12 text-gray-700 font-light leading-relaxed space-y-8">
        <section className="space-y-3">
          <p>
            These terms govern use of the awards submission site at{' '}
            <span className="font-medium">awards.utahcdmag.com</span>, operated by{' '}
            <span className="font-medium">Utah Construction + Design</span>
            (&ldquo;UC+D&rdquo;). By submitting an entry you agree to them.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-heading font-bold text-black">
            What this site is for
          </h2>
          <p>
            The site accepts entries to the Most Outstanding Projects Competition. It is
            for firms and individuals entering a project they worked on, or entering on
            behalf of such a firm with its permission. Submitting projects you have no
            connection to, or using the site to send anything other than a genuine entry,
            is not permitted.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-heading font-bold text-black">
            What you are telling us when you submit
          </h2>
          <ul className="list-disc list-outside ml-6 space-y-2">
            <li>
              The information in the submission is accurate to the best of your
              knowledge, including project costs, dates, and team credits.
            </li>
            <li>
              You have the right to provide the photographs you upload, and the right to
              let UC+D publish them. If a photographer holds the copyright, you have
              their permission and have credited them in the submission.
            </li>
            <li>
              You have your firm&rsquo;s permission to enter, and permission from the
              project owner where the project&rsquo;s details are confidential.
            </li>
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-heading font-bold text-black">
            How we may use your submission
          </h2>
          <p>
            You keep ownership of everything you submit. By entering, you grant UC+D a
            non-exclusive, royalty-free licence to reproduce the submitted materials in{' '}
            <span className="italic">Utah Construction + Design</span>, on its websites
            and social channels, and in promotional material for the competition, with
            credit as given in the submission. This licence covers the submitted project
            only, and does not extend to other work by your firm.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-heading font-bold text-black">
            Judging and results
          </h2>
          <p>
            Entries are judged at UC+D&rsquo;s discretion. We may decline an entry that is
            incomplete, submitted after a deadline, or outside the competition&rsquo;s
            scope. Judging decisions are final, and we do not provide individual
            feedback on entries that are not selected.
          </p>
          <p>
            Submitting an entry does not guarantee publication, and entry fees, where
            charged, are not refundable on the basis of an unsuccessful entry.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-heading font-bold text-black">
            Availability
          </h2>
          <p>
            We aim to keep the site working but do not guarantee uninterrupted
            availability. If a technical problem prevents your entry from reaching us
            before a deadline, contact us and we will work with you — do not assume a
            failed submission has been received.
          </p>
        </section>

        <section className="space-y-3">
          <h2 className="text-2xl font-heading font-bold text-black">
            Changes
          </h2>
          <p>
            We may update these terms. The date at the top of this page shows when they
            last changed, and the version in force is the one published when you submit.
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
