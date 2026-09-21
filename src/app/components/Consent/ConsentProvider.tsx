'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  CONSENT_STORAGE_KEY,
  ConsentState,
  loadGtm,
  readStoredConsent,
  stopAnalytics,
  storeConsent,
} from './consent';
import { ConsentBanner } from './ConsentBanner';

interface ConsentContextValue {
  /** `null` until the stored choice has been read on the client. */
  consent: ConsentState | null;
  accept: () => void;
  reject: () => void;
  /** Show the banner again so the visitor can change an earlier choice. */
  openSettings: () => void;
}

const ConsentContext = createContext<ConsentContextValue | null>(null);

export function useConsent(): ConsentContextValue {
  const context = useContext(ConsentContext);
  if (!context) {
    throw new Error('useConsent must be used within ConsentProvider');
  }
  return context;
}

export function ConsentProvider({ children }: { children: React.ReactNode }) {
  const [consent, setConsent] = useState<ConsentState | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // localStorage only exists in the browser; reading it after mount keeps the
  // server HTML and the first client render identical.
  useEffect(() => {
    setConsent(readStoredConsent());
  }, []);

  // GTM is injected here and nowhere else, and only for a stored or fresh "granted".
  useEffect(() => {
    if (consent === 'granted') loadGtm();
  }, [consent]);

  // Keep other open tabs in step with a choice made in this one.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== CONSENT_STORAGE_KEY) return;
      const next = readStoredConsent();
      if (next !== 'granted') stopAnalytics();
      setConsent(next);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const accept = useCallback(() => {
    storeConsent('granted');
    setConsent('granted');
    setSettingsOpen(false);
  }, []);

  const reject = useCallback(() => {
    storeConsent('denied');
    setConsent('denied');
    setSettingsOpen(false);
    // Google code that already ran cannot be unloaded; reload so it is gone.
    if (stopAnalytics()) window.location.reload();
  }, []);

  const openSettings = useCallback(() => setSettingsOpen(true), []);

  const value = useMemo(
    () => ({ consent, accept, reject, openSettings }),
    [consent, accept, reject, openSettings]
  );

  // The banner is part of the server HTML (consent === null) so that a first
  // visit paints it straight away instead of after hydration - rendering it
  // late made it the page's LCP element. For returning visitors the inline
  // script in layout.tsx marks <html data-consent>, and CSS hides the pending
  // banner before first paint; React then drops it once storage is read.
  const showBanner = consent === null || consent === 'unknown' || settingsOpen;

  return (
    <ConsentContext.Provider value={value}>
      {/* First in the DOM so keyboard and screen reader users meet it before
          the page, although it is drawn at the bottom of the screen. */}
      {showBanner && (
        <ConsentBanner
          pending={consent === null}
          consent={consent}
          onAccept={accept}
          onReject={reject}
          onDismiss={settingsOpen && consent !== 'unknown' ? () => setSettingsOpen(false) : undefined}
          focusOnMount={settingsOpen}
        />
      )}
      {children}
    </ConsentContext.Provider>
  );
}
