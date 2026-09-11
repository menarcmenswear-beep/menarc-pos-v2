'use client';
import Link from 'next/link';
import { LogoutButton } from '@/components/logout-button';

const LINKS = [
  { href: '/', label: 'POS Checkout' },
  { href: '/inventory', label: 'Inventory' },
  { href: '/purchases', label: 'Purchases' },
  { href: '/suppliers', label: 'Suppliers' },
  { href: '/returns', label: 'Returns' },
  { href: '/dashboard', label: 'Dashboard' },
];

export function Nav({ current, showLogout = false }: { current: string; showLogout?: boolean }) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <nav className="flex items-center gap-1.5 flex-wrap">
        {LINKS.map(link => (
          <Link
            key={link.href}
            href={link.href}
            className={`text-xs px-3 py-1.5 rounded transition border ${
              current === link.href
                ? 'text-white bg-neutral-800 border-neutral-700'
                : 'text-neutral-400 hover:text-white bg-neutral-900 border-neutral-800'
            }`}
          >
            {link.label}
          </Link>
        ))}
      </nav>
      {showLogout && <LogoutButton />}
    </div>
  );
}
