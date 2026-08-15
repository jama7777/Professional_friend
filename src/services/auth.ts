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
  createdAt: number;
  totalInterviews?: number;
  avgScore?: number;
}

const STORAGE_USERS_KEY = 'pf_user_profiles';
const STORAGE_ACTIVE_USER_KEY = 'pf_active_user_id';

const DEFAULT_PROFILES: UserProfile[] = [
  {
    id: 'user_jamadagni',
    name: 'Jamadagni',
    email: 'jamadagni@professionalfriend.ai',
    title: 'AI Researcher & Founder',
    targetCompanies: ['OpenAI', 'Google', 'Meta', 'Anthropic'],
    avatarUrl: 'https://api.dicebear.com/7.x/bottts/svg?seed=Jamadagni&backgroundColor=0284c7',
    role: 'candidate',
    createdAt: Date.now() - 86400000 * 7
  },
  {
    id: 'user_alex',
    name: 'Alex Chen',
    email: 'alex.chen@tech.io',
    title: 'Senior Distributed Systems SWE',
    targetCompanies: ['Meta', 'Netflix', 'Amazon', 'Apple'],
    avatarUrl: 'https://api.dicebear.com/7.x/bottts/svg?seed=AlexChen&backgroundColor=7c3aed',
    role: 'candidate',
    createdAt: Date.now() - 86400000 * 3
  }
];

/**
 * Initializes profiles from storage or pre-populates default demo profiles
 */
export function getAllProfiles(): UserProfile[] {
  try {
    const raw = localStorage.getItem(STORAGE_USERS_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_USERS_KEY, JSON.stringify(DEFAULT_PROFILES));
      return DEFAULT_PROFILES;
    }
    const profiles = JSON.parse(raw);
    return Array.isArray(profiles) && profiles.length > 0 ? profiles : DEFAULT_PROFILES;
  } catch (e) {
    console.error('[Auth] Failed to load profiles:', e);
    return DEFAULT_PROFILES;
  }
}

/**
 * Retrieves the currently active user profile
 */
export function getCurrentUser(): UserProfile {
  const profiles = getAllProfiles();
  const activeId = localStorage.getItem(STORAGE_ACTIVE_USER_KEY);
  
  if (activeId) {
    const found = profiles.find(p => p.id === activeId);
    if (found) return found;
  }
  
  // Default to first profile if none explicitly set
  const defaultUser = profiles[0] || DEFAULT_PROFILES[0];
  setCurrentUser(defaultUser);
  return defaultUser;
}

/**
 * Sets the active user profile
 */
export function setCurrentUser(user: UserProfile): void {
  try {
    localStorage.setItem(STORAGE_ACTIVE_USER_KEY, user.id);
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
 * Creates and registers a new candidate profile
 */
export async function registerUser(
  name: string,
  email: string,
  title: string = 'Software Engineer',
  targetCompanies: string[] = ['Meta', 'Google'],
  role: 'candidate' | 'recruiter' | 'investor' | 'guest' = 'candidate'
): Promise<UserProfile> {
  const newUser: UserProfile = {
    id: `user_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name: name.trim() || 'Candidate',
    email: email.trim().toLowerCase() || `candidate_${Date.now()}@user.local`,
    title: title.trim() || 'Technical Candidate',
    targetCompanies: targetCompanies.length > 0 ? targetCompanies : ['Meta', 'Google'],
    avatarUrl: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(name.trim())}&backgroundColor=06b6d4`,
    role,
    createdAt: Date.now()
  };

  const profiles = getAllProfiles();
  profiles.unshift(newUser);
  localStorage.setItem(STORAGE_USERS_KEY, JSON.stringify(profiles));
  setCurrentUser(newUser);
  return newUser;
}

/**
 * Logs in by existing email or switches profile
 */
export async function loginUser(email: string): Promise<UserProfile | null> {
  const profiles = getAllProfiles();
  const found = profiles.find(p => p.email.toLowerCase() === email.trim().toLowerCase());
  if (found) {
    setCurrentUser(found);
    return found;
  }
  return null;
}

/**
 * Updates properties of the active user profile
 */
export async function updateUserProfile(updates: Partial<UserProfile>): Promise<UserProfile> {
  const current = getCurrentUser();
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
