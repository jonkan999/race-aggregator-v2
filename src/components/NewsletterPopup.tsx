import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from 'react';
import { createPortal } from 'react-dom';
import '../styles/newsletter-popup.css';
import {
  readNewsletterPopupConfigFromDocument,
  recordNewsletterPopupEvent,
  resolveNewsletterPopupContent,
  subscribeNewsletterPopup,
  type NewsletterPopupConfig,
  type NewsletterPopupContext,
  type NewsletterPopupDismissReason,
  type NewsletterPopupResolvedContent,
  type NewsletterPopupTrigger,
} from '../lib/newsletterPopup';
import { isSupabaseConfigured } from '../lib/supabase';

type Props = {
  context: NewsletterPopupContext;
};

type ActivePopup = NewsletterPopupResolvedContent & {
  impressionId: string;
  triggerType: NewsletterPopupTrigger;
};

const GENERAL_COOLDOWN_MS = 18 * 60 * 60 * 1000;
const DISMISS_COOLDOWN_MS = 72 * 60 * 60 * 1000;

function storageKey(siteKey: string, key: string): string {
  return `race-aggregator:newsletter:${siteKey}:${key}`;
}

function readStorage(storage: Storage, key: string): string | null {
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(storage: Storage, key: string, value: string): void {
  try {
    storage.setItem(key, value);
  } catch {
    // Ignore storage write failures in private browsing modes.
  }
}

function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent ?? '';
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function isAutomatedBrowser(): boolean {
  return typeof navigator !== 'undefined' && navigator.webdriver;
}

function createClientId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function validEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function parseStoredTimestamp(value: string | null): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function markPopupShown(config: NewsletterPopupConfig): void {
  const now = Date.now().toString();
  writeStorage(sessionStorage, storageKey(config.siteKey, 'session-shown'), 'true');
  writeStorage(localStorage, storageKey(config.siteKey, 'last-shown-at'), now);
}

function markPopupDismissed(config: NewsletterPopupConfig): void {
  writeStorage(localStorage, storageKey(config.siteKey, 'last-dismissed-at'), Date.now().toString());
}

function markPopupSubscribed(config: NewsletterPopupConfig): void {
  writeStorage(localStorage, storageKey(config.siteKey, 'subscribed'), 'true');
  writeStorage(sessionStorage, storageKey(config.siteKey, 'session-shown'), 'true');
}

function canShowPopup(config: NewsletterPopupConfig, force = false): boolean {
  if (typeof window === 'undefined') return false;
  if (!force && !isSupabaseConfigured()) return false;
  if (!force && isAutomatedBrowser()) return false;
  if (!force && document.body.classList.contains('auth-modal-open')) return false;
  if (!force && readStorage(sessionStorage, 'authUser')) return false;
  if (readStorage(localStorage, storageKey(config.siteKey, 'subscribed')) === 'true') return false;
  if (!force && readStorage(sessionStorage, storageKey(config.siteKey, 'session-shown')) === 'true') {
    return false;
  }

  const lastDismissedAt = parseStoredTimestamp(
    readStorage(localStorage, storageKey(config.siteKey, 'last-dismissed-at')),
  );
  if (!force && lastDismissedAt && Date.now() - lastDismissedAt < DISMISS_COOLDOWN_MS) {
    return false;
  }

  const lastShownAt = parseStoredTimestamp(
    readStorage(localStorage, storageKey(config.siteKey, 'last-shown-at')),
  );
  if (!force && lastShownAt && Date.now() - lastShownAt < GENERAL_COOLDOWN_MS) {
    return false;
  }

  return true;
}

function backgroundImageStyle(src: string | null): CSSProperties | undefined {
  const normalized = String(src ?? '').trim();
  if (!normalized) return undefined;
  const safeSrc = normalized.replace(/"/g, '%22').replace(/\n/g, '');
  return {
    backgroundImage: `url("${safeSrc}")`,
  };
}

function popupKicker(
  config: NewsletterPopupConfig,
  popup: ActivePopup,
): string {
  if (popup.popupContext === 'race-detail') {
    return popup.contextData.race_name || config.siteName;
  }

  return popup.contextData.category ??
    popup.contextData.county ??
    popup.contextData.city ??
    popup.contextData.region ??
    popup.contextData.month ??
    config.countryName ??
    config.siteName;
}

export default function NewsletterPopup({ context }: Props) {
  const [config] = useState<NewsletterPopupConfig | null>(() =>
    readNewsletterPopupConfigFromDocument(),
  );
  const popupDraft = useMemo(
    () => (config ? resolveNewsletterPopupContent(config, context) : null),
    [config, context],
  );
  const [activePopup, setActivePopup] = useState<ActivePopup | null>(null);
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const emailInputRef = useRef<HTMLInputElement | null>(null);
  const toastTimeoutRef = useRef<number | null>(null);

  const popupEnabled = Boolean(
    popupDraft &&
      config &&
      popupDraft.title.trim() &&
      popupDraft.body.trim() &&
      popupDraft.emailPlaceholder.trim() &&
      popupDraft.submitButton.trim(),
  );

  const clearToast = useCallback(() => {
    if (toastTimeoutRef.current) {
      window.clearTimeout(toastTimeoutRef.current);
      toastTimeoutRef.current = null;
    }
  }, []);

  const showToast = useCallback(
    (message: string) => {
      if (!message) return;
      clearToast();
      setToastMessage(message);
      toastTimeoutRef.current = window.setTimeout(() => {
        setToastMessage('');
        toastTimeoutRef.current = null;
      }, 3200);
    },
    [clearToast],
  );

  useEffect(() => {
    return () => clearToast();
  }, [clearToast]);

  const openPopup = useCallback(
    (triggerType: NewsletterPopupTrigger, force = false): boolean => {
      if (!config || !popupDraft || !popupEnabled || activePopup) return false;
      if (!canShowPopup(config, force)) return false;

      const nextPopup: ActivePopup = {
        ...popupDraft,
        impressionId: createClientId(),
        triggerType,
      };

      markPopupShown(config);
      setEmail('');
      setError('');
      setSubmitting(false);
      setActivePopup(nextPopup);

      void recordNewsletterPopupEvent({
        impressionId: nextPopup.impressionId,
        eventType: 'impression',
        popupVariant: nextPopup.variantId,
        popupSurface: nextPopup.popupSurface,
        popupContext: nextPopup.popupContext,
        triggerType,
        siteKey: config.siteKey,
        siteName: config.siteName,
        countryCode: config.countryCode,
        localeCode: config.localeCode,
        pagePath: window.location.pathname,
        pageUrl: window.location.href,
        referrer: document.referrer || null,
        contextData: nextPopup.contextData,
      }).catch((loggingError) => {
        console.error('Newsletter popup impression logging failed', loggingError);
      });

      return true;
    },
    [activePopup, config, popupDraft, popupEnabled],
  );

  const closePopup = useCallback(
    (reason: NewsletterPopupDismissReason) => {
      if (!config || !activePopup) return;

      markPopupDismissed(config);
      setActivePopup(null);
      setSubmitting(false);
      setError('');

      void recordNewsletterPopupEvent({
        impressionId: activePopup.impressionId,
        eventType: 'dismiss',
        popupVariant: activePopup.variantId,
        popupSurface: activePopup.popupSurface,
        popupContext: activePopup.popupContext,
        triggerType: activePopup.triggerType,
        siteKey: config.siteKey,
        siteName: config.siteName,
        countryCode: config.countryCode,
        localeCode: config.localeCode,
        pagePath: window.location.pathname,
        pageUrl: window.location.href,
        referrer: document.referrer || null,
        contextData: activePopup.contextData,
        meta: {
          dismiss_reason: reason,
        },
      }).catch((loggingError) => {
        console.error('Newsletter popup dismiss logging failed', loggingError);
      });
    },
    [activePopup, config],
  );

  useEffect(() => {
    if (!config || !popupEnabled) return;

    const popupWindow = window as typeof window & {
      __raceAggregatorNewsletterPopupReady?: boolean;
    };
    const handler = () => {
      openPopup('manual', true);
    };

    popupWindow.__raceAggregatorNewsletterPopupReady = true;
    window.addEventListener('race-aggregator:open-newsletter-popup', handler as EventListener);
    return () => {
      popupWindow.__raceAggregatorNewsletterPopupReady = false;
      window.removeEventListener(
        'race-aggregator:open-newsletter-popup',
        handler as EventListener,
      );
    };
  }, [config, openPopup, popupEnabled]);

  useEffect(() => {
    if (!config || !popupDraft || !popupEnabled || activePopup) return;
    if (!canShowPopup(config)) return;

    let triggered = false;
    let delayComplete = false;
    const startTime = Date.now();

    const attemptOpen = (triggerType: NewsletterPopupTrigger) => {
      if (triggered) return;
      triggered = openPopup(triggerType);
    };

    const delayTimer = window.setTimeout(() => {
      delayComplete = true;
      attemptOpen('time_delay');
    }, popupDraft.triggerDelayMs);

    const scrollHandler = () => {
      if (triggered) return;
      const scrollHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (scrollHeight <= 0) return;

      const scrollRatio = window.scrollY / scrollHeight;
      if (scrollRatio >= popupDraft.scrollThreshold) {
        attemptOpen('scroll_depth');
      }
    };

    window.addEventListener('scroll', scrollHandler, { passive: true });

    const ios = isIOS();
    const tapHandler = () => {
      if (triggered || !delayComplete) return;
      attemptOpen('first_tap_ios');
    };

    const mouseHandler = (event: MouseEvent) => {
      if (triggered || Date.now() - startTime < popupDraft.triggerDelayMs) return;
      if (event.clientY > 12) return;
      if (event.relatedTarget) return;
      attemptOpen('exit_intent');
    };

    if (ios) {
      document.addEventListener('touchstart', tapHandler, {
        once: true,
        capture: true,
        passive: true,
      });
      document.body?.addEventListener('touchstart', tapHandler, {
        once: true,
        capture: true,
        passive: true,
      });
    } else {
      document.addEventListener('mouseout', mouseHandler);
    }

    return () => {
      window.clearTimeout(delayTimer);
      window.removeEventListener('scroll', scrollHandler);
      document.removeEventListener('mouseout', mouseHandler);
      document.removeEventListener('touchstart', tapHandler, true);
      document.body?.removeEventListener('touchstart', tapHandler, true);
    };
  }, [activePopup, config, openPopup, popupDraft, popupEnabled]);

  useEffect(() => {
    if (!activePopup) return;

    const scrollY = window.scrollY;
    document.body.classList.add('newsletter-popup-open');
    document.body.style.top = `-${scrollY}px`;
    document.body.dataset.newsletterPopupScrollY = String(scrollY);

    return () => {
      const storedScrollY = document.body.dataset.newsletterPopupScrollY;
      document.body.classList.remove('newsletter-popup-open');
      document.body.style.top = '';
      delete document.body.dataset.newsletterPopupScrollY;

      if (storedScrollY) {
        window.scrollTo(0, Number(storedScrollY));
      }
    };
  }, [activePopup]);

  useEffect(() => {
    if (!activePopup) return;

    const focusTimer = window.setTimeout(() => {
      emailInputRef.current?.focus();
    }, 140);

    const escapeHandler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closePopup('escape');
      }
    };

    document.addEventListener('keydown', escapeHandler);
    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('keydown', escapeHandler);
    };
  }, [activePopup, closePopup]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!config || !activePopup) return;

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !validEmail(normalizedEmail)) {
      setError(activePopup.invalidEmail);
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      await subscribeNewsletterPopup({
        email: normalizedEmail,
        impressionId: activePopup.impressionId,
        popupVariant: activePopup.variantId,
        popupSurface: activePopup.popupSurface,
        popupContext: activePopup.popupContext,
        siteKey: config.siteKey,
        siteName: config.siteName,
        countryCode: config.countryCode,
        localeCode: config.localeCode,
        pagePath: window.location.pathname,
        pageUrl: window.location.href,
        referrer: document.referrer || null,
        contextData: activePopup.contextData,
      });

      markPopupSubscribed(config);
      setActivePopup(null);
      setSubmitting(false);
      setEmail('');
      showToast(activePopup.successMessage);
    } catch (submitError) {
      console.error('Newsletter popup submit failed', submitError);
      setSubmitting(false);
      setError(activePopup.submitError);
    }
  }

  if (typeof document === 'undefined') {
    return null;
  }

  return (
    <>
      {activePopup
        ? createPortal(
            <>
              <div
                className="newsletter-popup-backdrop"
                onClick={() => closePopup('backdrop')}
              />
              <div className="newsletter-popup-shell">
                <div
                  className="newsletter-popup"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="newsletter-popup-title"
                >
                  <div
                    className="newsletter-popup__media"
                    style={backgroundImageStyle(activePopup.backgroundImageSrc)}
                  >
                    <div className="newsletter-popup__media-content">
                      <div className="newsletter-popup__media-kicker">{config?.siteName}</div>
                      <h2 className="newsletter-popup__media-title">{popupKicker(config, activePopup)}</h2>
                    </div>
                  </div>
                  <div className="newsletter-popup__content">
                    <button
                      type="button"
                      className="newsletter-popup__close"
                      aria-label={activePopup.closeAriaLabel}
                      onClick={() => closePopup('close_button')}
                    >
                      ×
                    </button>

                    {activePopup.eyebrow ? (
                      <div className="newsletter-popup__eyebrow">{activePopup.eyebrow}</div>
                    ) : null}

                    <h3 id="newsletter-popup-title" className="newsletter-popup__title">
                      {activePopup.title}
                    </h3>
                    <p className="newsletter-popup__body">{activePopup.body}</p>

                    {activePopup.highlights.length > 0 ? (
                      <ul className="newsletter-popup__highlights">
                        {activePopup.highlights.map((highlight) => (
                          <li key={highlight} className="newsletter-popup__highlight">
                            {highlight}
                          </li>
                        ))}
                      </ul>
                    ) : null}

                    <form className="newsletter-popup__form" onSubmit={handleSubmit}>
                      <div className="newsletter-popup__input-row">
                        <input
                          ref={emailInputRef}
                          className="newsletter-popup__input"
                          type="email"
                          autoComplete="email"
                          inputMode="email"
                          placeholder={activePopup.emailPlaceholder}
                          value={email}
                          onChange={(event) => setEmail(event.target.value)}
                        />
                        <button
                          type="submit"
                          className="newsletter-popup__submit"
                          disabled={submitting}
                        >
                          {submitting && activePopup.submittingText
                            ? activePopup.submittingText
                            : activePopup.submitButton}
                        </button>
                      </div>

                      <div className="newsletter-popup__error" aria-live="polite">
                        {error}
                      </div>

                      <div className="newsletter-popup__footer">
                        <div className="newsletter-popup__privacy">{activePopup.privacyNote}</div>
                        <button
                          type="button"
                          className="newsletter-popup__dismiss"
                          onClick={() => closePopup('secondary_button')}
                        >
                          {activePopup.dismissButton}
                        </button>
                      </div>
                    </form>
                  </div>
                </div>
              </div>
            </>,
            document.body,
          )
        : null}

      {toastMessage
        ? createPortal(
            <div className="newsletter-popup-toast" aria-live="polite">
              {toastMessage}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
