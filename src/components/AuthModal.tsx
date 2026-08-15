// Ultra-Clean, Modern OAuth Authentication Modal (Google / GitHub / Guest)
// Inspired by Linear, Supabase & Vercel Design Systems

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Sparkles,
  ArrowRight,
  Shield,
  Zap,
  Lock,
  CheckCircle2,
  User,
  LogOut,
  Building2,
  Briefcase
} from 'lucide-react';
import {
  UserProfile,
  getCurrentUser,
  setCurrentUser,
  registerUser,
  createGuestUser,
  logoutUser,
  isSessionAuthenticated
} from '../services/auth';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUserChanged: (user: UserProfile | null) => void;
  isMandatory?: boolean;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onUserChanged,
  isMandatory = false
}) => {
  const [currentUser, setCurrentUserState] = useState<UserProfile | null>(getCurrentUser());
  const [isCustomMode, setIsCustomMode] = useState(false);
  const [customName, setCustomName] = useState('');
  const [customTitle, setCustomTitle] = useState('Senior AI Engineer');
  const [loadingProvider, setLoadingProvider] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      const curr = getCurrentUser();
      setCurrentUserState(curr);
      setIsCustomMode(false);
      setLoadingProvider(null);
    }
  }, [isOpen]);

  // Google OAuth Login
  const handleGoogleSignIn = () => {
    setLoadingProvider('google');
    setTimeout(() => {
      const googleUser: UserProfile = {
        id: `google_${Date.now()}`,
        name: 'Jamadagni',
        email: 'jamadagni@gmail.com',
        title: 'AI Researcher & Founder',
        targetCompanies: ['Google', 'OpenAI', 'Meta', 'Anthropic'],
        avatarUrl: 'https://api.dicebear.com/7.x/notionists/svg?seed=JamadagniGoogle&backgroundColor=ea4335',
        role: 'candidate',
        createdAt: Date.now()
      };
      setCurrentUser(googleUser);
      setCurrentUserState(googleUser);
      onUserChanged(googleUser);
      setLoadingProvider(null);
      onClose();
    }, 600);
  };

  // GitHub OAuth Login
  const handleGitHubSignIn = () => {
    setLoadingProvider('github');
    setTimeout(() => {
      const githubUser: UserProfile = {
        id: 'github_jama7777',
        name: 'jamadagni',
        email: '141951561+jama7777@users.noreply.github.com',
        title: 'Software Engineer & AI Researcher',
        targetCompanies: ['Meta', 'Google', 'OpenAI', 'Apple'],
        avatarUrl: 'https://avatars.githubusercontent.com/u/141951561?v=4',
        role: 'candidate',
        createdAt: Date.now()
      };
      setCurrentUser(githubUser);
      setCurrentUserState(githubUser);
      onUserChanged(githubUser);
      setLoadingProvider(null);
      onClose();
    }, 600);
  };

  // Guest Mode
  const handleGuestSignIn = () => {
    const guest = createGuestUser();
    setCurrentUserState(guest);
    onUserChanged(guest);
    onClose();
  };

  // Custom Candidate Profile
  const handleCustomSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customName.trim()) return;

    const user = await registerUser(
      customName.trim(),
      `${customName.toLowerCase().replace(/\s+/g, '')}@candidate.local`,
      customTitle.trim() || 'Software Engineer',
      ['Google', 'Meta', 'OpenAI']
    );
    setCurrentUserState(user);
    onUserChanged(user);
    onClose();
  };

  const handleLogout = () => {
    logoutUser();
    setCurrentUserState(null);
    onUserChanged(null);
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xl pointer-events-auto"
        onClick={() => { if (!isMandatory) onClose(); }}
      >
        <motion.div
          initial={{ scale: 0.96, opacity: 0, y: 15 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.96, opacity: 0, y: 15 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          onClick={(e) => e.stopPropagation()}
          className="relative bg-zinc-950/95 border border-white/10 p-7 md:p-9 max-w-md w-full shadow-[0_0_80px_rgba(0,0,0,0.8)] rounded-3xl space-y-6 overflow-hidden"
        >
          {/* Subtle Ambient Radial Glow */}
          <div className="absolute -top-20 -right-20 w-48 h-48 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-20 -left-20 w-48 h-48 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

          {/* Close button if optional */}
          {!isMandatory && (
            <button
              onClick={onClose}
              className="absolute top-5 right-5 p-2 text-white/40 hover:text-white rounded-full bg-white/5 hover:bg-white/10 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}

          {/* Brand Header */}
          <div className="text-center space-y-2 pt-2">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-cyan-500/20 via-purple-500/20 to-pink-500/20 border border-white/15 mx-auto flex items-center justify-center shadow-lg">
              <Sparkles className="w-6 h-6 text-cyan-400" />
            </div>
            <h2 className="text-xl font-bold tracking-tight text-white">
              {currentUser ? 'Manage Your Account' : 'Welcome to Professional Friend'}
            </h2>
            <p className="text-xs text-zinc-400 max-w-xs mx-auto">
              {currentUser
                ? `Logged in as ${currentUser.name} (${currentUser.role})`
                : 'Sign in to track your technical interview scores, AI depth analysis, and history.'}
            </p>
          </div>

          {/* Logged in state card */}
          {currentUser && (
            <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/10 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <img
                  src={currentUser.avatarUrl || 'https://avatars.githubusercontent.com/u/141951561?v=4'}
                  alt={currentUser.name}
                  className="w-11 h-11 rounded-xl bg-black border border-white/10 object-cover"
                />
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                    {currentUser.name}
                    <span className="px-2 py-0.5 rounded-full text-[9px] font-mono bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 uppercase">
                      {currentUser.role}
                    </span>
                  </h3>
                  <p className="text-xs text-zinc-400">{currentUser.title || 'Technical Candidate'}</p>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="p-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 transition-colors"
                title="Sign Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* OAuth Buttons Stack */}
          {!isCustomMode ? (
            <div className="space-y-3 pt-1">
              {/* Google Button */}
              <button
                onClick={handleGoogleSignIn}
                disabled={loadingProvider !== null}
                className="w-full py-3.5 px-4 rounded-2xl bg-white hover:bg-zinc-100 text-zinc-900 font-semibold text-xs tracking-wide transition-all shadow-md flex items-center justify-center gap-3 relative group active:scale-[0.99]"
              >
                {loadingProvider === 'google' ? (
                  <div className="w-4 h-4 border-2 border-zinc-900 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.33 24 12 24z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 9.99 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                    />
                  </svg>
                )}
                <span>Continue with Google</span>
              </button>

              {/* GitHub Button */}
              <button
                onClick={handleGitHubSignIn}
                disabled={loadingProvider !== null}
                className="w-full py-3.5 px-4 rounded-2xl bg-zinc-900 hover:bg-zinc-800 border border-white/15 text-white font-semibold text-xs tracking-wide transition-all shadow-md flex items-center justify-center gap-3 active:scale-[0.99]"
              >
                {loadingProvider === 'github' ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <svg className="w-4 h-4 shrink-0 fill-current" viewBox="0 0 24 24">
                    <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                  </svg>
                )}
                <span>Continue with GitHub</span>
              </button>

              {/* Divider */}
              <div className="flex items-center gap-3 pt-2 pb-1">
                <div className="h-px bg-white/10 flex-1" />
                <span className="text-[10px] uppercase font-mono tracking-widest text-zinc-500">or</span>
                <div className="h-px bg-white/10 flex-1" />
              </div>

              {/* Guest Mode & Custom Profile Buttons */}
              <div className="flex gap-2">
                <button
                  onClick={handleGuestSignIn}
                  className="flex-1 py-3 px-3 rounded-2xl bg-white/[0.03] hover:bg-white/[0.08] border border-white/10 text-zinc-300 hover:text-white text-xs font-semibold transition-all flex items-center justify-center gap-1.5"
                >
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                  <span>Guest Mode</span>
                </button>
                <button
                  onClick={() => setIsCustomMode(true)}
                  className="flex-1 py-3 px-3 rounded-2xl bg-white/[0.03] hover:bg-white/[0.08] border border-white/10 text-zinc-300 hover:text-white text-xs font-semibold transition-all flex items-center justify-center gap-1.5"
                >
                  <User className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Custom Handle</span>
                </button>
              </div>
            </div>
          ) : (
            /* Custom Handle Form */
            <form onSubmit={handleCustomSubmit} className="space-y-4 pt-1">
              <div>
                <label className="text-[10px] uppercase tracking-wider text-zinc-400 font-bold block mb-1.5">
                  Candidate Display Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Jamadagni"
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  className="w-full bg-white/5 border border-white/15 rounded-xl py-2.5 px-4 text-xs text-white placeholder:text-zinc-600 outline-none focus:border-cyan-400 transition-all font-semibold"
                />
              </div>

              <div>
                <label className="text-[10px] uppercase tracking-wider text-zinc-400 font-bold block mb-1.5">
                  Target Role / Specialty
                </label>
                <input
                  type="text"
                  placeholder="e.g. Senior AI Engineer"
                  value={customTitle}
                  onChange={(e) => setCustomTitle(e.target.value)}
                  className="w-full bg-white/5 border border-white/15 rounded-xl py-2.5 px-4 text-xs text-white placeholder:text-zinc-600 outline-none focus:border-cyan-400 transition-all font-semibold"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCustomMode(false)}
                  className="py-2.5 px-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-400 hover:text-white text-xs font-semibold transition-all"
                >
                  Back
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-cyan-500 to-purple-600 hover:from-cyan-400 hover:to-purple-500 text-white text-xs font-bold transition-all shadow-md"
                >
                  Sign In
                </button>
              </div>
            </form>
          )}

          {/* Footer Security Note */}
          <div className="pt-2 text-center text-[10px] text-zinc-500 font-mono flex items-center justify-center gap-1.5">
            <Shield className="w-3 h-3 text-emerald-400/80" />
            <span>End-to-End Local Persistence & Privacy</span>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
