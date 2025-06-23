import { useEffect } from 'react';

interface KeyboardShortcutOptions {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  preventDefault?: boolean;
}

export function useKeyboardShortcut(
  options: KeyboardShortcutOptions,
  callback: (event: KeyboardEvent) => void,
  dependencies: any[] = []
) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const {
        key,
        metaKey = false,
        ctrlKey = false,
        shiftKey = false,
        altKey = false,
        preventDefault = true
      } = options;

      // Check if the key combination matches
      const keyMatches = event.key.toLowerCase() === key.toLowerCase();
      const metaMatches = event.metaKey === metaKey;
      const ctrlMatches = event.ctrlKey === ctrlKey;
      const shiftMatches = event.shiftKey === shiftKey;
      const altMatches = event.altKey === altKey;

      if (keyMatches && metaMatches && ctrlMatches && shiftMatches && altMatches) {
        if (preventDefault) {
          event.preventDefault();
        }
        callback(event);
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [options.key, options.metaKey, options.ctrlKey, options.shiftKey, options.altKey, options.preventDefault, callback, ...dependencies]);
}