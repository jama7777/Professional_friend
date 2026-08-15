// ─────────────────────────────────────────────────────────────────────────────
// User Authentication & Profile Management — Secure Rewrite
//
// Design:
//  • Each account is keyed by EMAIL — unique, lowercase-normalized
//  • Passwords hashed with PBKDF2-SHA256 (Web Crypto API) — never stored plain
//  • Active session stored in sessionStorage (tab-scoped, cleared on tab close)
//  • Session token = random 32-byte hex, stored alongside the logged-in userId
//  • `getAllProfiles()` ONLY returns the currently logged-in user's profile
//    (not a list of every stored user — that was the leak)
//  • "Switch account" requires explicit logout first
// ─────────────────────────────────────────────────────────────────────────────

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  title: string;
  targetCompanies: string[];
  avatarUrl?: string;
  role: 'candidate' | 'recruiter' | 'investor' | 'guest';
  createdAt: number;
  totalInterviews?: number;
  avgScore?: number;
}

// ── Internal stored shape (never exported) ────────────────────────────────────
interface StoredUser {
  profile: UserProfile;
  passwordHash: string; // PBKDF2-SHA256 hex
  salt: string;         // hex salt used for hashing
}

// ── Storage keys ──────────────────────────────────────────────────────────────
// Each user's record is stored under their own key: `pf_u_<emailHash>`
// This means User A cannot accidentally read User B's stored object.
const SESSION_USER_ID_KEY  = 'pf_session_uid';     // sessionStorage — cleared on tab close
const SESSION_TOKEN_KEY    = 'pf_session_token';   // sessionStorage — random token
const LS_TOKEN_PREFIX      = 'pf_tok_';            // localStorage  — per-user valid token

// ── Crypto helpers ────────────────────────────────────────────────────────────

/** Generate a random hex string of `byteLen` bytes */
function randomHex(byteLen = 16): string {
  const arr = new Uint8Array(byteLen);
  crypto.getRandomValues(arr);
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Deterministic email-based localStorage key */
function userKey(email: string): string {
  // Simple encoding — email is already unique; we just namespace it
  const normalized = email.toLowerCase().trim();
  const encoded = btoa(normalized).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  return `pf_u_${encoded}`;
}

/**
 * Hash a password with PBKDF2-SHA256.
 * Returns { hash: hex, salt: hex }
 */
async function hashPassword(password: string, saltHex?: string): Promise<{ hash: string; salt: string }> {
  const salt = saltHex
    ? Uint8Array.from(saltHex.match(/.{2}/g)!.map(b => parseInt(b, 16)))
    : crypto.getRandomValues(new Uint8Array(16));

  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100_000 },
    keyMaterial,
    256
  );

  const hash = Array.from(new Uint8Array(bits)).map(b => b.toString(16).padStart(2, '0')).join('');
  const saltOut = Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('');
  return { hash, salt: saltOut };
}

/** Constant-time string comparison to prevent timing attacks */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

// ── Storage read/write ────────────────────────────────────────────────────────

function loadStoredUser(email: string): StoredUser | null {
  try {
    const raw = localStorage.getItem(userKey(email));
    if (!raw) return null;
    return JSON.parse(raw) as StoredUser;
  } catch {
    return null;
  }
}

function saveStoredUser(data: StoredUser): void {
  localStorage.setItem(userKey(data.profile.email), JSON.stringify(data));
}

// ── Session management ────────────────────────────────────────────────────────

/** Returns the profile of the currently authenticated user, or null */
export function getCurrentUser(): UserProfile | null {
  try {
    const uid   = sessionStorage.getItem(SESSION_USER_ID_KEY);
    const token = sessionStorage.getItem(SESSION_TOKEN_KEY);
    if (!uid || !token) return null;

    // Verify the session token matches what we stored for this user
    const storedToken = localStorage.getItem(`${LS_TOKEN_PREFIX}${uid}`);
    if (!storedToken || !safeEqual(token, storedToken)) return null;

    // Load the actual profile
    // uid is the email (stored as the profile's email field)
    const stored = loadStoredUser(uid);
    return stored?.profile ?? null;
  } catch {
    return null;
  }
}

/** True if a valid session exists for the current tab */
export function isSessionAuthenticated(): boolean {
  return getCurrentUser() !== null;
}

/** Internal — set session after successful authentication */
function _startSession(profile: UserProfile): void {
  const token = randomHex(32);
  sessionStorage.setItem(SESSION_USER_ID_KEY, profile.email);
  sessionStorage.setItem(SESSION_TOKEN_KEY, token);
  localStorage.setItem(`${LS_TOKEN_PREFIX}${profile.email}`, token);
}

/** Logout: clear session token everywhere */
export function logoutUser(): void {
  try {
    const uid = sessionStorage.getItem(SESSION_USER_ID_KEY);
    if (uid) localStorage.removeItem(`${LS_TOKEN_PREFIX}${uid}`);
    sessionStorage.removeItem(SESSION_USER_ID_KEY);
    sessionStorage.removeItem(SESSION_TOKEN_KEY);
  } catch (e) {
    console.error('[Auth] Logout error:', e);
  }
}

