// Local IndexedDB Service for storing Interview Sessions, History, Transcripts & AI Reports

export interface InterviewQAPair {
  question: string;
  answer: string;
  timestamp: number;
  emotion?: string;
  sources?: Array<{ title: string; url: string }>;
}

export interface QuestionBreakdown {
  question: string;
  answerSummary: string;
  depthRating: 'Shallow' | 'Moderate' | 'Deep' | 'Expert';
  score: number; // 0-100
  critique: string;
  suggestedIdealAnswer: string;
}

export interface InterviewMistake {
  mistake: string;
  context: string;
  correction: string;
  severity: 'minor' | 'moderate' | 'critical';
}

export interface InterviewEvaluation {
  overallScore: number; // 0 - 100
  grade: string; // e.g. "A+", "A", "B-", "C"
  knowledgeDepthScore: number; // 0 - 100
  communicationScore: number; // 0 - 100
  practicalApplicationScore: number; // 0 - 100
  problemSolvingScore: number; // 0 - 100
  strengths: string[];
  drawbacks: string[];
  mistakes: InterviewMistake[];
  improvements: string[];
  detailedFeedback: string;
  biometricSummary: {
    confidenceLevel: string;
    emotionalStability: string;
    notes: string;
  };
  questionBreakdown: QuestionBreakdown[];
  recommendedResources: Array<{
    title: string;
    topic: string;
    linkQuery: string;
  }>;
  evaluatedAt: number;
}

export interface InterviewTranscriptMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  emotion?: string;
  groundingSources?: Array<{ title: string; url: string }>;
  searchQueries?: string[];
}

export interface InterviewSession {
  id: string;
  userId?: string;
  userName?: string;
  company: string;
  role: string;
  startedAt: number;
  endedAt?: number;
  durationSeconds: number;
  status: 'completed' | 'in-progress' | 'ended-early';
  transcript: InterviewTranscriptMessage[];
  qaPairs: InterviewQAPair[];
  evaluation?: InterviewEvaluation | null;
  dominantEmotions?: string[];
}

const DB_NAME = 'ProfessionalFriendDB';
const DB_VERSION = 2;
const STORE_NAME = 'interviews';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB is not supported in this environment'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('startedAt', 'startedAt', { unique: false });
        store.createIndex('company', 'company', { unique: false });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('userId', 'userId', { unique: false });
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

/**
 * Saves or updates an interview session in IndexedDB
 */
export async function saveInterviewSession(session: InterviewSession): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(session);

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (error) {
    console.error('[DB] Error saving interview session:', error);
    // Fallback to localStorage for basic persistence if IndexedDB fails
    try {
      const existing = JSON.parse(localStorage.getItem('pf_interview_sessions') || '[]');
      const index = existing.findIndex((s: InterviewSession) => s.id === session.id);
      if (index >= 0) {
        existing[index] = session;
      } else {
        existing.unshift(session);
      }
      localStorage.setItem('pf_interview_sessions', JSON.stringify(existing.slice(0, 50)));
    } catch (lsError) {
      console.error('[DB] LocalStorage fallback failed:', lsError);
    }
  }
}

/**
 * Retrieves an interview session by ID
 */
export async function getInterviewSession(id: string): Promise<InterviewSession | null> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(id);

      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  } catch (error) {
    console.error('[DB] Error reading session:', error);
    try {
      const existing = JSON.parse(localStorage.getItem('pf_interview_sessions') || '[]');
      return existing.find((s: InterviewSession) => s.id === id) || null;
    } catch {
      return null;
    }
  }
}

/**
 * Retrieves all stored interview sessions sorted newest first
 */
export async function getAllInterviewSessions(): Promise<InterviewSession[]> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();

      req.onsuccess = () => {
        const results: InterviewSession[] = req.result || [];
        results.sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
        resolve(results);
      };
      req.onerror = () => reject(req.error);
    });
  } catch (error) {
    console.error('[DB] Error getting all sessions:', error);
    try {
      const existing = JSON.parse(localStorage.getItem('pf_interview_sessions') || '[]');
      return existing.sort((a: any, b: any) => (b.startedAt || 0) - (a.startedAt || 0));
    } catch {
      return [];
    }
  }
}

/**
 * Retrieves interview sessions belonging to a specific user ID
 */
export async function getUserInterviewSessions(userId: string): Promise<InterviewSession[]> {
  const all = await getAllInterviewSessions();
  return all.filter(s => s.userId === userId || (!s.userId && userId === 'user_jamadagni'));
}

/**
 * Deletes an interview session by ID
 */
export async function deleteInterviewSession(id: string): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(id);

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (error) {
    console.error('[DB] Error deleting session:', error);
    try {
      const existing = JSON.parse(localStorage.getItem('pf_interview_sessions') || '[]');
      const filtered = existing.filter((s: InterviewSession) => s.id !== id);
      localStorage.setItem('pf_interview_sessions', JSON.stringify(filtered));
    } catch {}
  }
}

/**
 * Clears all interview sessions from the database
 */
export async function clearAllInterviewSessions(): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.clear();

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch (error) {
    console.error('[DB] Error clearing database:', error);
    try {
      localStorage.removeItem('pf_interview_sessions');
    } catch {}
  }
}
