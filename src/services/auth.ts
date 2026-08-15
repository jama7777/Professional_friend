// User Authentication & Profile Management Service
// Stores individual candidate profiles, active session, and preferences locally

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  title: string; // e.g. "Senior AI Researcher", "Software Engineer"
  targetCompanies: string[]; // e.g. ["Meta", "Google", "OpenAI"]
  avatarUrl?: string;
  role: 'candidate' | 'recruiter' | 'investor' | 'guest';
  pin?: string; // Optional 4-digit PIN / password for privacy protection
  createdAt: number;
  totalInterviews?: number;
  avgScore?: number;
}

const STORAGE_USERS_KEY = 'pf_user_profiles';
const STORAGE_ACTIVE_USER_KEY = 'pf_active_user_id';
const STORAGE_SESSION_AUTH_KEY = 'pf_session_authenticated';

/**
 * Initializes profiles from local storage
 */
export function getAllProfiles(): UserProfile[] {
  try {
    const raw = localStorage.getItem(STORAGE_USERS_KEY);
    if (!raw) return [];
    const profiles = JSON.parse(raw);
    return Array.isArray(profiles) ? profiles : [];
  } catch (e) {
    console.error('[Auth] Failed to load profiles:', e);
    return [];
  }
}

/**
 * Check if the user is authenticated in the current browser session
 */
export function isSessionAuthenticated(): boolean {
  try {
    return sessionStorage.getItem(STORAGE_SESSION_AUTH_KEY) === 'true';
  } catch {
    return false;
  }
}

/**
 * Sets session authenticated state
 */
export function setSessionAuthenticated(isAuth: boolean): void {
  try {
    if (isAuth) {
      sessionStorage.setItem(STORAGE_SESSION_AUTH_KEY, 'true');
    } else {
      sessionStorage.removeItem(STORAGE_SESSION_AUTH_KEY);
    }
  } catch (e) {
    console.error('[Auth] Failed to set session auth:', e);
  }
}

/**
 * Retrieves the currently active user profile
 */
export function getCurrentUser(): UserProfile | null {
  const profiles = getAllProfiles();
  const activeId = localStorage.getItem(STORAGE_ACTIVE_USER_KEY);
  
  if (activeId) {
    const found = profiles.find(p => p.id === activeId);
    if (found) return found;
  }
  
  return null;
}

/**
 * Sets the active user profile and marks session as authenticated
 */
export function setCurrentUser(user: UserProfile): void {
  try {
    localStorage.setItem(STORAGE_ACTIVE_USER_KEY, user.id);
    setSessionAuthenticated(true);
    const profiles = getAllProfiles();
    const index = profiles.findIndex(p => p.id === user.id);
    if (index >= 0) {
      profiles[index] = user;
    } else {
      profiles.unshift(user);
    }
    localStorage.setItem(STORAGE_USERS_KEY, JSON.stringify(profiles));
  } catch (e) {
    console.error('[Auth] Failed to set active user:', e);
  }
}

/**
 * Logs out the active user and locks the session
 */
export function logoutUser(): void {
  try {
    sessionStorage.removeItem(STORAGE_SESSION_AUTH_KEY);
    localStorage.removeItem(STORAGE_ACTIVE_USER_KEY);
  } catch (e) {
    console.error('[Auth] Failed to logout:', e);
  }
}

/**
 * Verifies PIN and logs in
 */
export async function authenticateWithPin(profileId: string, enteredPin: string): Promise<boolean> {
  const profiles = getAllProfiles();
  const found = profiles.find(p => p.id === profileId);
  if (!found) return false;
  
  // If no PIN configured, allow direct login
  if (!found.pin) {
    setCurrentUser(found);
    return true;
  }

  if (found.pin === enteredPin.trim()) {
    setCurrentUser(found);
    return true;
  }

  return false;
}

/**
 * Creates and registers a new candidate profile
 */
export async function registerUser(
  name: string,
  email: string,
  title: string = 'Software Engineer',
  targetCompanies: string[] = ['Meta', 'Google'],
  role: 'candidate' | 'recruiter' | 'investor' | 'guest' = 'candidate',
  pin?: string
): Promise<UserProfile> {
  const newUser: UserProfile = {
    id: `user_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name: name.trim() || 'Candidate',
    email: email.trim().toLowerCase() || `candidate_${Date.now()}@user.local`,
    title: title.trim() || 'Technical Candidate',
    targetCompanies: targetCompanies.length > 0 ? targetCompanies : ['Meta', 'Google'],
    avatarUrl: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(name.trim())}&backgroundColor=06b6d4`,
    role,
    pin: pin?.trim() || undefined,
    createdAt: Date.now()
  };

  const profiles = getAllProfiles();
  profiles.unshift(newUser);
  localStorage.setItem(STORAGE_USERS_KEY, JSON.stringify(profiles));
  setCurrentUser(newUser);
  return newUser;
}

/**
 * Updates properties of the active user profile
 */
export async function updateUserProfile(updates: Partial<UserProfile>): Promise<UserProfile> {
  const current = getCurrentUser() || createGuestUser();
  const updated: UserProfile = {
    ...current,
    ...updates,
    id: current.id, // Preserve ID
  };
  setCurrentUser(updated);
  return updated;
}

/**
 * Switch to Guest mode
 */
export function createGuestUser(): UserProfile {
  const guest: UserProfile = {
    id: `guest_${Date.now()}`,
    name: 'Guest Candidate',
    email: 'guest@session.local',
    title: 'Guest Interviewee',
    targetCompanies: ['Meta', 'Google', 'Apple'],
    avatarUrl: 'https://api.dicebear.com/7.x/bottts/svg?seed=Guest&backgroundColor=64748b',
    role: 'guest',
    createdAt: Date.now()
  };
  setCurrentUser(guest);
  return guest;
}
