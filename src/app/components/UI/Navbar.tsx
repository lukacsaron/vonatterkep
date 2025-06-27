'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Train, Map, Search, Menu, X, User, Coffee, Heart } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { useSearch } from '@/app/components/Search/GlobalSearchProvider';

function BuyMeCoffeeButton() {
  return (
    <a 
      href="https://www.buymeacoffee.com/aron.lukacs" 
      target="_blank" 
      rel="noopener noreferrer"
      className="group inline-flex items-center bg-[#FFDD00] hover:bg-[#FFD700] active:bg-[#FFCC00] rounded-lg px-3 py-2 transition-all duration-200 ease-in-out transform hover:scale-105 active:scale-95 shadow-md hover:shadow-lg"
    >
      {/* Coffee icon */}
      <Coffee className="h-4 w-4 text-black mr-2 group-hover:scale-110 transition-transform duration-200" />
      
      {/* Text */}
      <span className="text-black font-semibold text-sm whitespace-nowrap">
        Szállj be egy kávéval! :)
      </span>
      
      {/* Heart with number */}
      <div className="ml-3 flex items-center bg-black bg-opacity-20 rounded px-2 py-1">
        <Heart className="h-3 w-3 text-white mr-1 fill-white group-hover:scale-110 transition-transform duration-200" />
        <span className="text-white text-xs font-semibold">15</span>
      </div>
    </a>
  );
}

type NavItem = {
  href: string;
  label: string;
  icon: any;
  shortcut?: string;
  onClick?: () => void;
};

export function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const { openSearch } = useSearch();

  const navItems: NavItem[] = [
    { href: '/', label: 'Térkép', icon: Map },
    { href: '/search', label: 'Keresés', icon: Search, shortcut: '⌘K', onClick: openSearch },
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
              <span className="ml-2 text-xl font-semibold">VasútTérkép</span>
            </Link>
            
            <div className="hidden sm:ml-8 sm:flex sm:space-x-8">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                
                if (item.onClick) {
                  // Handle search button specially
                  return (
                    <button
                      key={item.href}
                      onClick={() => {
                        item.onClick?.();
                      }}
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
                    </button>
                  );
                }
                
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
            <div className="hidden sm:flex sm:items-center sm:space-x-2">
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
              
              {/* Buy Me a Coffee button */}
              <BuyMeCoffeeButton />            
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
            
            if (item.onClick) {
              // Handle search button specially
              return (
                <button
                  key={item.href}
                  onClick={() => {
                    item.onClick?.();
                    setIsOpen(false);
                  }}
                  className={cn(
                    "flex items-center px-3 py-2 text-base font-medium w-full text-left",
                    active
                      ? "text-blue-600 bg-blue-50"
                      : "text-gray-700 hover:text-gray-900 hover:bg-gray-50"
                  )}
                >
                  <Icon className="h-5 w-5 mr-3" />
                  {item.label}
                </button>
              );
            }
            
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
          
          {/* Buy Me a Coffee - Mobile */}
          <div className="px-3 py-2">
            <BuyMeCoffeeButton />
          </div>              </div>
      </div>
    </nav>
  );
}