/**
 * Analytics consent: storage and the Google Tag Manager loader.
 *
 * Nothing from Google may load before the visitor accepts. GTM (which loads
 * GA4) is injected from here only after an explicit "Elfogadom", and on later
 * visits only if that choice is still stored.
 */

export const GTM_ID = 'GTM-MP8HLBPM';
export const GA_MEASUREMENT_ID = 'G-2VZXM82THS';

/** localStorage key. Bump the version to ask everyone again if the purposes change. */
export const CONSENT_STORAGE_KEY = 'vasutterkep-analytics-consent-v1';

/** `unknown` = no stored decision yet (the banner is shown). */
export type ConsentState = 'unknown' | 'granted' | 'denied';

// dataLayer plus GA's documented opt-out flag, window['ga-disable-G-...'].
type AnalyticsWindow = {
  dataLayer?: unknown[];
  [gaDisableFlag: string]: unknown;
};

const GTM_SCRIPT_ID = 'gtm-script';

export function readStoredConsent(): ConsentState {
  try {
    const value = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    return value === 'granted' || value === 'denied' ? value : 'unknown';
  } catch {
    // Storage blocked (private mode, disabled site data): treat as undecided,
    // so nothing loads and the banner asks again.
    return 'unknown';
  }
}

export function storeConsent(value: 'granted' | 'denied'): void {
  try {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, value);
  } catch {
    // The choice still applies to this page view; it just is not remembered.
  }
}

export function isGtmLoaded(): boolean {
  return typeof document !== 'undefined' && document.getElementById(GTM_SCRIPT_ID) !== null;
}

/**
 * Inject the GTM container. Call only after the visitor has accepted.
 * Idempotent: a second call does nothing.
 */
export function loadGtm(): void {
  if (typeof window === 'undefined' || isGtmLoaded()) return;

  const w = window as unknown as AnalyticsWindow;
  w[`ga-disable-${GA_MEASUREMENT_ID}`] = false;
  w.dataLayer = w.dataLayer || [];
  const dataLayer = w.dataLayer;

  // The visitor agreed to statistics only, so tell Google tags not to use
  // advertising storage or signals. This must precede the container.
  // eslint-disable-next-line prefer-rest-params
  const gtag = function gtag(..._args: unknown[]) { dataLayer.push(arguments); };
  gtag('consent', 'default', {
    analytics_storage: 'granted',
    ad_storage: 'denied',
    ad_user_data: 'denied',
    ad_personalization: 'denied',
  });

  dataLayer.push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });

  const script = document.createElement('script');
  script.id = GTM_SCRIPT_ID;
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtm.js?id=${GTM_ID}`;
  document.head.appendChild(script);
}

/**
 * Stop Google Analytics in this page (if it was loaded) and remove its cookies.
 * Returns true when GTM had been loaded, in which case the caller should reload
 * so that no Google code keeps running.
 */
export function stopAnalytics(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as AnalyticsWindow;
  const wasLoaded = isGtmLoaded();

  // Documented GA opt-out switch: gtag.js stops sending hits when it is set.
  w[`ga-disable-${GA_MEASUREMENT_ID}`] = true;

  if (wasLoaded && Array.isArray(w.dataLayer)) {
    const dataLayer = w.dataLayer;
    // eslint-disable-next-line prefer-rest-params
    const gtag = function gtag(..._args: unknown[]) { dataLayer.push(arguments); };
    gtag('consent', 'update', { analytics_storage: 'denied' });
  }

  deleteAnalyticsCookies();
  return wasLoaded;
}

/** Remove GA's first-party cookies (_ga, _ga_<id>, _gid, _gat*) on this host and its parent domains. */
function deleteAnalyticsCookies(): void {
  try {
    const names = document.cookie
      .split(';')
      .map((c) => c.split('=')[0].trim())
      .filter((name) => /^(_ga|_ga_.+|_gid|_gat.*)$/.test(name));
    if (names.length === 0) return;

    // GA sets its cookies on the widest domain it can (e.g. .vasutterkep.hu),
    // so try every suffix of the current host as well as a host-only cookie.
    const parts = window.location.hostname.split('.');
    const domains: (string | null)[] = [null];
    for (let i = 0; i < parts.length - 1; i++) {
      domains.push('.' + parts.slice(i).join('.'));
    }

    for (const name of names) {
      for (const domain of domains) {
        document.cookie =
          `${name}=; Max-Age=0; path=/` + (domain ? `; domain=${domain}` : '');
      }
    }
  } catch {
    // Cookie access can throw in sandboxed contexts; nothing else to do.
  }
}
