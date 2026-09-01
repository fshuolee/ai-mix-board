import { GoogleUserProfile } from '../types';

declare global {
  interface Window {
    google?: any;
  }
}

const STORAGE_KEY_TOKEN = 'ai_mix_board_gtoken';
const STORAGE_KEY_USER = 'ai_mix_board_guser';
const STORAGE_KEY_CLIENT_ID = 'ai_mix_board_client_id';

const SCOPES = [
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
      '此 Token 缺少 Google Drive 存取權限。若使用 gcloud，請在終端機執行：gcloud auth login --enable-gdrive-access'
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
 * Login using Google Identity Services (GIS) Token Client popup
 */
export function signInWithGooglePopup(customClientId?: string): Promise<GoogleUserProfile> {
  return new Promise((resolve, reject) => {
    const clientId = customClientId || getCustomClientId();

    if (!clientId) {
      reject(
        new Error(
          'Google Client ID 尚未設定。請在設定中輸入 GCP OAuth 2.0 Client ID，或在 .env 中設定 VITE_GOOGLE_CLIENT_ID。'
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
  try {
    const res = await fetch('/api/gcloud-token');
    const data = await res.json();
    if (!res.ok) {
      return { success: false, error: data.message || data.error || 'gcloud Token 無效' };
    }
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