// ── Registration ──────────────────────────────────────────────────────────────

/**
 * Register a new user with email + password.
 * Throws if email is already taken.
 */
export async function registerUser(
  name: string,
  email: string,
  password: string,
  title: string = 'Software Engineer',
  targetCompanies: string[] = ['Meta', 'Google'],
  role: 'candidate' | 'recruiter' | 'investor' | 'guest' = 'candidate'
): Promise<UserProfile> {
  const normalizedEmail = email.trim().toLowerCase();

  if (!normalizedEmail || !password || password.length < 6) {
    throw new Error('Email and a password of at least 6 characters are required.');
  }

  // Block duplicate emails
  if (loadStoredUser(normalizedEmail)) {
    throw new Error('An account with this email already exists. Please sign in.');
  }

  const { hash, salt } = await hashPassword(password);

  const profile: UserProfile = {
    id: `u_${randomHex(8)}`,
    name: name.trim() || 'Candidate',
    email: normalizedEmail,
    title: title.trim() || 'Technical Candidate',
    targetCompanies: targetCompanies.length > 0 ? targetCompanies : ['Meta', 'Google'],
    avatarUrl: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(name.trim())}&backgroundColor=06b6d4`,
    role,
    createdAt: Date.now(),
  };

  saveStoredUser({ profile, passwordHash: hash, salt });
  _startSession(profile);
  return profile;
}

// ── Login ─────────────────────────────────────────────────────────────────────

/**
 * Authenticate with email + password.
 * Returns the profile on success, throws on failure.
 */
export async function loginUser(email: string, password: string): Promise<UserProfile> {
  const normalizedEmail = email.trim().toLowerCase();
  const stored = loadStoredUser(normalizedEmail);

  if (!stored) {
    // Same error message for "not found" and "wrong password" — prevent enumeration
    throw new Error('Invalid email or password.');
  }

  const { hash } = await hashPassword(password, stored.salt);
  if (!safeEqual(hash, stored.passwordHash)) {
    throw new Error('Invalid email or password.');
  }

  _startSession(stored.profile);
  return stored.profile;
}

// ── Profile update ────────────────────────────────────────────────────────────

/**
 * Update fields of the currently authenticated user's profile.
 * Cannot change email or id.
 */
export async function updateUserProfile(updates: Partial<UserProfile>): Promise<UserProfile> {
  const current = getCurrentUser();
  if (!current) throw new Error('Not authenticated.');

  const stored = loadStoredUser(current.email);
  if (!stored) throw new Error('Profile not found.');

  const updated: UserProfile = {
    ...stored.profile,
    ...updates,
    id: stored.profile.id,       // immutable
    email: stored.profile.email, // immutable
  };

  saveStoredUser({ ...stored, profile: updated });
  return updated;
}

// ── Guest mode ────────────────────────────────────────────────────────────────

/**
 * Create a temporary guest session.
 * Guest profiles are stored in sessionStorage only — gone when tab closes.
 */
export function createGuestUser(): UserProfile {
  const guest: UserProfile = {
    id: `guest_${randomHex(4)}`,
    name: 'Guest Candidate',
    email: `guest_${randomHex(4)}@session.local`,
    title: 'Guest Interviewee',
    targetCompanies: ['Meta', 'Google', 'Apple'],
    avatarUrl: 'https://api.dicebear.com/7.x/bottts/svg?seed=Guest&backgroundColor=64748b',
    role: 'guest',
    createdAt: Date.now(),
  };
  // For guests, only put in sessionStorage — no localStorage persistence
  const token = randomHex(32);
  sessionStorage.setItem(SESSION_USER_ID_KEY, guest.email);
  sessionStorage.setItem(SESSION_TOKEN_KEY, token);
  sessionStorage.setItem(`pf_guest_profile`, JSON.stringify(guest));
  return guest;
}

// ── Password change ───────────────────────────────────────────────────────────

export async function changePassword(
  currentPassword: string,
  newPassword: string
): Promise<void> {
  const current = getCurrentUser();
  if (!current) throw new Error('Not authenticated.');
  if (newPassword.length < 6) throw new Error('New password must be at least 6 characters.');

  const stored = loadStoredUser(current.email);
  if (!stored) throw new Error('Profile not found.');

  // Verify current password first
  const { hash: currentHash } = await hashPassword(currentPassword, stored.salt);
  if (!safeEqual(currentHash, stored.passwordHash)) {
    throw new Error('Current password is incorrect.');
  }

  const { hash: newHash, salt: newSalt } = await hashPassword(newPassword);
  saveStoredUser({ ...stored, passwordHash: newHash, salt: newSalt });
}

// ── Compatibility shim (kept for any code that calls setCurrentUser directly) ─
// Deprecated — will be a no-op outside of internal use. Log a warning.
export function setCurrentUser(_user: UserProfile): void {
  console.warn('[Auth] setCurrentUser() is deprecated. Use loginUser() or registerUser().');
}

export function setSessionAuthenticated(_isAuth: boolean): void {
  console.warn('[Auth] setSessionAuthenticated() is deprecated.');
}

// getAllProfiles() is intentionally removed — it was the data leak.
// Each user can only access their own profile via getCurrentUser().
