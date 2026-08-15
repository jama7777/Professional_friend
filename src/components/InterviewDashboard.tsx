import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Award,
  BarChart3,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  TrendingUp,
  Brain,
  MessageSquare,
  Sparkles,
  Clock,
  Building,
  Briefcase,
  Download,
  Trash2,
  ExternalLink,
  ChevronRight,
  ChevronDown,
  RotateCcw,
  BookOpen,
  Activity,
  User,
  Bot,
  X,
  Layers,
  Search,
  ShieldAlert,
  HelpCircle
} from 'lucide-react';
import {
  InterviewSession,
  InterviewEvaluation,
  getUserInterviewSessions,
  deleteInterviewSession,
  clearAllInterviewSessions
} from '../services/db';
import { UserProfile } from '../services/auth';

interface InterviewDashboardProps {
  session: InterviewSession | null;
  isOpen: boolean;
  onClose: () => void;
  onSelectSession?: (session: InterviewSession) => void;
  isEvaluating?: boolean;
  currentUser?: UserProfile;
}

type TabType = 'overview' | 'questions' | 'strengths' | 'mistakes' | 'improvements' | 'history';

export const InterviewDashboard: React.FC<InterviewDashboardProps> = ({
  session: activeSession,
  isOpen,
  onClose,
  onSelectSession,
  isEvaluating = false,
  currentUser
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [historySessions, setHistorySessions] = useState<InterviewSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<InterviewSession | null>(activeSession);
  const [expandedQuestion, setExpandedQuestion] = useState<number | null>(0);
  const [searchFilter, setSearchFilter] = useState('');

  useEffect(() => {
    if (activeSession) {
      setSelectedSession(activeSession);
    }
  }, [activeSession]);

  useEffect(() => {
    if (isOpen) {
      loadHistory();
    }
  }, [isOpen, selectedSession, currentUser]);

  const loadHistory = async () => {
    try {
      const all = currentUser?.id ? await getUserInterviewSessions(currentUser.id) : await getUserInterviewSessions('user_jamadagni');
      setHistorySessions(all);
      if (!selectedSession && all.length > 0) {
        setSelectedSession(all[0]);
      }
    } catch (e) {
      console.error('Failed to load history sessions:', e);
    }
  };

  const handleDeleteSession = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Delete this interview session record?')) {
      await deleteInterviewSession(id);
      await loadHistory();
      if (selectedSession?.id === id) {
        const remaining = historySessions.filter(s => s.id !== id);
        setSelectedSession(remaining[0] || null);
      }
    }
  };

  const handleClearAll = async () => {
    if (confirm('Clear all interview history records from local DB? This cannot be undone.')) {
      await clearAllInterviewSessions();
      setHistorySessions([]);
      setSelectedSession(null);
    }
  };

  const handleExportJSON = () => {
    if (!currentDisplaySession) return;
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(currentDisplaySession, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `Interview_Report_${currentDisplaySession.company}_${currentDisplaySession.role}_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const currentDisplaySession = selectedSession || activeSession;
  const evaluation: InterviewEvaluation | undefined = currentDisplaySession?.evaluation || undefined;

  if (!isOpen) return null;

  const filteredHistory = historySessions.filter(s =>
    s.company.toLowerCase().includes(searchFilter.toLowerCase()) ||
    s.role.toLowerCase().includes(searchFilter.toLowerCase())
  );

  const getScoreColor = (score: number) => {
    if (score >= 85) return 'text-emerald-400 border-emerald-400/30 bg-emerald-500/10';
    if (score >= 70) return 'text-cyan-400 border-cyan-400/30 bg-cyan-500/10';
    if (score >= 55) return 'text-amber-400 border-amber-400/30 bg-amber-500/10';
    return 'text-rose-400 border-rose-400/30 bg-rose-500/10';
  };

  const getDepthBadge = (depth: string) => {
    switch (depth?.toLowerCase()) {
      case 'expert':
        return 'bg-purple-500/20 text-purple-300 border-purple-500/40';
      case 'deep':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
      case 'moderate':
        return 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40';
      default:
        return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-xl pointer-events-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          className="w-full max-w-6xl h-[92vh] bg-zinc-950/95 border border-white/10 rounded-[32px] shadow-[0_0_80px_rgba(0,0,0,0.8)] flex flex-col overflow-hidden text-white relative backdrop-blur-3xl"
        >
          {/* Header */}
          <div className="p-6 border-b border-white/10 flex flex-wrap items-center justify-between gap-4 bg-gradient-to-r from-cyan-950/30 via-zinc-900/60 to-purple-950/30 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-cyan-500/20 to-purple-500/20 border border-cyan-500/30 flex items-center justify-center shadow-lg shadow-cyan-500/10">
                <Brain className="w-6 h-6 text-cyan-400" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-black tracking-tight text-white flex items-center gap-2">
                    {currentDisplaySession?.company || 'Mock'} <span className="text-white/40">/</span> {currentDisplaySession?.role || 'Technical Interview'}
                  </h2>
                  {currentDisplaySession?.status && (
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${currentDisplaySession.status === 'completed'
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                      : currentDisplaySession.status === 'ended-early'
                        ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                        : 'bg-blue-500/10 border-blue-500/30 text-blue-400'
                      }`}>
                      {currentDisplaySession.status === 'ended-early' ? 'Ended Mid-way' : currentDisplaySession.status}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-4 text-xs text-white/50 mt-1">
                  <span className="flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-white/40" />
                    {currentDisplaySession?.startedAt ? new Date(currentDisplaySession.startedAt).toLocaleString() : 'Just now'}
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-cyan-400" />
                    {currentDisplaySession?.qaPairs?.length || 0} Questions Covered
                  </span>
                  <span className="flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5 text-purple-400" />
                    {Math.max(1, Math.round((currentDisplaySession?.durationSeconds || 0) / 60))} min duration
                  </span>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="flex items-center gap-2 ml-auto">
              {evaluation && (
                <button
                  onClick={handleExportJSON}
                  className="px-3.5 py-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 text-xs font-semibold text-white/80 transition-all flex items-center gap-2"
                  title="Export full evaluation report as JSON"
                >
                  <Download className="w-3.5 h-3.5 text-cyan-400" />
                  <span className="hidden sm:inline">Export Report</span>
                </button>
              )}
              <button
                onClick={onClose}
                className="p-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-red-500/20 hover:border-red-500/30 text-white/60 hover:text-red-400 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="px-6 py-2.5 border-b border-white/5 bg-black/40 flex items-center gap-2 overflow-x-auto custom-scrollbar shrink-0">
            <TabButton
              active={activeTab === 'overview'}
              onClick={() => setActiveTab('overview')}
              icon={<Award className="w-4 h-4" />}
              label="Executive Overview"
            />
            <TabButton
              active={activeTab === 'questions'}
              onClick={() => setActiveTab('questions')}
              icon={<MessageSquare className="w-4 h-4" />}
              label={`Questions & Depth (${currentDisplaySession?.qaPairs?.length || 0})`}
            />
            <TabButton
              active={activeTab === 'strengths'}
              onClick={() => setActiveTab('strengths')}
              icon={<CheckCircle2 className="w-4 h-4" />}
              label="Strengths & Gaps"
            />
            <TabButton
              active={activeTab === 'mistakes'}
              onClick={() => setActiveTab('mistakes')}
              icon={<ShieldAlert className="w-4 h-4" />}
              label={`Mistakes & Fixes (${evaluation?.mistakes?.length || 0})`}
            />
            <TabButton
              active={activeTab === 'improvements'}
              onClick={() => setActiveTab('improvements')}
              icon={<TrendingUp className="w-4 h-4" />}
              label="Action Roadmap"
            />
            <TabButton
              active={activeTab === 'history'}
              onClick={() => setActiveTab('history')}
              icon={<Layers className="w-4 h-4" />}
              label={`Session History (${historySessions.length})`}
            />
          </div>

          {/* Body Content */}
          <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-gradient-to-b from-transparent to-black/60">
            {isEvaluating ? (
              <div className="h-full min-h-[400px] flex flex-col items-center justify-center text-center p-8">
                <div className="relative mb-6">
                  <div className="w-20 h-20 rounded-full bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center animate-pulse">
                    <Sparkles className="w-10 h-10 text-cyan-400 animate-spin" style={{ animationDuration: '4s' }} />
                  </div>
                  <div className="absolute inset-0 rounded-full border-2 border-cyan-400/40 border-t-transparent animate-spin" />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Analyzing Interview Performance...</h3>
                <p className="text-sm text-white/50 max-w-md mb-4">
                  Evaluating technical depth, answers, mistakes, biometric composure, and architectural trade-offs using AI models.
                </p>
                <div className="flex items-center gap-2 text-xs font-mono text-cyan-400 bg-cyan-500/10 px-4 py-1.5 rounded-full border border-cyan-500/20">
                  <Activity className="w-3.5 h-3.5 animate-pulse" />
                  Generating detailed candidate scorecard
                </div>
              </div>
            ) : !currentDisplaySession ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-8 text-white/40">
                <Layers className="w-12 h-12 mb-3 text-white/20" />
                <p className="text-lg font-semibold text-white/60">No Interview Record Selected</p>
                <p className="text-xs text-white/40 mt-1">Start an interview session or select one from history to view performance analytics.</p>
              </div>
            ) : (
              <>
                {/* ══ TAB 1: OVERVIEW ══ */}
                {activeTab === 'overview' && (
                  <div className="space-y-6">
                    {/* Top Hero Cards */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {/* Overall Score Card */}
                      <div className="p-6 rounded-3xl bg-zinc-900/80 border border-white/10 relative overflow-hidden flex flex-col justify-between shadow-xl">
                        <div className="flex items-center justify-between mb-4">
                          <span className="text-xs font-bold uppercase tracking-widest text-white/40">Overall Performance</span>
                          <span className={`text-xs font-bold px-3 py-1 rounded-full border ${getScoreColor(evaluation?.overallScore || 0)}`}>
                            Grade: {evaluation?.grade || 'B'}
                          </span>
                        </div>
                        <div className="flex items-center gap-6 my-2">
                          <div className="relative flex items-center justify-center">
                            <svg className="w-28 h-28 transform -rotate-90">
                              <circle
                                cx="56"
                                cy="56"
                                r="48"
                                stroke="currentColor"
                                strokeWidth="8"
                                className="text-white/5"
                                fill="transparent"
                              />
                              <circle
                                cx="56"
                                cy="56"
                                r="48"
                                stroke="currentColor"
                                strokeWidth="8"
                                strokeDasharray={2 * Math.PI * 48}
                                strokeDashoffset={2 * Math.PI * 48 * (1 - (evaluation?.overallScore || 70) / 100)}
                                strokeLinecap="round"
                                className="text-cyan-400 transition-all duration-1000"
                                fill="transparent"
                              />
                            </svg>
                            <div className="absolute flex flex-col items-center">
                              <span className="text-3xl font-black tracking-tight text-white">{evaluation?.overallScore ?? '--'}</span>
                              <span className="text-[10px] uppercase font-bold text-white/40">/ 100</span>
                            </div>
                          </div>
                          <div className="flex-1 space-y-1">
                            <h4 className="text-sm font-bold text-white">
                              {(evaluation?.overallScore || 0) >= 80 ? 'Strong Candidate' : (evaluation?.overallScore || 0) >= 65 ? 'Competitive Basis' : 'Needs Preparation'}
                            </h4>
                            <p className="text-xs text-white/50 leading-relaxed">
                              {currentDisplaySession.company} Hiring Bar Assessment for {currentDisplaySession.role}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Dimension Meters */}
                      <div className="md:col-span-2 p-6 rounded-3xl bg-zinc-900/80 border border-white/10 shadow-xl flex flex-col justify-between">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-xs font-bold uppercase tracking-widest text-white/40">Assessment Dimensions</span>
                          <span className="text-[11px] text-cyan-400 font-mono">Depth & Precision Focus</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <MetricBar
                            label="Knowledge Depth"
                            value={evaluation?.knowledgeDepthScore ?? 70}
                            description="Technical depth vs surface level"
                            color="from-cyan-500 to-blue-500"
                          />
                          <MetricBar
                            label="Communication & STAR"
                            value={evaluation?.communicationScore ?? 75}
                            description="Structure, clarity & conciseness"
                            color="from-purple-500 to-pink-500"
                          />
                          <MetricBar
                            label="Practical Application"
                            value={evaluation?.practicalApplicationScore ?? 70}
                            description="Trade-offs, edge cases, scale"
                            color="from-emerald-500 to-teal-500"
                          />
                          <MetricBar
                            label="Problem Solving"
                            value={evaluation?.problemSolvingScore ?? 72}
                            description="Reasoning & edge case handling"
                            color="from-amber-500 to-orange-500"
                          />
                        </div>
                      </div>
                    </div>

                    {/* Executive Summary & Biometrics */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                      <div className="lg:col-span-2 p-6 rounded-3xl bg-zinc-900/60 border border-white/10 shadow-lg">
                        <div className="flex items-center gap-2 mb-3">
                          <Brain className="w-5 h-5 text-cyan-400" />
                          <h3 className="text-sm font-bold text-white uppercase tracking-wider">Executive Review</h3>
                        </div>
                        <p className="text-sm text-white/80 leading-relaxed whitespace-pre-wrap">
                          {evaluation?.detailedFeedback || 'No detailed feedback recorded for this session.'}
                        </p>
                      </div>

                      <div className="p-6 rounded-3xl bg-zinc-900/60 border border-white/10 shadow-lg flex flex-col justify-between">
                        <div>
                          <div className="flex items-center gap-2 mb-3">
                            <Activity className="w-5 h-5 text-purple-400" />
                            <h3 className="text-sm font-bold text-white uppercase tracking-wider">Delivery & Biometrics</h3>
                          </div>
                          <div className="space-y-3">
                            <div className="flex items-center justify-between p-3 rounded-2xl bg-white/5 border border-white/5">
                              <span className="text-xs text-white/60">Confidence Level</span>
                              <span className="text-xs font-bold text-cyan-300 font-mono">
                                {evaluation?.biometricSummary?.confidenceLevel || 'Moderate'}
                              </span>
                            </div>
                            <div className="flex items-center justify-between p-3 rounded-2xl bg-white/5 border border-white/5">
                              <span className="text-xs text-white/60">Emotional Composure</span>
                              <span className="text-xs font-bold text-purple-300 font-mono">
                                {evaluation?.biometricSummary?.emotionalStability || 'Composed'}
                              </span>
                            </div>
                          </div>
                        </div>
                        <p className="text-xs text-white/40 mt-4 leading-relaxed italic border-t border-white/5 pt-3">
                          "{evaluation?.biometricSummary?.notes || 'Maintained steady presence and clear conversational tone.'}"
                        </p>
                      </div>
                    </div>

                    {/* Quick Highlights Row */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="p-5 rounded-3xl bg-emerald-950/20 border border-emerald-500/20">
                        <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs uppercase tracking-wider mb-2">
                          <CheckCircle2 className="w-4 h-4" /> Top Strengths
                        </div>
                        <ul className="space-y-1.5">
                          {(evaluation?.strengths || []).slice(0, 2).map((s, idx) => (
                            <li key={idx} className="text-xs text-emerald-100/80 flex items-start gap-2">
                              <span className="text-emerald-400 font-bold">•</span>
                              <span>{s}</span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className="p-5 rounded-3xl bg-rose-950/20 border border-rose-500/20">
                        <div className="flex items-center gap-2 text-rose-400 font-bold text-xs uppercase tracking-wider mb-2">
                          <AlertTriangle className="w-4 h-4" /> Priority Areas to Refine
                        </div>
                        <ul className="space-y-1.5">
                          {(evaluation?.drawbacks || []).slice(0, 2).map((d, idx) => (
                            <li key={idx} className="text-xs text-rose-100/80 flex items-start gap-2">
                              <span className="text-rose-400 font-bold">•</span>
                              <span>{d}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}

                {/* ══ TAB 2: QUESTIONS & DEPTH ANALYSIS ══ */}
                {activeTab === 'questions' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <h3 className="text-base font-bold text-white">Question-by-Question Deep Dive</h3>
                        <p className="text-xs text-white/50">Detailed breakdown of answers, depth ratings, and benchmark ideal responses.</p>
                      </div>
                      <span className="text-xs font-mono text-cyan-400 bg-cyan-500/10 px-3 py-1 rounded-full border border-cyan-500/20">
                        {currentDisplaySession.qaPairs?.length || 0} Questions Logged
                      </span>
                    </div>

                    {(!currentDisplaySession.qaPairs || currentDisplaySession.qaPairs.length === 0) ? (
                      <div className="p-8 rounded-3xl bg-zinc-900/50 border border-white/5 text-center text-white/40">
                        No formal Q&A pairs recorded for this session yet.
                      </div>
                    ) : (
                      currentDisplaySession.qaPairs.map((qa, index) => {
                        const qEval = evaluation?.questionBreakdown?.[index];
                        const isExpanded = expandedQuestion === index;

                        return (
                          <div
                            key={index}
                            className="rounded-2xl border border-white/10 bg-zinc-900/70 overflow-hidden transition-all shadow-md hover:border-white/20"
                          >
                            <button
                              onClick={() => setExpandedQuestion(isExpanded ? null : index)}
                              className="w-full p-4 flex items-start justify-between gap-4 text-left transition-colors hover:bg-white/5"
                            >
                              <div className="flex items-start gap-3 flex-1">
                                <span className="w-6 h-6 rounded-lg bg-white/10 border border-white/10 text-xs font-bold flex items-center justify-center text-white/70 shrink-0 mt-0.5">
                                  {index + 1}
                                </span>
                                <div className="space-y-1 flex-1">
                                  <h4 className="text-sm font-semibold text-white leading-snug">{qa.question}</h4>
                                  <div className="flex flex-wrap items-center gap-2 pt-1">
                                    <span className={`px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${getDepthBadge(qEval?.depthRating || 'Moderate')}`}>
                                      Depth: {qEval?.depthRating || 'Moderate'}
                                    </span>
                                    {qEval?.score && (
                                      <span className={`px-2.5 py-0.5 rounded-md text-[10px] font-bold font-mono border ${getScoreColor(qEval.score)}`}>
                                        Score: {qEval.score}/100
                                      </span>
                                    )}
                                    {qa.emotion && (
                                      <span className="text-[10px] text-white/40 flex items-center gap-1 font-mono">
                                        <Activity className="w-3 h-3 text-cyan-400" /> {qa.emotion}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>
                              <div className="text-white/40 pt-1 shrink-0">
                                {isExpanded ? <ChevronDown className="w-5 h-5 text-cyan-400" /> : <ChevronRight className="w-5 h-5" />}
                              </div>
                            </button>

                            <AnimatePresence>
                              {isExpanded && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  className="border-t border-white/5 p-4 space-y-4 bg-black/40 text-xs"
                                >
                                  {/* Candidate Answer */}
                                  <div className="space-y-1.5">
                                    <span className="text-[10px] uppercase font-bold text-cyan-400/80 tracking-wider flex items-center gap-1.5">
                                      <User className="w-3.5 h-3.5" /> Candidate Response
                                    </span>
                                    <div className="p-3.5 rounded-xl bg-cyan-950/20 border border-cyan-500/20 text-cyan-50 leading-relaxed whitespace-pre-wrap font-sans">
                                      {qa.answer || '(No response captured / skipped)'}
                                    </div>
                                  </div>

                                  {/* Critique */}
                                  {qEval?.critique && (
                                    <div className="space-y-1.5">
                                      <span className="text-[10px] uppercase font-bold text-amber-400/80 tracking-wider flex items-center gap-1.5">
                                        <Brain className="w-3.5 h-3.5" /> Technical Evaluation & Depth Critique
                                      </span>
                                      <div className="p-3.5 rounded-xl bg-amber-950/20 border border-amber-500/20 text-amber-100/90 leading-relaxed">
                                        {qEval.critique}
                                      </div>
                                    </div>
                                  )}

                                  {/* Suggested Benchmark Ideal Answer */}
                                  {qEval?.suggestedIdealAnswer && (
                                    <div className="space-y-1.5">
                                      <span className="text-[10px] uppercase font-bold text-emerald-400/80 tracking-wider flex items-center gap-1.5">
                                        <Sparkles className="w-3.5 h-3.5" /> Top 1% Benchmark Blueprint
                                      </span>
                                      <div className="p-3.5 rounded-xl bg-emerald-950/20 border border-emerald-500/20 text-emerald-100/90 leading-relaxed">
                                        {qEval.suggestedIdealAnswer}
                                      </div>
                                    </div>
                                  )}
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}

                {/* ══ TAB 3: STRENGTHS & DRAWBACKS ══ */}
                {activeTab === 'strengths' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Strengths */}
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 text-emerald-400">
                        <CheckCircle2 className="w-5 h-5" />
                        <h3 className="text-base font-bold uppercase tracking-wider text-white">Demonstrated Strengths</h3>
                      </div>
                      <div className="space-y-3">
                        {(evaluation?.strengths || []).map((str, idx) => (
                          <div
                            key={idx}
                            className="p-4 rounded-2xl bg-emerald-950/20 border border-emerald-500/30 text-emerald-100/90 text-xs leading-relaxed flex items-start gap-3 shadow-lg"
                          >
                            <span className="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 font-bold flex items-center justify-center text-[10px] shrink-0 mt-0.5">
                              {idx + 1}
                            </span>
                            <span className="flex-1">{str}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Drawbacks */}
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 text-amber-400">
                        <AlertTriangle className="w-5 h-5" />
                        <h3 className="text-base font-bold uppercase tracking-wider text-white">Depth Gaps & Drawbacks</h3>
                      </div>
                      <div className="space-y-3">
                        {(evaluation?.drawbacks || []).map((draw, idx) => (
                          <div
                            key={idx}
                            className="p-4 rounded-2xl bg-amber-950/20 border border-amber-500/30 text-amber-100/90 text-xs leading-relaxed flex items-start gap-3 shadow-lg"
                          >
                            <span className="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 font-bold flex items-center justify-center text-[10px] shrink-0 mt-0.5">
                              {idx + 1}
                            </span>
                            <span className="flex-1">{draw}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* ══ TAB 4: MISTAKES & FIXES ══ */}
                {activeTab === 'mistakes' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <h3 className="text-base font-bold text-white flex items-center gap-2">
                          <ShieldAlert className="w-5 h-5 text-rose-400" /> Mistakes & Inaccuracies Detected
                        </h3>
                        <p className="text-xs text-white/50">Pinpoints specific conceptual or phrasing anti-patterns and the industry-standard fix.</p>
                      </div>
                      <span className="text-xs font-mono text-rose-400 bg-rose-500/10 px-3 py-1 rounded-full border border-rose-500/20">
                        {evaluation?.mistakes?.length || 0} Identified
                      </span>
                    </div>

                    {(!evaluation?.mistakes || evaluation.mistakes.length === 0) ? (
                      <div className="p-8 rounded-3xl bg-zinc-900/50 border border-white/5 text-center text-white/40">
                        <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2 opacity-80" />
                        <p className="text-sm font-semibold text-white/60">No Critical Mistakes Detected</p>
                        <p className="text-xs text-white/40 mt-1">Answers did not contain fatal inaccuracies or anti-patterns.</p>
                      </div>
                    ) : (
                      evaluation.mistakes.map((m, idx) => (
                        <div
                          key={idx}
                          className="p-5 rounded-2xl bg-zinc-900/80 border border-rose-500/30 shadow-lg space-y-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-2">
                              <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${m.severity === 'critical'
                                ? 'bg-red-500/20 text-red-300 border-red-500/40'
                                : m.severity === 'moderate'
                                  ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                  : 'bg-blue-500/20 text-blue-300 border-blue-500/40'
                                }`}>
                                {m.severity} severity
                              </span>
                              <span className="text-xs text-white/40 italic">Context: {m.context}</span>
                            </div>
                          </div>

                          <div className="p-3 rounded-xl bg-rose-950/30 border border-rose-500/20 text-xs text-rose-100 flex items-start gap-2">
                            <XCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                            <div>
                              <strong className="text-rose-300">Observed Issue: </strong>
                              {m.mistake}
                            </div>
                          </div>

                          <div className="p-3 rounded-xl bg-emerald-950/30 border border-emerald-500/20 text-xs text-emerald-100 flex items-start gap-2">
                            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                            <div>
                              <strong className="text-emerald-300">Recommended Correction: </strong>
                              {m.correction}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* ══ TAB 5: IMPROVEMENTS ROADMAP ══ */}
                {activeTab === 'improvements' && (
                  <div className="space-y-6">
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-cyan-400">
                        <TrendingUp className="w-5 h-5" />
                        <h3 className="text-base font-bold uppercase tracking-wider text-white">
                          Action Roadmap for {currentDisplaySession.company}
                        </h3>
                      </div>
                      <div className="space-y-2.5">
                        {(evaluation?.improvements || []).map((imp, idx) => (
                          <div
                            key={idx}
                            className="p-4 rounded-2xl bg-zinc-900/80 border border-cyan-500/20 text-xs text-white/90 leading-relaxed flex items-start gap-3 shadow-md"
                          >
                            <span className="w-6 h-6 rounded-xl bg-cyan-500/20 border border-cyan-500/30 text-cyan-300 font-bold flex items-center justify-center text-xs shrink-0 mt-0.5">
                              {idx + 1}
                            </span>
                            <span className="flex-1 mt-0.5">{imp}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Recommended Resources */}
                    {evaluation?.recommendedResources && evaluation.recommendedResources.length > 0 && (
                      <div className="space-y-3 border-t border-white/10 pt-4">
                        <div className="flex items-center gap-2 text-purple-400">
                          <BookOpen className="w-5 h-5" />
                          <h3 className="text-base font-bold uppercase tracking-wider text-white">Recommended Study Deep-Dives</h3>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {evaluation.recommendedResources.map((res, idx) => (
                            <a
                              key={idx}
                              href={`https://www.google.com/search?q=${encodeURIComponent(res.linkQuery || res.title)}`}
                              target="_blank"
                              rel="noreferrer"
                              className="p-4 rounded-2xl bg-purple-950/20 border border-purple-500/20 hover:border-purple-500/40 hover:bg-purple-950/30 transition-all flex items-start justify-between gap-3 group"
                            >
                              <div className="space-y-1">
                                <span className="text-[10px] font-bold text-purple-300 uppercase tracking-widest">{res.topic}</span>
                                <h4 className="text-xs font-semibold text-white group-hover:text-purple-200 transition-colors">{res.title}</h4>
                              </div>
                              <ExternalLink className="w-4 h-4 text-purple-400 group-hover:translate-x-0.5 transition-transform shrink-0" />
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ══ TAB 6: HISTORY & ARCHIVE ══ */}
                {activeTab === 'history' && (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
                      <div>
                        <h3 className="text-base font-bold text-white">Past Interview Sessions</h3>
                        <p className="text-xs text-white/50">Stored securely in local browser IndexedDB.</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="relative">
                          <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
                          <input
                            type="text"
                            placeholder="Filter by company or role..."
                            value={searchFilter}
                            onChange={(e) => setSearchFilter(e.target.value)}
                            className="pl-8 pr-3 py-1.5 rounded-xl bg-white/5 border border-white/10 text-xs text-white placeholder:text-white/30 outline-none focus:border-cyan-500/50"
                          />
                        </div>
                        {historySessions.length > 0 && (
                          <button
                            onClick={handleClearAll}
                            className="px-3 py-1.5 rounded-xl bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 text-xs text-red-400 font-semibold transition-all flex items-center gap-1.5"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> Clear All
                          </button>
                        )}
                      </div>
                    </div>

                    {filteredHistory.length === 0 ? (
                      <div className="p-8 rounded-3xl bg-zinc-900/50 border border-white/5 text-center text-white/40">
                        No stored sessions found matching your criteria.
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {filteredHistory.map((sess) => {
                          const isCurrent = selectedSession?.id === sess.id;
                          const score = sess.evaluation?.overallScore;

                          return (
                            <div
                              key={sess.id}
                              onClick={() => {
                                setSelectedSession(sess);
                                if (onSelectSession) onSelectSession(sess);
                              }}
                              className={`p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-4 ${isCurrent
                                ? 'bg-cyan-500/10 border-cyan-500/40 shadow-[0_0_20px_rgba(34,211,238,0.15)]'
                                : 'bg-zinc-900/60 border-white/5 hover:border-white/20 hover:bg-zinc-900/90'
                                }`}
                            >
                              <div className="space-y-1 flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-bold text-white truncate">{sess.company}</span>
                                  <span className="text-xs text-white/40">/</span>
                                  <span className="text-xs font-medium text-cyan-300 truncate">{sess.role}</span>
                                </div>
                                <div className="flex items-center gap-3 text-[11px] text-white/40">
                                  <span>{new Date(sess.startedAt).toLocaleDateString()}</span>
                                  <span>•</span>
                                  <span>{sess.qaPairs?.length || 0} questions</span>
                                  <span>•</span>
                                  <span>{Math.max(1, Math.round((sess.durationSeconds || 0) / 60))}m</span>
                                </div>
                              </div>

                              <div className="flex items-center gap-2 shrink-0">
                                {score !== undefined ? (
                                  <div className={`px-2.5 py-1 rounded-xl text-xs font-bold font-mono border ${getScoreColor(score)}`}>
                                    {score}/100
                                  </div>
                                ) : (
                                  <span className="text-[10px] text-white/30 uppercase">Draft</span>
                                )}
                                <button
                                  onClick={(e) => handleDeleteSession(sess.id, e)}
                                  className="p-2 rounded-lg text-white/20 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                                  title="Delete session"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};

interface MetricBarProps {
  label: string;
  value: number;
  description: string;
  color: string;
}

const MetricBar: React.FC<MetricBarProps> = ({ label, value, description, color }) => {
  return (
    <div className="space-y-1.5 p-3 rounded-2xl bg-white/5 border border-white/5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold text-white">{label}</span>
        <span className="font-mono font-bold text-white/80">{value}%</span>
      </div>
      <div className="h-2 w-full bg-black/40 rounded-full overflow-hidden p-0.5 border border-white/5">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${value}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className={`h-full rounded-full bg-gradient-to-r ${color}`}
        />
      </div>
      <span className="text-[10px] text-white/40">{description}</span>
    </div>
  );
};

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}

const TabButton: React.FC<TabButtonProps> = ({ active, onClick, icon, label }) => {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${active
        ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-[0_0_15px_rgba(34,211,238,0.2)]'
        : 'text-white/50 border border-transparent hover:text-white hover:bg-white/5'
        }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
};
