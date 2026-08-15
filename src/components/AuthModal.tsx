// AuthModal — Secure Email + Password Authentication
// Uses the rewritten auth.ts with PBKDF2-hashed passwords

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, Sparkles, Shield, Zap, Lock, User, LogOut, Eye, EyeOff, AlertCircle, CheckCircle2, Mail
} from 'lucide-react';
import {
  UserProfile,
  getCurrentUser,
  loginUser,
  registerUser,
  createGuestUser,
  logoutUser,
  isSessionAuthenticated,
} from '../services/auth';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUserChanged: (user: UserProfile | null) => void;
  isMandatory?: boolean;
}

type ViewMode = 'main' | 'login' | 'register' | 'github';

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onUserChanged,
  isMandatory = false,
}) => {
  const [currentUser, setCurrentUserState] = useState<UserProfile | null>(getCurrentUser());
  const [viewMode, setViewMode]             = useState<ViewMode>('main');

  // Shared fields
  const [email, setEmail]         = useState('');
  const [password, setPassword]   = useState('');
  const [showPass, setShowPass]   = useState(false);

  // Register-only fields
  const [name, setName]           = useState('');
  const [title, setTitle]         = useState('Senior Software Engineer');
  const [confirmPass, setConfirmPass] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);

  // GitHub
  const [githubUsername, setGithubUsername] = useState('');
  const [githubPassword, setGithubPassword] = useState('');
  const [showGithubPass, setShowGithubPass] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg]   = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    if (isOpen) {
      setCurrentUserState(getCurrentUser());
      setViewMode('main');
      setIsLoading(false);
      setErrorMsg('');
      setSuccessMsg('');
      setEmail(''); setPassword(''); setName('');
      setConfirmPass(''); setGithubUsername(''); setGithubPassword('');
    }
  }, [isOpen]);

  // ── Login ────────────────────────────────────────────────────────────────────
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(''); setIsLoading(true);
    try {
      const user = await loginUser(email.trim(), password);
      setCurrentUserState(user);
      onUserChanged(user);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message ?? 'Login failed.');
    } finally {
      setIsLoading(false);
    }
  };

  // ── Register ─────────────────────────────────────────────────────────────────
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (password !== confirmPass) {
      setErrorMsg('Passwords do not match.');
      return;
    }
    if (password.length < 6) {
      setErrorMsg('Password must be at least 6 characters.');
      return;
    }
    setIsLoading(true);
    try {
      const user = await registerUser(
        name.trim(),
        email.trim(),
        password,
        title.trim() || 'Software Engineer',
        ['Meta', 'Google', 'OpenAI'],
        'candidate'
      );
      setCurrentUserState(user);
      onUserChanged(user);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message ?? 'Registration failed.');
    } finally {
      setIsLoading(false);
    }
  };

  // ── GitHub Sign In (username → fetch public profile + set password) ──────────
  // We fetch the public GitHub profile for display only.
  // The user must set a local password — typing someone else's username
  // no longer logs you in automatically.
  const handleGitHubSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    if (!githubUsername.trim() || !githubPassword.trim()) return;
    if (githubPassword.length < 6) {
      setErrorMsg('Password must be at least 6 characters.');
      return;
    }
    setIsLoading(true);
    try {
      const cleanUser = githubUsername.trim().replace(/^@/, '');
      const syntheticEmail = `${cleanUser.toLowerCase()}@github.user`;

      // Try login first (returning user)
      try {
        const user = await loginUser(syntheticEmail, githubPassword);
        setCurrentUserState(user);
        onUserChanged(user);
        onClose();
        return;
      } catch {
        // Not registered yet — fetch GitHub profile and register
      }

      // Fetch public profile for display name / avatar
      let displayName = cleanUser;
      let avatar = `https://avatars.githubusercontent.com/${cleanUser}`;
      let bio = 'Software Engineer';
      try {
        const res = await fetch(`https://api.github.com/users/${cleanUser}`);
        if (res.ok) {
          const gh = await res.json();
          displayName = gh.name || gh.login || cleanUser;
          avatar = gh.avatar_url || avatar;
          bio = gh.bio || gh.company || 'Software Engineer';
        }
      } catch {
        // GitHub API failed — continue with username as name
      }

      const user = await registerUser(
        displayName,
        syntheticEmail,
        githubPassword,
        bio,
        ['Meta', 'Google', 'OpenAI', 'Apple'],
        'candidate'
      );
      // Override avatar with real GitHub one
      user.avatarUrl = avatar;
      setCurrentUserState(user);
      onUserChanged(user);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message ?? 'GitHub sign-in failed.');
    } finally {
      setIsLoading(false);
    }
  };

  // ── Guest ─────────────────────────────────────────────────────────────────────
  const handleGuestSignIn = () => {
    const guest = createGuestUser();
    setCurrentUserState(guest);
    onUserChanged(guest);
    onClose();
  };

  // ── Logout ────────────────────────────────────────────────────────────────────
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
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-xl pointer-events-auto"
        onClick={() => { if (!isMandatory) onClose(); }}
      >
        <motion.div
          initial={{ scale: 0.96, opacity: 0, y: 15 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.96, opacity: 0, y: 15 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          onClick={(e) => e.stopPropagation()}
          className="relative bg-zinc-950/95 border border-white/15 p-7 md:p-9 max-w-md w-full shadow-[0_0_90px_rgba(0,0,0,0.9)] rounded-3xl space-y-6 overflow-hidden"
        >
          {/* Ambient glows */}
          <div className="absolute -top-20 -right-20 w-48 h-48 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-20 -left-20 w-48 h-48 bg-purple-500/10 rounded-full blur-3xl pointer-events-none" />

          {!isMandatory && (
            <button
              onClick={onClose}
              className="absolute top-5 right-5 p-2 text-white/40 hover:text-white rounded-full bg-white/5 hover:bg-white/10 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}

          {/* Header */}
          <div className="text-center space-y-2 pt-2">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-cyan-500/20 via-purple-500/20 to-pink-500/20 border border-white/15 mx-auto flex items-center justify-center shadow-lg">
              <Sparkles className="w-6 h-6 text-cyan-400" />
            </div>
            <h2 className="text-xl font-bold tracking-tight text-white">
              {currentUser ? 'Active Session' : viewMode === 'login' ? 'Welcome Back' : viewMode === 'register' ? 'Create Account' : viewMode === 'github' ? 'GitHub Sign In' : 'Professional Friend'}
            </h2>
            <p className="text-xs text-zinc-400 max-w-xs mx-auto">
              {currentUser
                ? `Signed in as ${currentUser.email}`
                : viewMode === 'main'
                ? 'Sign in to access your personalized AI mock interviews and history.'
                : viewMode === 'login'
                ? 'Enter your credentials to continue.'
                : viewMode === 'register'
                ? 'Create your private account. Data stays on your device.'
                : 'Link your GitHub identity securely.'}
            </p>
          </div>

          {/* Logged-in card */}
          {currentUser && (
            <div className="p-4 rounded-2xl bg-white/[0.04] border border-white/10 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <img
                  src={currentUser.avatarUrl || 'https://api.dicebear.com/7.x/bottts/svg?seed=avatar'}
                  alt={currentUser.name}
                  className="w-11 h-11 rounded-xl bg-black border border-white/10 object-cover shrink-0"
                />
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-white truncate">{currentUser.name}</h3>
                  <p className="text-xs text-zinc-400 truncate">{currentUser.email}</p>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="p-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 transition-colors shrink-0"
                title="Sign out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Error / Success banners */}
          {errorMsg && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}
          {successMsg && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs">
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* ── MAIN: pick login method ── */}
          {viewMode === 'main' && !currentUser && (
            <div className="space-y-3 pt-1">
              {/* Email login */}
              <button
                onClick={() => { setViewMode('login'); setEmail(''); setPassword(''); setErrorMsg(''); }}
                className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-cyan-500/20 to-purple-600/20 hover:from-cyan-500/30 hover:to-purple-600/30 border border-white/15 text-white font-semibold text-xs tracking-wide transition-all flex items-center justify-center gap-3"
              >
                <Mail className="w-4 h-4 text-cyan-400" />
                <span>Sign In with Email</span>
              </button>

              {/* GitHub */}
              <button
                onClick={() => { setViewMode('github'); setGithubUsername(''); setGithubPassword(''); setErrorMsg(''); }}
                className="w-full py-3.5 px-4 rounded-2xl bg-zinc-900 hover:bg-zinc-800 border border-white/15 text-white font-semibold text-xs tracking-wide transition-all flex items-center justify-center gap-3"
              >
                <svg className="w-4 h-4 shrink-0 fill-current" viewBox="0 0 24 24">
                  <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                </svg>
                <span>Continue with GitHub</span>
              </button>

              <div className="flex items-center gap-3 pt-1 pb-0.5">
                <div className="h-px bg-white/10 flex-1" />
                <span className="text-[10px] uppercase font-mono tracking-widest text-zinc-500">or</span>
                <div className="h-px bg-white/10 flex-1" />
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleGuestSignIn}
                  className="flex-1 py-3 px-3 rounded-2xl bg-white/[0.03] hover:bg-white/[0.08] border border-white/10 text-zinc-300 hover:text-white text-xs font-semibold transition-all flex items-center justify-center gap-1.5"
                >
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                  <span>Guest Mode</span>
                </button>
                <button
                  onClick={() => { setViewMode('register'); setName(''); setEmail(''); setPassword(''); setConfirmPass(''); setErrorMsg(''); }}
                  className="flex-1 py-3 px-3 rounded-2xl bg-white/[0.03] hover:bg-white/[0.08] border border-white/10 text-zinc-300 hover:text-white text-xs font-semibold transition-all flex items-center justify-center gap-1.5"
                >
                  <User className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Create Account</span>
                </button>
              </div>
            </div>
          )}

          {/* ── LOGIN FORM ── */}
          {viewMode === 'login' && (
            <form onSubmit={handleLogin} className="space-y-4 pt-1">
              <Field label="Email" id="login-email">
                <input
                  id="login-email"
                  type="email"
                  required
                  autoFocus
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={e => { setEmail(e.target.value); setErrorMsg(''); }}
                  className={inputCls}
                />
              </Field>

              <Field label="Password" id="login-password">
                <div className="relative">
                  <input
                    id="login-password"
                    type={showPass ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    placeholder="Your password"
                    value={password}
                    onChange={e => { setPassword(e.target.value); setErrorMsg(''); }}
                    className={inputCls + ' pr-10'}
                  />
                  <button type="button" onClick={() => setShowPass(v => !v)} className="absolute right-3 top-2.5 text-zinc-500 hover:text-zinc-300">
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </Field>

              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setViewMode('main')} className={backBtnCls}>Back</button>
                <button type="submit" disabled={!email || !password || isLoading} className={primaryBtnCls}>
                  {isLoading ? <Spinner /> : 'Sign In'}
                </button>
              </div>

              <p className="text-center text-[10px] text-zinc-500">
                No account?{' '}
                <button type="button" className="text-cyan-400 hover:text-cyan-300 underline" onClick={() => { setViewMode('register'); setErrorMsg(''); }}>
                  Create one
                </button>
              </p>
            </form>
          )}

          {/* ── REGISTER FORM ── */}
          {viewMode === 'register' && (
            <form onSubmit={handleRegister} className="space-y-3.5 pt-1">
              <Field label="Full Name" id="reg-name">
                <input
                  id="reg-name"
                  type="text"
                  required
                  autoFocus
                  placeholder="e.g. Alex Johnson"
                  value={name}
                  onChange={e => { setName(e.target.value); setErrorMsg(''); }}
                  className={inputCls}
                />
              </Field>

              <Field label="Email" id="reg-email">
                <input
                  id="reg-email"
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={e => { setEmail(e.target.value); setErrorMsg(''); }}
                  className={inputCls}
                />
              </Field>

              <Field label="Target Role / Title" id="reg-title">
                <input
                  id="reg-title"
                  type="text"
                  placeholder="e.g. Senior AI Engineer"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  className={inputCls}
                />
              </Field>

              <Field label="Password (min 6 chars)" id="reg-pass">
                <div className="relative">
                  <input
                    id="reg-pass"
                    type={showPass ? 'text' : 'password'}
                    required
                    autoComplete="new-password"
                    placeholder="Create a password"
                    value={password}
                    onChange={e => { setPassword(e.target.value); setErrorMsg(''); }}
                    className={inputCls + ' pr-10'}
                  />
                  <button type="button" onClick={() => setShowPass(v => !v)} className="absolute right-3 top-2.5 text-zinc-500 hover:text-zinc-300">
                    {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </Field>

              <Field label="Confirm Password" id="reg-confirm">
                <div className="relative">
                  <input
                    id="reg-confirm"
                    type={showConfirm ? 'text' : 'password'}
                    required
                    autoComplete="new-password"
                    placeholder="Repeat your password"
                    value={confirmPass}
                    onChange={e => { setConfirmPass(e.target.value); setErrorMsg(''); }}
                    className={inputCls + ' pr-10'}
                  />
                  <button type="button" onClick={() => setShowConfirm(v => !v)} className="absolute right-3 top-2.5 text-zinc-500 hover:text-zinc-300">
                    {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </Field>

              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setViewMode('main')} className={backBtnCls}>Back</button>
                <button type="submit" disabled={!name || !email || !password || !confirmPass || isLoading} className={primaryBtnCls}>
                  {isLoading ? <Spinner /> : 'Create Account'}
                </button>
              </div>

              <p className="text-center text-[10px] text-zinc-500">
                Already have one?{' '}
                <button type="button" className="text-cyan-400 hover:text-cyan-300 underline" onClick={() => { setViewMode('login'); setErrorMsg(''); }}>
                  Sign in
                </button>
              </p>
            </form>
          )}

          {/* ── GITHUB FORM ── */}
          {viewMode === 'github' && (
            <form onSubmit={handleGitHubSubmit} className="space-y-4 pt-1">
              <div className="text-center space-y-1 pb-1">
                <h3 className="text-sm font-bold text-white">GitHub Sign In</h3>
                <p className="text-xs text-zinc-400">Enter your username and set a local password to secure your account.</p>
              </div>

              <Field label="GitHub Username" id="gh-user">
                <div className="relative">
                  <span className="absolute left-3.5 top-2.5 text-zinc-500 font-mono text-xs">@</span>
                  <input
                    id="gh-user"
                    type="text"
                    required
                    autoFocus
                    placeholder="your_username"
                    value={githubUsername}
                    onChange={e => { setGithubUsername(e.target.value); setErrorMsg(''); }}
                    className={inputCls + ' pl-8'}
                  />
                </div>
              </Field>

              <Field label="Password (min 6 chars)" id="gh-pass">
                <div className="relative">
                  <input
                    id="gh-pass"
                    type={showGithubPass ? 'text' : 'password'}
                    required
                    autoComplete="new-password"
                    placeholder="Your local password"
                    value={githubPassword}
                    onChange={e => { setGithubPassword(e.target.value); setErrorMsg(''); }}
                    className={inputCls + ' pr-10'}
                  />
                  <button type="button" onClick={() => setShowGithubPass(v => !v)} className="absolute right-3 top-2.5 text-zinc-500 hover:text-zinc-300">
                    {showGithubPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </Field>

              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setViewMode('main')} className={backBtnCls}>Back</button>
                <button type="submit" disabled={!githubUsername.trim() || githubPassword.length < 6 || isLoading} className={primaryBtnCls}>
                  {isLoading ? <Spinner /> : 'Continue'}
                </button>
              </div>
            </form>
          )}

          {/* Footer */}
          <div className="pt-1 text-center text-[10px] text-zinc-500 font-mono flex items-center justify-center gap-1.5">
            <Shield className="w-3 h-3 text-emerald-400/80" />
            <span>Passwords hashed with PBKDF2-SHA256 · Local only</span>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

// ── Shared style constants ────────────────────────────────────────────────────
const inputCls = 'w-full bg-white/5 border border-white/15 rounded-xl py-2.5 px-4 text-xs font-mono text-white placeholder:text-zinc-600 outline-none focus:border-cyan-400 transition-all';
const backBtnCls = 'py-2.5 px-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-400 hover:text-white text-xs font-semibold transition-all';
const primaryBtnCls = 'flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-cyan-500 to-purple-600 hover:from-cyan-400 hover:to-purple-500 text-white text-xs font-bold transition-all shadow-md flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed';

const Field: React.FC<{ label: string; id: string; children: React.ReactNode }> = ({ label, id, children }) => (
  <div>
    <label htmlFor={id} className="text-[10px] uppercase tracking-wider text-zinc-400 font-bold block mb-1.5">
      {label}
    </label>
    {children}
  </div>
);

const Spinner = () => (
  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
);
