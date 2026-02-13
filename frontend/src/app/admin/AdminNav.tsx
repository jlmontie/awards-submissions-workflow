'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function AdminNav() {
  const pathname = usePathname();

  const links = [
    { href: '/admin/awards', label: 'Awards' },
    { href: '/admin/surveys', label: 'Surveys' },
  ];

  return (
    <header className="bg-white border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center">
            <Link href="/admin" className="text-xl font-bold text-gray-900 hover:text-gray-700">
              UC&D Admin
            </Link>
          </div>
          <nav className="flex space-x-4">
            {links.map(({ href, label }) => {
              const isActive = pathname.startsWith(href);
              return (
                <Link
                  key={href}
                  href={href}
                  className={
                    isActive
                      ? 'text-blue-600 bg-blue-50 px-3 py-2 rounded-md text-sm font-medium'
                      : 'text-gray-700 hover:text-gray-900 px-3 py-2 rounded-md text-sm font-medium'
                  }
                >
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
    </header>
  );
}
