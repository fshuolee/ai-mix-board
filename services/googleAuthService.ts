import { GoogleUserProfile } from '../types';

declare global {
  interface Window {
    google?: any;
  }
}

const STORAGE_KEY_TOKEN = 'ai_mix_board_gtoken';
const STORAGE_KEY_USER = 'ai_mix_board_guser';
const STORAGE_KEY_CLIENT_ID = 'ai_mix_board_client_id';
const STORAGE_KEY_PKCE_VERIFIER = 'ai_mix_board_pkce_verifier';
const STORAGE_KEY_PKCE_STATE = 'ai_mix_board_pkce_state';

export const SCOPES = [
  'https://www.googleapis.com/auth/drive',
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
].join(' ');

type AuthListener = (user: GoogleUserProfile | null) => void;
const listeners: Set<AuthListener> = new Set();

let currentUser: GoogleUserProfile | null = null;
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
let isRefreshingPromise: Promise<string | null> | null = null;

export const DEFAULT_CLIENT_ID = '244200756201-evcta7f45agj41ei70cnal8jr7ur1q17.apps.googleusercontent.com';

export function getCustomClientId(): string {
  return (
    localStorage.getItem(STORAGE_KEY_CLIENT_ID) ||
    (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID ||
    DEFAULT_CLIENT_ID
  );
}

export function setCustomClientId(clientId: string): void {
  if (clientId) {
    localStorage.setItem(STORAGE_KEY_CLIENT_ID, clientId.trim());
  } else {
    localStorage.removeItem(STORAGE_KEY_CLIENT_ID);
  }
}

/**
 * Schedule a proactive background refresh before the token expires
 */
function scheduleTokenRefresh(expiresAt: number) {
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
  const timeUntilExpiry = expiresAt - Date.now();
  if (timeUntilExpiry <= 0) return;

  // Refresh 5 minutes before expiry, or 20% before expiry if remaining time is small
  const leadTime = timeUntilExpiry > 6 * 60 * 1000
    ? 5 * 60 * 1000
    : Math.max(5000, Math.floor(timeUntilExpiry * 0.2));

  const delay = Math.max(3000, timeUntilExpiry - leadTime);

  refreshTimer = setTimeout(() => {
    refreshGoogleToken().catch(err => {
      console.warn('Proactive background token refresh failed:', err);
    });
  }, delay);
}

// Initialize user from storage on load - PRESERVE user info and never nuke storage on startup
try {
  const savedUser = localStorage.getItem(STORAGE_KEY_USER);
  const savedToken = localStorage.getItem(STORAGE_KEY_TOKEN);
  if (savedUser) {
    const parsed = JSON.parse(savedUser) as GoogleUserProfile;
    if (savedToken) {
      parsed.accessToken = savedToken;
    }
    if (parsed.expiresAt && parsed.expiresAt > Date.now()) {
      parsed.isExpired = false;
      currentUser = parsed;
      scheduleTokenRefresh(parsed.expiresAt);
    } else {
      // Token expired, but PRESERVE user session so app can silently refresh or 1-click reconnect
      parsed.isExpired = true;
      currentUser = parsed;
      // In local environment, attempt background silent refresh shortly after boot
      if (isLocalEnvironment()) {
        setTimeout(() => {
          refreshGoogleToken().catch(() => {});
        }, 500);
      }
    }
  }
} catch (e) {
  console.warn('Failed to parse cached user', e);
}

export function getCurrentUser(): GoogleUserProfile | null {
  if (currentUser) {
    if (currentUser.expiresAt <= Date.now() && !currentUser.isExpired) {
      currentUser = { ...currentUser, isExpired: true };
    }
  }
  return currentUser;
}

export function getAccessToken(): string | null {
  const user = getCurrentUser();
  return user ? user.accessToken : null;
}

/**
 * Ensures a valid access token is returned, attempting refresh if expired
 */
export async function getValidAccessToken(): Promise<string | null> {
  const user = getCurrentUser();
  if (!user) return null;
  if (user.expiresAt > Date.now() && !user.isExpired) {
    return user.accessToken;
  }
  const refreshed = await refreshGoogleToken();
  return refreshed || user.accessToken;
}

export function subscribeAuth(listener: AuthListener): () => void {
  listeners.add(listener);
  listener(getCurrentUser());
  return () => {
    listeners.delete(listener);
  };
}

function notifyListeners() {
  const user = getCurrentUser();
  listeners.forEach(fn => {
    try {
      fn(user);
    } catch (err) {
      console.error('Error in auth listener', err);
    }
  });
}

/**
 * Wait for Google Identity Services SDK (window.google.accounts.oauth2) to load
 */
export function waitForGIS(timeoutMs = 5000): Promise<boolean> {
  if (typeof window === 'undefined') return Promise.resolve(false);
  if (window.google?.accounts?.oauth2) return Promise.resolve(true);

  return new Promise(resolve => {
    const start = Date.now();
    const interval = setInterval(() => {
      if (window.google?.accounts?.oauth2) {
        clearInterval(interval);
        resolve(true);
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(interval);
        resolve(false);
      }
    }, 100);
  });
}

/**
 * Helper to generate random string for PKCE
 */
function generateRandomString(length = 64): string {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  const values = new Uint8Array(length);
  crypto.getRandomValues(values);
  return Array.from(values, x => charset[x % charset.length]).join('');
}

/**
 * Helper to calculate SHA-256 base64url challenge for PKCE
 */
async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Validate token scopes and fetch user info
 */
export async function fetchGoogleProfile(
  accessToken: string,
  expiresInSeconds = 3600,
  authMethod?: 'gis' | 'gcloud' | 'oauth' | 'manual'
): Promise<GoogleUserProfile> {
  // 1. Verify token scopes via tokeninfo
  const tokenInfoRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?access_token=${accessToken}`);
  if (!tokenInfoRes.ok) {
    throw new Error('存取 Token 無效或已過期，請重新授權登入。');
  }

  const tokenInfo = await tokenInfoRes.json();
  const scopes = (tokenInfo.scope || '').split(' ');
  const hasDrive = scopes.some((s: string) => s.includes('drive'));

  if (!hasDrive) {
    throw new Error(
      '此 Token 缺少 Google Drive 存取權限。請確認授權時已勾選 Google 雲端硬碟存取權限。'
    );
  }

  // 2. Fetch User Profile
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok) {
    throw new Error(`無法取得 Google 使用者資訊: ${res.statusText}`);
  }

  const data = await res.json();
  const actualExpiresIn = Number(tokenInfo.expires_in) || expiresInSeconds;
  const bufferSeconds = Math.min(60, Math.max(0, Math.floor(actualExpiresIn * 0.1)));
  const validSeconds = Math.max(10, actualExpiresIn - bufferSeconds);
  const expiresAt = Date.now() + validSeconds * 1000;

  const profile: GoogleUserProfile = {
    email: data.email || tokenInfo.email || 'user@gmail.com',
    name: data.name || data.email || tokenInfo.email || 'Google User',
    picture: data.picture,
    accessToken,
    expiresAt,
    isExpired: false,
    authMethod: authMethod || currentUser?.authMethod || (isLocalEnvironment() ? 'gcloud' : 'gis'),
  };

  currentUser = profile;
  localStorage.setItem(STORAGE_KEY_TOKEN, accessToken);
  localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(profile));
  scheduleTokenRefresh(expiresAt);
  notifyListeners();

  return profile;
}

/**
 * Request GIS Token silently (WITHOUT opening a popup window)
 * Uses prompt: 'none'. If user interaction is required, GIS triggers error_callback immediately.
 */
function requestGISTokenSilent(
  clientId: string,
  hintEmail?: string
): Promise<{ accessToken: string; expiresIn: number }> {
  return new Promise((resolve, reject) => {
    if (!window.google?.accounts?.oauth2) {
      reject(new Error('Google Identity Services SDK 尚未就緒'));
      return;
    }

    let isDone = false;
    const timer = setTimeout(() => {
      if (!isDone) {
        isDone = true;
        reject(new Error('GIS 背景靜默重新整理逾時'));
      }
    }, 4000);

    try {
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPES,
        hint: hintEmail,
        callback: (response: any) => {
          if (isDone) return;
          isDone = true;
          clearTimeout(timer);
          if (response.error) {
            reject(new Error(response.error_description || response.error));
            return;
          }
          const expiresIn = Number(response.expires_in) || 3600;
          resolve({ accessToken: response.access_token, expiresIn });
        },
        error_callback: (err: any) => {
          if (isDone) return;
          isDone = true;
          clearTimeout(timer);
          reject(new Error(err?.message || 'GIS 靜默重新整理失敗'));
        },
      });

      // prompt: 'none' NEVER opens an interactive popup window.
      client.requestAccessToken({
        prompt: 'none',
        hint: hintEmail,
      });
    } catch (e) {
      if (!isDone) {
        isDone = true;
        clearTimeout(timer);
        reject(e);
      }
    }
  });
}

/**
 * Refresh Google Access Token in the background.
 * Deduplicates concurrent calls and NEVER opens an interactive popup window.
 */
export async function refreshGoogleToken(): Promise<string | null> {
  // If an interactive sign-in popup is already in progress, do not interfere
  if (isAuthPopupInProgress()) {
    return null;
  }

  if (isRefreshingPromise) {
    return isRefreshingPromise;
  }

  isRefreshingPromise = (async () => {
    try {
      // 1. If in local environment, attempt gcloud auto-token first
      if (isLocalEnvironment()) {
        try {
          const gcloudRes = await tryFetchLocalGcloudToken();
          if (gcloudRes.success && gcloudRes.profile?.accessToken) {
            return gcloudRes.profile.accessToken;
          }
        } catch (e) {
          console.warn('gcloud local refresh failed:', e);
        }
      }

      // 2. Try GIS silent refresh if clientId & user are available
      const user = currentUser;
      const clientId = getCustomClientId();
      if (clientId && user?.email) {
        const gisReady = await waitForGIS(2000);
        if (gisReady && window.google?.accounts?.oauth2) {
          try {
            const res = await requestGISTokenSilent(clientId, user.email);
            if (res.accessToken) {
              const updatedProfile = await fetchGoogleProfile(res.accessToken, res.expiresIn, 'gis');
              return updatedProfile.accessToken;
            }
          } catch (gisErr) {
            // Silent refresh requires user interaction - completely normal, do not popup
          }
        }
      }

      // 3. If refresh could not complete silently, mark user as expired but preserve their identity
      if (currentUser && !currentUser.isExpired) {
        currentUser = { ...currentUser, isExpired: true };
        try {
          localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(currentUser));
        } catch {}
        notifyListeners();
      }
      return null;
    } finally {
      isRefreshingPromise = null;
    }
  })();

  return isRefreshingPromise;
}

/**
 * 1. OAuth 2.0 PKCE Authorization Code Flow
 * Initiates redirect to Google OAuth with PKCE parameters
 */
export async function initiateOAuthPKCE(customClientId?: string): Promise<void> {
  const clientId = customClientId || getCustomClientId();
  if (!clientId) {
    throw new Error('請先輸入 Google OAuth 2.0 Web Client ID 才能發起登入。');
  }

  const verifier = generateRandomString(64);
  const challenge = await generateCodeChallenge(verifier);
  const state = generateRandomString(32);

  sessionStorage.setItem(STORAGE_KEY_PKCE_VERIFIER, verifier);
  sessionStorage.setItem(STORAGE_KEY_PKCE_STATE, state);

  const redirectUri = window.location.origin + window.location.pathname;

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', SCOPES);
  authUrl.searchParams.set('code_challenge', challenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('prompt', 'consent');
  authUrl.searchParams.set('access_type', 'online');

  window.location.href = authUrl.toString();
}

/**
 * 2. OAuth 2.0 Direct Implicit Redirect Flow (Static SPA fallback)
 * Redirects to Google and returns token in URL hash (#access_token=...)
 */
export function initiateOAuthImplicit(customClientId?: string): void {
  const clientId = customClientId || getCustomClientId();
  if (!clientId) {
    throw new Error('請先輸入 Google OAuth 2.0 Web Client ID 才能發起登入。');
  }

  const state = generateRandomString(32);
  sessionStorage.setItem(STORAGE_KEY_PKCE_STATE, state);

  const redirectUri = window.location.origin + window.location.pathname;

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('response_type', 'token');
  authUrl.searchParams.set('scope', SCOPES);
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('prompt', 'consent');

  window.location.href = authUrl.toString();
}

/**
 * 3. Handle OAuth Redirect Callback (both PKCE code and Implicit hash)
 * Call this on application startup
 */
export async function handleOAuthCallback(): Promise<{ success: boolean; profile?: GoogleUserProfile; error?: string }> {
  if (typeof window === 'undefined') return { success: false };

  // Check URL hash (#access_token=...&expires_in=...)
  if (window.location.hash && window.location.hash.includes('access_token')) {
    try {
      const hashParams = new URLSearchParams(window.location.hash.substring(1));
      const accessToken = hashParams.get('access_token');
      const expiresIn = Number(hashParams.get('expires_in')) || 3600;

      if (accessToken) {
        // Clean URL hash without reloading
        window.history.replaceState({}, document.title, window.location.origin + window.location.pathname + window.location.search);
        const profile = await fetchGoogleProfile(accessToken, expiresIn, 'oauth');
        return { success: true, profile };
      }
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  // Check URL query search (?code=...&state=...)
  const queryParams = new URLSearchParams(window.location.search);
  const code = queryParams.get('code');
  const error = queryParams.get('error');

  if (error) {
    window.history.replaceState({}, document.title, window.location.origin + window.location.pathname);
    return { success: false, error: `Google 授權錯誤: ${error}` };
  }

  if (code) {
    const savedVerifier = sessionStorage.getItem(STORAGE_KEY_PKCE_VERIFIER);
    const savedState = sessionStorage.getItem(STORAGE_KEY_PKCE_STATE);
    const state = queryParams.get('state');

    sessionStorage.removeItem(STORAGE_KEY_PKCE_VERIFIER);
    sessionStorage.removeItem(STORAGE_KEY_PKCE_STATE);

    window.history.replaceState({}, document.title, window.location.origin + window.location.pathname);

    if (savedState && state && savedState !== state) {
      return { success: false, error: 'OAuth State 驗證失敗，可能存在 CSRF 風險。' };
    }

    const clientId = getCustomClientId();
    if (!clientId) {
      return { success: false, error: '缺少 Client ID，無法完成 Token 交換。' };
    }

    try {
      const redirectUri = window.location.origin + window.location.pathname;
      const body = new URLSearchParams({
        client_id: clientId,
        code,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        ...(savedVerifier ? { code_verifier: savedVerifier } : {}),
      });

      const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
      });

      const tokenData = await tokenRes.json();
      if (!tokenRes.ok || !tokenData.access_token) {
        return {
          success: false,
          error: tokenData.error_description || tokenData.error || 'Token 交換失敗',
        };
      }

      const profile = await fetchGoogleProfile(tokenData.access_token, Number(tokenData.expires_in) || 3600, 'oauth');
      return { success: true, profile };
    } catch (err: any) {
      return { success: false, error: err.message || 'Token 交換請求失敗' };
    }
  }

  return { success: false };
}

let activePopupPromise: Promise<GoogleUserProfile> | null = null;
let isAuthPopupActive = false;

export function isAuthPopupInProgress(): boolean {
  return isAuthPopupActive || activePopupPromise !== null;
}

/**
 * 4. Login using Google Identity Services (GIS) Token Client popup
 * Guaranteed single popup: deduplicates concurrent calls and prevents secondary popups.
 */
export function signInWithGooglePopup(customClientId?: string, hintEmail?: string): Promise<GoogleUserProfile> {
  // If a popup is ALREADY active, reuse the existing promise to prevent multiple windows
  if (activePopupPromise) {
    return activePopupPromise;
  }

  const clientId = customClientId || getCustomClientId();

  if (!clientId) {
    return Promise.reject(
      new Error(
        'Google Client ID 尚未設定。請在設定中輸入 GCP OAuth 2.0 Web Client ID。'
      )
    );
  }

  if (typeof window === 'undefined' || !window.google?.accounts?.oauth2) {
    return Promise.reject(new Error('Google Identity Services SDK 載入中，請稍候重試。'));
  }

  isAuthPopupActive = true;

  activePopupPromise = new Promise((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      activePopupPromise = null;
      // Retain popup active flag for 1.5s so window focus events right after popup close don't trigger secondary auth checks
      setTimeout(() => {
        isAuthPopupActive = false;
      }, 1500);
    };

    try {
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPES,
        hint: hintEmail,
        callback: async (response: any) => {
          if (settled) return;
          settled = true;
          cleanup();

          if (response.error) {
            console.error('Google Auth Error:', response);
            reject(new Error(response.error_description || response.error));
            return;
          }

          try {
            const expiresIn = Number(response.expires_in) || 3600;
            const profile = await fetchGoogleProfile(response.access_token, expiresIn, 'gis');
            resolve(profile);
          } catch (fetchErr) {
            reject(fetchErr);
          }
        },
        error_callback: (err: any) => {
          if (settled) return;
          settled = true;
          cleanup();
          reject(new Error(err?.message || 'Google 登入失敗或已取消'));
        },
      });

      // If user provided hintEmail, skip account chooser
      client.requestAccessToken({
        prompt: hintEmail ? '' : 'select_account',
        hint: hintEmail,
      });
    } catch (err: any) {
      if (!settled) {
        settled = true;
        cleanup();
        reject(err);
      }
    }
  });

  return activePopupPromise;
}

export function isLocalEnvironment(): boolean {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1' || host.endsWith('.local');
}

/**
 * Set token manually
 */
export async function setManualAccessToken(token: string, expiresIn = 3600): Promise<GoogleUserProfile> {
  const profile = await fetchGoogleProfile(token.trim(), expiresIn, 'manual');
  return profile;
}

/**
 * Attempt to auto-fetch token from local dev server (if gcloud is configured with drive access)
 */
export async function tryFetchLocalGcloudToken(): Promise<{ success: boolean; profile?: GoogleUserProfile; error?: string }> {
  if (!isLocalEnvironment()) {
    return { success: false, error: 'NOT_LOCAL' };
  }
  try {
    const res = await fetch('/api/gcloud-token');
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      return { success: false, error: data.message || data.error || 'gcloud Token 無效' };
    }
    const data = await res.json();
    if (data.token) {
      const profile = await fetchGoogleProfile(data.token, data.expiresIn || 3600, 'gcloud');
      return { success: true, profile };
    }
  } catch (e: any) {
    return { success: false, error: e.message };
  }
  return { success: false, error: '未取得 Token' };
}

export function signOutGoogle(): void {
  if (refreshTimer) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
  currentUser = null;
  localStorage.removeItem(STORAGE_KEY_TOKEN);
  localStorage.removeItem(STORAGE_KEY_USER);
  notifyListeners();
}
