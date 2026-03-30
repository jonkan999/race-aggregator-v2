import { useEffect, useMemo, useState } from 'react';
import { getSupabaseBrowserClient, isSupabaseConfigured } from '../lib/supabase';
import { recordSupabaseSignup } from '../lib/authTracking';

type AuthMessages = {
  titleSignIn: string;
  titleCreateAccount: string;
  titleResetPassword: string;
  namePlaceholder: string;
  emailPlaceholder: string;
  passwordPlaceholder: string;
  submitSignIn: string;
  submitCreateAccount: string;
  submitResetPassword: string;
  createAccount: string;
  forgotPassword: string;
  backToLogin: string;
  errorWrongPassword: string;
  errorEmailNotFound: string;
  alreadyLoggedIn: string;
  asEmail: string;
  continueAsUser: string;
  logoutAndSwitch: string;
  accountCreated: string;
  accountCreatedDetails: string;
  verificationEmailSent: string;
  pleaseVerify: string;
  errorInvalidCredential: string;
  createAccountPrompt: string;
  errorTooManyRequests: string;
  authUnavailable: string;
  passwordResetSent: string;
  continueWithGoogle: string;
  continueWithGoogleCreate: string;
  googleInProgress: string;
  oauthDivider: string;
};

type Props = {
  siteKey: string;
  siteName: string;
  countryCode: string;
  locale: 'native' | 'en';
  signInLabel: string;
  confirmUrl: string;
  resetPasswordUrl: string;
  messages: AuthMessages;
};

type ModalView = 'login' | 'create' | 'reset' | 'logged-in' | 'success';

type StoredAuthUser = {
  email: string;
  displayName: string;
};

function readUserDisplayName(user: {
  email?: string | null;
  user_metadata?: Record<string, unknown>;
} | null): string {
  if (!user) return '';
  const candidate = user.user_metadata?.display_name;
  return typeof candidate === 'string' && candidate.trim() ? candidate.trim() : user.email ?? '';
}

