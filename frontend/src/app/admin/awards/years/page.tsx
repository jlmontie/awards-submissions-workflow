'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

interface AwardYear {
  year: string;
  status: 'draft' | 'open' | 'closed';
  opens: string;
  closes: string;
  closedAt: string;
  updatedAt: string;
  updatedBy: string;
}

type Window =
  | { accepting: true; year: string }
  | { accepting: false; year: string | null; reason: 'closed' | 'not_yet_open' | 'none' };

const STATUS_STYLES: Record<AwardYear['status'], string> = {
  draft: 'bg-gray-100 text-gray-800',
  open: 'bg-green-100 text-green-800',
  closed: 'bg-yellow-100 text-yellow-800',
};

function formatDate(date: string) {
  if (!date) return '';
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function PublicStatus({ configured, window, years }: { configured: boolean; window: Window | null; years: AwardYear[] }) {
  let tone = 'border-green-400 bg-green-50 text-green-900';
  let text: string;
  if (!configured || !window) {
    text =
      'No award year has been opened yet. Until one is, the public form stays open and files entries under the current calendar year.';
  } else if (window.accepting) {
    const closes = years.find((y) => y.year === window.year)?.closes;
    text = `The public form is open, taking ${window.year} entries${closes ? ` through ${formatDate(closes)} (Mountain time)` : ' until closed here'}.`;
  } else {
    tone = 'border-yellow-400 bg-yellow-50 text-yellow-900';
    text =
      window.reason === 'not_yet_open'
        ? `The public form is closed until ${window.year} opens on ${formatDate(years.find((y) => y.year === window.year)?.opens || '')}.`
        : 'The public form is closed and is not taking entries.';
  }
  return <div className={`mt-6 border-l-4 p-4 text-sm ${tone}`}>{text}</div>;
}

function YearRow({ y, onSaved }: { y: AwardYear; onSaved: () => void }) {
  const [opens, setOpens] = useState(y.opens);
  const [closes, setCloses] = useState(y.closes);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const datesChanged = opens !== y.opens || closes !== y.closes;

  async function save(patch: Partial<AwardYear>) {
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/awards/admin/years/${y.year}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      onSaved();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function closeNow() {
    if (window.confirm(`Close ${y.year}? The public form stops taking entries within a minute.`)) {
      save({ status: 'closed' });
    }
  }

  return (
    <tr>
      <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm font-semibold text-gray-900">{y.year}</td>
      <td className="whitespace-nowrap px-3 py-4 text-sm">
        <span className={`inline-flex rounded-full px-2 text-xs font-semibold leading-5 ${STATUS_STYLES[y.status]}`}>
          {y.status}
        </span>
      </td>
      <td className="px-3 py-4 text-sm">
        <input type="date" value={opens} onChange={(e) => setOpens(e.target.value)} className="rounded-md border border-gray-300 px-2 py-1" />
      </td>
      <td className="px-3 py-4 text-sm">
        <input type="date" value={closes} onChange={(e) => setCloses(e.target.value)} className="rounded-md border border-gray-300 px-2 py-1" />
      </td>
      <td className="px-3 py-4 text-xs text-gray-500">
        {y.updatedAt && new Date(y.updatedAt).toLocaleString()}
        {y.updatedBy && <div>{y.updatedBy}</div>}
      </td>
      <td className="whitespace-nowrap px-3 py-4 text-sm">
        <div className="flex gap-2">
          {datesChanged && (
            <button onClick={() => save({ opens, closes })} disabled={saving} className="rounded-md bg-navy-500 px-3 py-1 font-semibold text-white disabled:opacity-50">
              Save dates
            </button>
          )}
          {y.status !== 'open' ? (
            <button onClick={() => save({ status: 'open' })} disabled={saving} className="rounded-md bg-white px-3 py-1 font-semibold text-gray-900 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:opacity-50">
              Open
            </button>
          ) : (
            <button onClick={closeNow} disabled={saving} className="rounded-md bg-white px-3 py-1 font-semibold text-red-700 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 disabled:opacity-50">
              Close now
            </button>
          )}
        </div>
        {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      </td>
    </tr>
  );
}

function NewYearForm({ suggested, onCreated }: { suggested: string; onCreated: () => void }) {
  const [year, setYear] = useState(suggested);
  const [opens, setOpens] = useState('');
  const [closes, setCloses] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => setYear(suggested), [suggested]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/awards/admin/years', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Created as a draft: nothing changes for the public form until it is opened.
        body: JSON.stringify({ year, opens, closes, status: 'draft' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Create failed');
      setOpens('');
      setCloses('');
      onCreated();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={create} className="mt-10 rounded-lg border border-gray-200 bg-white p-6">
      <h2 className="text-lg font-heading font-semibold text-navy-500">Add an award year</h2>
      <p className="mt-1 text-sm text-gray-600">
        New years start as drafts. Open one when it should start taking entries; only one year can be open at a time.
      </p>
      <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-end">
        <label className="text-sm text-gray-700">
          Year
          <input value={year} onChange={(e) => setYear(e.target.value)} required pattern="\d{4}" className="mt-1 block w-28 rounded-md border border-gray-300 px-3 py-2" />
        </label>
        <label className="text-sm text-gray-700">
          Opens <span className="text-gray-400">(optional)</span>
          <input type="date" value={opens} onChange={(e) => setOpens(e.target.value)} className="mt-1 block rounded-md border border-gray-300 px-3 py-2" />
        </label>
        <label className="text-sm text-gray-700">
          Closes <span className="text-gray-400">(last day, optional)</span>
          <input type="date" value={closes} onChange={(e) => setCloses(e.target.value)} className="mt-1 block rounded-md border border-gray-300 px-3 py-2" />
        </label>
        <button type="submit" disabled={saving} className="rounded-md bg-navy-500 px-4 py-2 text-sm font-semibold text-white hover:bg-navy-600 disabled:opacity-50">
          {saving ? 'Adding…' : 'Add year'}
        </button>
      </div>
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
    </form>
  );
}

export default function AwardYearsPage() {
  const [data, setData] = useState<{ configured: boolean; years: AwardYear[]; window: Window | null } | null>(null);
  const [error, setError] = useState('');

  async function load() {
    try {
      const res = await fetch('/api/awards/admin/years');
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || 'Failed to load award years');
      setData(body);
    } catch (err: any) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const latest = data?.years[0]?.year;
  const suggested = latest ? String(Number(latest) + 1) : String(new Date().getFullYear());

  return (
    <div className="px-4 sm:px-6 lg:px-8">
      <Link href="/admin/awards" className="text-sm text-gray-500 hover:text-gray-700">
        ← Submissions
      </Link>
      <h1 className="mt-2 text-2xl font-heading font-semibold text-navy-500">Award Years</h1>
      <p className="mt-2 text-sm text-gray-700">
        Each year&apos;s competition: when the public form takes entries, and which year they are filed under. Dates are in
        Mountain time; entries are accepted through the end of the closing day.
      </p>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
      {!data && !error && <p className="mt-6 text-sm text-gray-500">Loading…</p>}

      {data && (
        <>
          <PublicStatus configured={data.configured} window={data.window} years={data.years} />

          {data.years.length > 0 && (
            <div className="mt-6 overflow-x-auto rounded-lg border border-gray-200">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    {['Year', 'Status', 'Opens', 'Closes', 'Last change', ''].map((h) => (
                      <th key={h} className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500 first:pl-4">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {data.years.map((y) => (
                    <YearRow key={`${y.year}-${y.updatedAt}`} y={y} onSaved={load} />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <NewYearForm suggested={suggested} onCreated={load} />
        </>
      )}
    </div>
  );
}
