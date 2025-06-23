'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Train, Map, Search, Menu, X, User } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  const navItems = [
    { href: '/', label: 'Térkép', icon: Map },
    { href: '/search', label: 'Keresés', icon: Search, shortcut: '⌘K' },
  ];

  const isActive = (href: string) => {
    if (href === '/') {
      return pathname === '/';
    }
    return pathname.startsWith(href);
  };

  return (
    <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex">
            <Link href="/" className="flex items-center">
              <Train className="h-8 w-8 text-blue-600" />
              <span className="ml-2 text-xl font-semibold">Vonat Térkép</span>
            </Link>
            
            <div className="hidden sm:ml-8 sm:flex sm:space-x-8">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "inline-flex items-center px-1 pt-1 text-sm font-medium border-b-2 transition-colors",
                      active
                        ? "text-blue-600 border-blue-600"
                        : "text-gray-900 hover:text-blue-600 border-transparent hover:border-blue-600"
                    )}
                  >
                    <Icon className="h-4 w-4 mr-2" />
                    {item.label}
                    {item.shortcut && (
                      <span className="ml-2 text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                        {item.shortcut}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="flex items-center">
            {/* Ki vagyok? link - Desktop */}
            <div className="hidden sm:block">
              <Link
                href="/ki-vagyok"
                className={cn(
                  "inline-flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors",
                  pathname === '/ki-vagyok'
                    ? "text-blue-600 bg-blue-50"
                    : "text-gray-700 hover:text-blue-600 hover:bg-gray-50"
                )}
              >
                <User className="h-4 w-4 mr-2" />
                Ki vagyok?
              </Link>
            </div>
            
            {/* Mobile menu button */}
            <button
              onClick={() => setIsOpen(!isOpen)}
              className="sm:hidden inline-flex items-center justify-center p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 ml-2"
            >
              {isOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile menu */}
      <div className={cn('sm:hidden', isOpen ? 'block' : 'hidden')}>
        <div className="pt-2 pb-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setIsOpen(false)}
                className={cn(
                  "flex items-center px-3 py-2 text-base font-medium",
                  active
                    ? "text-blue-600 bg-blue-50"
                    : "text-gray-700 hover:text-gray-900 hover:bg-gray-50"
                )}
              >
                <Icon className="h-5 w-5 mr-3" />
                {item.label}
              </Link>
            );
          })}
          
          {/* Ki vagyok? - Mobile */}
          <Link
            href="/ki-vagyok"
            onClick={() => setIsOpen(false)}
            className={cn(
              "flex items-center px-3 py-2 text-base font-medium border-t border-gray-200 mt-2 pt-4",
              pathname === '/ki-vagyok'
                ? "text-blue-600 bg-blue-50"
                : "text-gray-700 hover:text-gray-900 hover:bg-gray-50"
            )}
          >
            <User className="h-5 w-5 mr-3" />
            Ki vagyok?
          </Link>
        </div>
      </div>
    </nav>
  );
}