export default function HeaderAuth({
  siteKey,
  siteName,
  countryCode,
  locale,
  signInLabel,
  confirmUrl,
  resetPasswordUrl,
  messages,
}: Props) {
  const [isConfigured, setIsConfigured] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalView, setModalView] = useState<ModalView>('login');
  const [currentUser, setCurrentUser] = useState<StoredAuthUser | null>(null);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [signupName, setSignupName] = useState('');
  const [signupEmail, setSignupEmail] = useState('');
  const [signupPassword, setSignupPassword] = useState('');
  const [resetEmail, setResetEmail] = useState('');
  const [loginError, setLoginError] = useState('');
  const [signupError, setSignupError] = useState('');
  const [resetError, setResetError] = useState('');
  const [showResetLink, setShowResetLink] = useState(false);
  const [showCreateLink, setShowCreateLink] = useState(false);
  const [successUser, setSuccessUser] = useState<StoredAuthUser | null>(null);
  const [oauthError, setOauthError] = useState('');
  const [oauthInFlight, setOauthInFlight] = useState(false);

  const supabase = useMemo(() => {
    if (!isConfigured) return null;
    return getSupabaseBrowserClient();
  }, [isConfigured]);

  useEffect(() => {
    const configured = isSupabaseConfigured();
    setIsConfigured(configured);
    if (!configured || typeof window === 'undefined') return;

    const stored = window.sessionStorage.getItem('authUser');
    if (stored) {
      try {
        setCurrentUser(JSON.parse(stored) as StoredAuthUser);
      } catch {
        window.sessionStorage.removeItem('authUser');
      }
    }

    const client = getSupabaseBrowserClient();
    client.auth.getSession().then(({ data }) => {
      const user = data.session?.user ?? null;
      if (user) {
        const next = { email: user.email ?? '', displayName: readUserDisplayName(user) || signInLabel };
        window.sessionStorage.setItem('authUser', JSON.stringify(next));
        setCurrentUser(next);
      } else if (!stored) {
        setCurrentUser(null);
      }
    });

    const { data: listener } = client.auth.onAuthStateChange((_event, session) => {
      const user = session?.user ?? null;
      if (user) {
        const next = { email: user.email ?? '', displayName: readUserDisplayName(user) || signInLabel };
        window.sessionStorage.setItem('authUser', JSON.stringify(next));
        setCurrentUser(next);
      } else {
        window.sessionStorage.removeItem('authUser');
        setCurrentUser(null);
      }
    });

    return () => listener.subscription.unsubscribe();
  }, [signInLabel]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.body.classList.toggle('auth-modal-open', modalOpen);
    return () => document.body.classList.remove('auth-modal-open');
  }, [modalOpen]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const handleExternalOpen = (event: Event) => {
      const customEvent = event as CustomEvent<{ view?: ModalView }>;
      openModalWithView(customEvent.detail?.view ?? 'login');
    };

    window.addEventListener('race-aggregator:open-auth-modal', handleExternalOpen as EventListener);
    return () =>
      window.removeEventListener(
        'race-aggregator:open-auth-modal',
        handleExternalOpen as EventListener,
      );
  }, [isConfigured, currentUser]);

  function resetForms() {
    setLoginEmail('');
    setLoginPassword('');
    setSignupName('');
    setSignupEmail('');
    setSignupPassword('');
    setResetEmail('');
    setLoginError('');
    setSignupError('');
    setResetError('');
    setShowResetLink(false);
    setShowCreateLink(false);
    setOauthError('');
    setOauthInFlight(false);
  }

  function openModal() {
    if (!isConfigured) return;
    if (currentUser) {
      setModalView('logged-in');
    } else {
      setModalView('login');
    }
    setModalOpen(true);
  }

  function openModalWithView(view: ModalView) {
    if (!isConfigured) return;
    if (currentUser) {
      setModalView('logged-in');
    } else {
      setModalView(view);
    }
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    resetForms();
    setModalView('login');
  }

  async function handleLoginSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!supabase) {
      setLoginError(messages.authUnavailable);
      return;
    }

    setLoginError('');
    setOauthError('');
    setShowCreateLink(false);
    setShowResetLink(false);

    const { data, error } = await supabase.auth.signInWithPassword({
      email: loginEmail.trim(),
      password: loginPassword,
    });

    if (error) {
      const message = error.message.toLowerCase();
      if (message.includes('invalid login credentials')) {
        setLoginError(messages.errorWrongPassword);
        setShowResetLink(true);
      } else if (message.includes('email not confirmed')) {
        setLoginError(messages.pleaseVerify);
      } else if (message.includes('too many')) {
        setLoginError(messages.errorTooManyRequests);
        setShowResetLink(true);
      } else {
        setLoginError(messages.errorInvalidCredential);
      }
      return;
    }

    const user = data.user;
    if (user) {
      const next = { email: user.email ?? '', displayName: readUserDisplayName(user) || signInLabel };
      setCurrentUser(next);
    }
    closeModal();
  }

  async function handleSignupSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!supabase) {
      setSignupError(messages.authUnavailable);
      return;
    }

    setSignupError('');
    setOauthError('');
    const normalizedEmail = signupEmail.trim().toLowerCase();

    const absoluteConfirmUrl =
      typeof window === 'undefined'
        ? confirmUrl
        : new URL(confirmUrl, window.location.origin).toString();

    const { data, error } = await supabase.auth.signUp({
      email: normalizedEmail,
      password: signupPassword,
      options: {
        emailRedirectTo: absoluteConfirmUrl,
        data: {
          display_name: signupName.trim(),
          site_key: siteKey,
          site_name: siteName,
          country_code: countryCode,
          locale: locale === 'native' ? 'sv' : 'en',
          marketing_soft_consent: true,
        },
      },
    });

    if (error) {
      if (error.message.toLowerCase().includes('already registered')) {
        setSignupError(messages.errorEmailNotFound);
      } else {
        setSignupError(error.message);
      }
      return;
    }

    await recordSupabaseSignup({
      supabase,
      email: normalizedEmail,
      siteKey,
      siteName,
      countryCode,
      locale,
      siteUrl: typeof window !== 'undefined' ? window.location.origin : null,
    });

    const userDisplay = {
      email: normalizedEmail,
      displayName: signupName.trim() || normalizedEmail,
    };

    if (data.session && data.user) {
      setCurrentUser(userDisplay);
    }

    setSuccessUser(userDisplay);
    setModalView('success');
  }

  async function handleResetSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!supabase) {
      setResetError(messages.authUnavailable);
      return;
    }

    setResetError('');
    setOauthError('');
    const absoluteResetUrl =
      typeof window === 'undefined'
        ? resetPasswordUrl
        : new URL(resetPasswordUrl, window.location.origin).toString();
    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail.trim(), {
      redirectTo: absoluteResetUrl,
    });

    if (error) {
      setResetError(error.message);
      return;
    }

    setResetError(messages.passwordResetSent);
  }

  async function handleLogoutAndSwitch() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setCurrentUser(null);
    resetForms();
    setModalView('login');
  }

  async function handleGoogleAuth() {
    if (!supabase) {
      setOauthError(messages.authUnavailable);
      return;
    }

    setOauthInFlight(true);
    setOauthError('');
    setLoginError('');
    setSignupError('');
    const absoluteConfirmUrl =
      typeof window === 'undefined'
        ? confirmUrl
        : new URL(confirmUrl, window.location.origin).toString();

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: absoluteConfirmUrl,
          queryParams: {
            prompt: 'select_account',
          },
        },
      });

      if (error) {
        setOauthInFlight(false);
        setOauthError(error.message);
      }
    } catch (error) {
      setOauthInFlight(false);
      setOauthError(error instanceof Error ? error.message : messages.authUnavailable);
    }
  }

  const loginColor = currentUser ? 'var(--color-primary)' : 'var(--color-primary-shade)';
  const currentDisplayName = currentUser?.displayName ?? '';

  return (
    <>
      <div
        className="login-container"
        id="login-container"
        style={{ color: loginColor }}
        onClick={openModal}
        aria-hidden={!isConfigured}
        title={signInLabel}
      >
        <div className="login-wrapper">
          <svg className="icon login-icon" title={signInLabel} id="login-icon">
            <use xlinkHref={`/icons/svg-sprite.svg#${currentUser ? 'person-circle' : 'person-circle-outline'}`} />
          </svg>

          <span id="loginText" className="user-display-name login-text" style={{ display: currentUser ? 'none' : 'block' }}>
            {signInLabel}
          </span>
          <span id="currentUserDisplayName" className="user-display-name" style={{ display: currentUser ? 'block' : 'none' }}>
            {currentDisplayName}
          </span>
        </div>
      </div>

      <div className="auth-modal-container" style={{ display: modalOpen ? 'block' : 'none' }}>
        <div className="auth-modal-backdrop" onClick={closeModal} />
        <div className="auth-modal">
          <div id="loginForm" className="auth-form-container" style={{ display: modalView === 'login' ? 'block' : 'none' }}>
            <h2>{messages.titleSignIn}</h2>
            <form id="authForm" onSubmit={handleLoginSubmit}>

              <input type="email" id="loginEmail" placeholder={messages.emailPlaceholder} required value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} />
              <input type="password" id="loginPassword" placeholder={messages.passwordPlaceholder} required value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} />
              <div className="error-container">
                <div id="loginError" className="error">{loginError || oauthError}</div>
                <a
                  href="#"
                  id="errorResetLink"
                  className="error-reset-link"
                  style={{ display: showResetLink ? 'block' : 'none' }}
                  onClick={(event) => {
                    event.preventDefault();
                    setResetEmail(loginEmail);
                    setModalView('reset');
                  }}
                >
                  {messages.forgotPassword}
                </a>
                <a
                  href="#"
                  id="errorCreateLink"
                  className="error-reset-link"
                  style={{ display: showCreateLink ? 'block' : 'none' }}
                  onClick={(event) => {
                    event.preventDefault();
                    setSignupEmail(loginEmail);
                    setModalView('create');
                  }}
                >
                  {messages.createAccountPrompt}
                </a>
              </div>
              <button type="submit">{messages.submitSignIn}</button>
              <div className="auth-links">
                <button type="button" id="showCreateAccount" className="link-button" onClick={() => setModalView('create')}>
                  {messages.createAccount}
                </button>
                <button type="button" id="showResetPassword" className="link-button" onClick={() => setModalView('reset')}>
                  {messages.forgotPassword}
                </button>
              </div>
              <div className="oauth-divider" aria-hidden="true">
                <span>{messages.oauthDivider}</span>
              </div>
              <button
                type="button"
                className="oauth-button oauth-button-google"
                onClick={() => void handleGoogleAuth()}
                disabled={oauthInFlight}
              >
                <svg className="oauth-button__icon" aria-hidden="true">
                  <use xlinkHref="/icons/svg-sprite.svg#google-mark" />
                </svg>
                <span>{oauthInFlight ? messages.googleInProgress : messages.continueWithGoogle}</span>
              </button>
            </form>
          </div>

          <div id="createAccountForm" className="auth-form-container" style={{ display: modalView === 'create' ? 'block' : 'none' }}>
            <h2>{messages.titleCreateAccount}</h2>
            <form id="signupForm" onSubmit={handleSignupSubmit}>
              <button
                type="button"
                className="oauth-button oauth-button-google"
                onClick={() => void handleGoogleAuth()}
                disabled={oauthInFlight}
              >
                <svg className="oauth-button__icon" aria-hidden="true">
                  <use xlinkHref="/icons/svg-sprite.svg#google-mark" />
                </svg>
                <span>{oauthInFlight ? messages.googleInProgress : messages.continueWithGoogleCreate}</span>
              </button>
              <div className="oauth-divider" aria-hidden="true">
                <span>{messages.oauthDivider}</span>
              </div>
              <input type="text" id="signupName" placeholder={messages.namePlaceholder} required value={signupName} onChange={(e) => setSignupName(e.target.value)} />
              <input type="email" id="signupEmail" placeholder={messages.emailPlaceholder} required value={signupEmail} onChange={(e) => setSignupEmail(e.target.value)} />
              <input type="password" id="signupPassword" placeholder={messages.passwordPlaceholder} required minLength={6} value={signupPassword} onChange={(e) => setSignupPassword(e.target.value)} />
              <div className="error" id="signupError">{signupError || oauthError}</div>
              <button type="submit">{messages.submitCreateAccount}</button>
              <div className="auth-links">
                <button type="button" id="backToLogin" className="link-button" onClick={() => setModalView('login')}>
                  {messages.backToLogin}
                </button>
              </div>
            </form>
          </div>

          <div id="resetPasswordForm" className="auth-form-container" style={{ display: modalView === 'reset' ? 'block' : 'none' }}>
            <h2>{messages.titleResetPassword}</h2>
            <form id="resetForm" onSubmit={handleResetSubmit}>
              <input type="email" id="resetEmail" placeholder={messages.emailPlaceholder} required value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} />
              <div className="error" id="resetError">{resetError}</div>
              <button type="submit">{messages.submitResetPassword}</button>
              <div className="auth-links">
                <button type="button" id="backToLoginFromReset" className="link-button" onClick={() => setModalView('login')}>
                  {messages.backToLogin}
                </button>
              </div>
            </form>
          </div>

          <div id="loggedInUserForm" className="auth-form-container" style={{ display: modalView === 'logged-in' ? 'block' : 'none' }}>
            <h2>{messages.alreadyLoggedIn}</h2>
            <div className="logged-in-user-info">
              <p><strong id="currentUserName">{currentDisplayName}</strong></p>
              <p id="currentUserEmail">{messages.asEmail}: {currentUser?.email ?? ''}</p>
            </div>
            <div className="auth-buttons">
              <button type="button" id="continueAsUser" className="primary-button" onClick={closeModal}>
                {messages.continueAsUser}
              </button>
              <button type="button" id="logoutAndSwitch" className="secondary-button" onClick={handleLogoutAndSwitch}>
                {messages.logoutAndSwitch}
              </button>
            </div>
          </div>

          <div id="accountCreatedForm" className="auth-form-container" style={{ display: modalView === 'success' ? 'block' : 'none' }}>
            <h2>{messages.accountCreated}</h2>
            <div className="logged-in-user-info">
              <p>{messages.accountCreatedDetails}</p>
              <p><strong id="newUserName">{successUser?.displayName ?? ''}</strong></p>
              <p id="newUserEmail">{successUser?.email ?? ''}</p>
              <p className="verification-notice">{messages.verificationEmailSent}</p>
              <p className="verification-notice">{messages.pleaseVerify}</p>
            </div>
            <button type="button" className="primary-button" id="successContinue" onClick={closeModal}>
              {messages.continueAsUser}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
