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

// Initialize user from storage on load
try {
  const savedUser = localStorage.getItem(STORAGE_KEY_USER);
  const savedToken = localStorage.getItem(STORAGE_KEY_TOKEN);
  if (savedUser && savedToken) {
    const parsed = JSON.parse(savedUser);
    if (parsed.expiresAt > Date.now()) {
      currentUser = parsed;
    } else {
      localStorage.removeItem(STORAGE_KEY_USER);
      localStorage.removeItem(STORAGE_KEY_TOKEN);
    }
  }
} catch (e) {
  console.warn('Failed to parse cached user', e);
}

export function getCustomClientId(): string {
  return (
    localStorage.getItem(STORAGE_KEY_CLIENT_ID) ||
    (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID ||
    ''
  );
}

export function setCustomClientId(clientId: string): void {
  if (clientId) {
    localStorage.setItem(STORAGE_KEY_CLIENT_ID, clientId.trim());
  } else {
    localStorage.removeItem(STORAGE_KEY_CLIENT_ID);
  }
}

export function getCurrentUser(): GoogleUserProfile | null {
  if (currentUser && currentUser.expiresAt <= Date.now()) {
    currentUser = null;
    localStorage.removeItem(STORAGE_KEY_USER);
    localStorage.removeItem(STORAGE_KEY_TOKEN);
    notifyListeners();
  }
  return currentUser;
}

export function getAccessToken(): string | null {
  const user = getCurrentUser();
  return user ? user.accessToken : null;
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
export async function fetchGoogleProfile(accessToken: string, expiresInSeconds = 3600): Promise<GoogleUserProfile> {
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
  const expiresAt = Date.now() + (expiresInSeconds - 60) * 1000;

  const profile: GoogleUserProfile = {
    email: data.email || tokenInfo.email || 'user@gmail.com',
    name: data.name || data.email || tokenInfo.email || 'Google User',
    picture: data.picture,
    accessToken,
    expiresAt,
  };

  currentUser = profile;
  localStorage.setItem(STORAGE_KEY_TOKEN, accessToken);
  localStorage.setItem(STORAGE_KEY_USER, JSON.stringify(profile));
  notifyListeners();

  return profile;
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
        const profile = await fetchGoogleProfile(accessToken, expiresIn);
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
    // Clean query
    window.history.replaceState({}, document.title, window.location.origin + window.location.pathname);
    return { success: false, error: `Google 授權錯誤: ${error}` };
  }

  if (code) {
    const savedVerifier = sessionStorage.getItem(STORAGE_KEY_PKCE_VERIFIER);
    const savedState = sessionStorage.getItem(STORAGE_KEY_PKCE_STATE);
    const state = queryParams.get('state');

    sessionStorage.removeItem(STORAGE_KEY_PKCE_VERIFIER);
    sessionStorage.removeItem(STORAGE_KEY_PKCE_STATE);

    // Clean URL
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

      const profile = await fetchGoogleProfile(tokenData.access_token, Number(tokenData.expires_in) || 3600);
      return { success: true, profile };
    } catch (err: any) {
      return { success: false, error: err.message || 'Token 交換請求失敗' };
    }
  }

  return { success: false };
}

/**
 * 4. Login using Google Identity Services (GIS) Token Client popup
 */
export function signInWithGooglePopup(customClientId?: string): Promise<GoogleUserProfile> {
  return new Promise((resolve, reject) => {
    const clientId = customClientId || getCustomClientId();

    if (!clientId) {
      reject(
        new Error(
          'Google Client ID 尚未設定。請在設定中輸入 GCP OAuth 2.0 Web Client ID。'
        )
      );
      return;
    }

    if (typeof window === 'undefined' || !window.google?.accounts?.oauth2) {
      reject(new Error('Google Identity Services SDK 載入中，請稍候重試。'));
      return;
    }

    try {
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPES,
        callback: async (response: any) => {
          if (response.error) {
            console.error('Google Auth Error:', response);
            reject(new Error(response.error_description || response.error));
            return;
          }

          try {
            const expiresIn = Number(response.expires_in) || 3600;
            const profile = await fetchGoogleProfile(response.access_token, expiresIn);
            resolve(profile);
          } catch (fetchErr) {
            reject(fetchErr);
          }
        },
      });

      client.requestAccessToken({ prompt: 'consent' });
    } catch (err: any) {
      reject(err);
    }
  });
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
  const profile = await fetchGoogleProfile(token.trim(), expiresIn);
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
      const profile = await fetchGoogleProfile(data.token, data.expiresIn || 3600);
      return { success: true, profile };
    }
  } catch (e: any) {
    return { success: false, error: e.message };
  }
  return { success: false, error: '未取得 Token' };
}

export function signOutGoogle(): void {
  currentUser = null;
  localStorage.removeItem(STORAGE_KEY_TOKEN);
  localStorage.removeItem(STORAGE_KEY_USER);
  notifyListeners();
}
