// Cyberpunk Glassmorphic Auth, Registration & Profile Switcher Modal

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  User,
  X,
  Plus,
  CheckCircle2,
  Briefcase,
  Building2,
  Mail,
  Shield,
  Sparkles,
  ArrowRight,
  LogOut,
  UserCheck,
  Zap
} from 'lucide-react';
import {
  UserProfile,
  getAllProfiles,
  getCurrentUser,
  setCurrentUser,
  registerUser,
  updateUserProfile,
  createGuestUser
} from '../services/auth';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUserChanged: (user: UserProfile) => void;
}

const POPULAR_COMPANIES = [
  'Google',
  'Meta',
  'OpenAI',
  'Apple',
  'Anthropic',
  'Microsoft',
  'Amazon',
  'Netflix',
  'NVIDIA',
  'Uber'
];

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onUserChanged
}) => {
  const [activeTab, setActiveTab] = useState<'switch' | 'register' | 'edit'>('switch');
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [currentUser, setCurrentUserState] = useState<UserProfile>(getCurrentUser());

  // Registration / Edit Form State
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [title, setTitle] = useState('');
  const [selectedCompanies, setSelectedCompanies] = useState<string[]>(['Google', 'Meta']);
  const [role, setRole] = useState<'candidate' | 'recruiter' | 'investor'>('candidate');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (isOpen) {
      const all = getAllProfiles();
      const curr = getCurrentUser();
      setProfiles(all);
      setCurrentUserState(curr);

      // Pre-fill edit form
      setName(curr.name || '');
      setEmail(curr.email || '');
      setTitle(curr.title || '');
      setSelectedCompanies(curr.targetCompanies || ['Google', 'Meta']);
      setRole((curr.role as any) || 'candidate');
      setErrorMsg('');
    }
  }, [isOpen]);

  const handleSelectProfile = (user: UserProfile) => {
    setCurrentUser(user);
    setCurrentUserState(user);
    onUserChanged(user);
    onClose();
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMsg('Please enter your name');
      return;
    }

    try {
      const newUser = await registerUser(
        name.trim(),
        email.trim() || `${name.toLowerCase().replace(/\s+/g, '')}@candidate.local`,
        title.trim() || 'Software Engineer',
        selectedCompanies.length > 0 ? selectedCompanies : ['Google', 'Meta'],
        role
      );
      setProfiles(getAllProfiles());
      setCurrentUserState(newUser);
      onUserChanged(newUser);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to create profile');
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setErrorMsg('Name cannot be empty');
      return;
    }

    try {
      const updated = await updateUserProfile({
        name: name.trim(),
        email: email.trim(),
        title: title.trim(),
        targetCompanies: selectedCompanies,
        role
      });
      setProfiles(getAllProfiles());
      setCurrentUserState(updated);
      onUserChanged(updated);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to update profile');
    }
  };

  const handleGuestMode = () => {
    const guest = createGuestUser();
    setCurrentUserState(guest);
    onUserChanged(guest);
    onClose();
  };

  const toggleCompany = (company: string) => {
    if (selectedCompanies.includes(company)) {
      setSelectedCompanies(selectedCompanies.filter(c => c !== company));
    } else {
      setSelectedCompanies([...selectedCompanies, company]);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-xl pointer-events-auto"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: 20 }}
          onClick={(e) => e.stopPropagation()}
          className="bg-zinc-950 border border-white/15 p-6 md:p-8 max-w-xl w-full shadow-[0_0_80px_rgba(34,211,238,0.15)] max-h-[90vh] overflow-y-auto rounded-3xl space-y-6 custom-scrollbar"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/10 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center shadow-[0_0_20px_rgba(34,211,238,0.3)]">
                <UserCheck className="w-6 h-6 text-cyan-400" />
              </div>
              <div>
                <h2 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
                  CANDIDATE IDENTITY
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 uppercase">
                    {currentUser.role}
                  </span>
                </h2>
                <p className="text-xs text-white/50">Personalized scores, analytics & interview history</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 border border-white/10 bg-white/5 hover:bg-white/10 text-white/50 hover:text-white rounded-xl transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Navigation Tabs */}
          <div className="flex bg-black/40 p-1 rounded-2xl border border-white/10">
            <button
              onClick={() => { setActiveTab('switch'); setErrorMsg(''); }}
              className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${activeTab === 'switch'
                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-lg shadow-cyan-500/10'
                : 'text-white/40 hover:text-white'
                }`}
            >
              <User className="w-3.5 h-3.5" /> Profiles ({profiles.length})
            </button>
            <button
              onClick={() => { setActiveTab('register'); setErrorMsg(''); }}
              className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${activeTab === 'register'
                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow-lg shadow-purple-500/10'
                : 'text-white/40 hover:text-white'
                }`}
            >
              <Plus className="w-3.5 h-3.5" /> New Profile
            </button>
            <button
              onClick={() => { setActiveTab('edit'); setErrorMsg(''); }}
              className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${activeTab === 'edit'
                ? 'bg-pink-500/20 text-pink-300 border border-pink-500/40 shadow-lg shadow-pink-500/10'
                : 'text-white/40 hover:text-white'
                }`}
            >
              <Sparkles className="w-3.5 h-3.5" /> Edit Active
            </button>
          </div>

          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs font-mono">
              ⚠️ {errorMsg}
            </div>
          )}

          {/* TAB 1: SWITCH PROFILE */}
          {activeTab === 'switch' && (
            <div className="space-y-4">
              <div className="space-y-2.5">
                {profiles.map((p) => {
                  const isActive = p.id === currentUser.id;
                  return (
                    <div
                      key={p.id}
                      onClick={() => handleSelectProfile(p)}
                      className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between group ${isActive
                        ? 'bg-gradient-to-r from-cyan-950/40 to-black border-cyan-500/50 shadow-[0_0_25px_rgba(34,211,238,0.15)] ring-1 ring-cyan-500/30'
                        : 'bg-white/5 border-white/10 hover:border-cyan-500/30 hover:bg-white/[0.08]'
                        }`}
                    >
                      <div className="flex items-center gap-3.5">
                        <img
                          src={p.avatarUrl || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(p.name)}`}
                          alt={p.name}
                          className="w-11 h-11 rounded-xl bg-black/50 border border-white/10 p-0.5 object-cover"
                        />
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-sm font-bold text-white group-hover:text-cyan-300 transition-colors">
                              {p.name}
                            </h3>
                            {isActive && (
                              <span className="px-2 py-0.5 rounded-full text-[9px] font-bold bg-cyan-400 text-black uppercase">
                                Active
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-white/50">{p.title || 'Technical Candidate'}</p>
                          <div className="flex gap-1.5 mt-1.5 flex-wrap">
                            {(p.targetCompanies || []).slice(0, 3).map((comp) => (
                              <span
                                key={comp}
                                className="px-1.5 py-0.5 rounded bg-black/40 border border-white/5 text-[9px] font-mono text-cyan-200/70"
                              >
                                {comp}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {isActive ? (
                          <CheckCircle2 className="w-5 h-5 text-cyan-400" />
                        ) : (
                          <ArrowRight className="w-4 h-4 text-white/30 group-hover:text-cyan-400 group-hover:translate-x-0.5 transition-all" />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Quick Guest Mode Button */}
              <div className="pt-2 border-t border-white/10 flex gap-3">
                <button
                  onClick={handleGuestMode}
                  className="flex-1 py-3 px-4 rounded-2xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 hover:text-white text-xs font-bold transition-all flex items-center justify-center gap-2"
                >
                  <Zap className="w-4 h-4 text-amber-400" />
                  <span>Continue as Guest</span>
                </button>
                <button
                  onClick={() => setActiveTab('register')}
                  className="flex-1 py-3 px-4 rounded-2xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-300 text-xs font-bold transition-all flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/10"
                >
                  <Plus className="w-4 h-4 text-cyan-400" />
                  <span>Create New Candidate</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: REGISTER NEW PROFILE */}
          {activeTab === 'register' && (
            <form onSubmit={handleRegister} className="space-y-4">
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-white/60 block mb-1.5">
                  Full Name / Handle *
                </label>
                <div className="relative">
                  <User className="w-4 h-4 absolute left-3.5 top-3.5 text-white/40" />
                  <input
                    type="text"
                    required
                    placeholder="e.g. Jamadagni"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 pl-10 pr-4 text-xs text-white placeholder:text-white/30 outline-none focus:border-purple-500/60 transition-all font-semibold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-white/60 block mb-1.5">
                    Target Role / Title
                  </label>
                  <div className="relative">
                    <Briefcase className="w-4 h-4 absolute left-3.5 top-3.5 text-white/40" />
                    <input
                      type="text"
                      placeholder="e.g. Senior AI Engineer"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 pl-10 pr-4 text-xs text-white placeholder:text-white/30 outline-none focus:border-purple-500/60 transition-all font-semibold"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-white/60 block mb-1.5">
                    Email (Local Identity)
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 absolute left-3.5 top-3.5 text-white/40" />
                    <input
                      type="email"
                      placeholder="e.g. name@domain.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 pl-10 pr-4 text-xs text-white placeholder:text-white/30 outline-none focus:border-purple-500/60 transition-all font-semibold"
                    />
                  </div>
                </div>
              </div>

              {/* Target Companies Selection */}
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-white/60 block mb-2">
                  Target Companies (Interview Focus)
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {POPULAR_COMPANIES.map((comp) => {
                    const isSelected = selectedCompanies.includes(comp);
                    return (
                      <button
                        type="button"
                        key={comp}
                        onClick={() => toggleCompany(comp)}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all border ${isSelected
                          ? 'bg-purple-500/20 border-purple-500/50 text-purple-300 shadow-[0_0_10px_rgba(168,85,247,0.2)]'
                          : 'bg-white/5 border-white/10 text-white/50 hover:text-white'
                          }`}
                      >
                        {isSelected && '✓ '}
                        {comp}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="pt-3 border-t border-white/10 flex gap-3">
                <button
                  type="button"
                  onClick={() => setActiveTab('switch')}
                  className="py-3 px-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/60 hover:text-white text-xs font-bold transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400 text-white text-xs font-bold transition-all shadow-lg shadow-purple-500/20"
                >
                  Create & Start Interviewing 🚀
                </button>
              </div>
            </form>
          )}

          {/* TAB 3: EDIT CURRENT PROFILE */}
          {activeTab === 'edit' && (
            <form onSubmit={handleUpdate} className="space-y-4">
              <div className="flex items-center gap-4 p-4 rounded-2xl bg-black/40 border border-white/10">
                <img
                  src={currentUser.avatarUrl || `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(currentUser.name)}`}
                  alt={currentUser.name}
                  className="w-14 h-14 rounded-2xl bg-black border border-cyan-500/30 p-1"
                />
                <div>
                  <h3 className="text-sm font-bold text-white">{currentUser.name}</h3>
                  <p className="text-xs text-white/50">{currentUser.email}</p>
                  <span className="text-[10px] font-mono text-cyan-400">ID: {currentUser.id}</span>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-white/60 block mb-1.5">
                  Display Name
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 px-4 text-xs text-white placeholder:text-white/30 outline-none focus:border-pink-500/60 transition-all font-semibold"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-white/60 block mb-1.5">
                  Target Role / Title
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl py-2.5 px-4 text-xs text-white placeholder:text-white/30 outline-none focus:border-pink-500/60 transition-all font-semibold"
                />
              </div>

              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-white/60 block mb-2">
                  Target Companies
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {POPULAR_COMPANIES.map((comp) => {
                    const isSelected = selectedCompanies.includes(comp);
                    return (
                      <button
                        type="button"
                        key={comp}
                        onClick={() => toggleCompany(comp)}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all border ${isSelected
                          ? 'bg-pink-500/20 border-pink-500/50 text-pink-300 shadow-[0_0_10px_rgba(236,72,153,0.2)]'
                          : 'bg-white/5 border-white/10 text-white/50 hover:text-white'
                          }`}
                      >
                        {isSelected && '✓ '}
                        {comp}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="pt-3 border-t border-white/10 flex gap-3">
                <button
                  type="button"
                  onClick={() => setActiveTab('switch')}
                  className="py-3 px-4 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-white/60 hover:text-white text-xs font-bold transition-all"
                >
                  Back
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-pink-500 to-cyan-500 hover:from-pink-400 hover:to-cyan-400 text-white text-xs font-bold transition-all shadow-lg shadow-pink-500/20"
                >
                  Save Profile Changes
                </button>
              </div>
            </form>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
