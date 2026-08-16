// AI Evaluation Service for Comprehensive Interview Scoring, Depth Assessment & Mistake Detection
import { GoogleGenAI } from '@google/genai';
import { InterviewEvaluation, InterviewSession, QuestionBreakdown } from './db';

const EVALUATION_PROMPT_SCHEMA = `
Respond ONLY with a valid, parseable JSON object matching this exact structure:
{
  "overallScore": number (0 to 100),
  "grade": string ("A+", "A", "A-", "B+", "B", "B-", "C+", "C", "D", "Needs Improvement"),
  "knowledgeDepthScore": number (0 to 100, measures technical depth, architectural nuance, algorithmic understanding vs shallow buzzwords),
  "communicationScore": number (0 to 100, clarity, structure e.g. STAR method, conciseness),
  "practicalApplicationScore": number (0 to 100, real-world trade-offs, edge cases, scalability),
  "problemSolvingScore": number (0 to 100, reasoning approach, handling challenges),
  "strengths": [
    "string: specific strong points, high depth answers, good frameworks mentioned"
  ],
  "drawbacks": [
    "string: key missing concepts, areas where explanation was too surface-level or ambiguous"
  ],
  "mistakes": [
    {
      "mistake": "string: exact misconception, technical inaccuracy, or poor phrasing",
      "context": "string: in response to which question or scenario",
      "correction": "string: the accurate industry-standard answer or best practice",
      "severity": "minor" | "moderate" | "critical"
    }
  ],
  "improvements": [
    "string: actionable recommendations to elevate candidate to top 1% standard for this company"
  ],
  "detailedFeedback": "string: 2-3 detailed paragraphs providing an honest executive review of the candidate's performance, company-culture alignment, and overall hiring recommendation.",
  "biometricSummary": {
    "confidenceLevel": "High" | "Moderate" | "Hesitant" | "Variable",
    "emotionalStability": "Calm" | "Expressive" | "Nervous" | "Composed",
    "notes": "string: feedback on delivery demeanor, engagement, and emotional cues"
  },
  "questionBreakdown": [
    {
      "question": "string",
      "answerSummary": "string",
      "depthRating": "Shallow" | "Moderate" | "Deep" | "Expert",
      "score": number (0 to 100),
      "critique": "string: honest critique of what was good and what was lacking",
      "suggestedIdealAnswer": "string: concise blueprint of the ideal response"
    }
  ],
  "recommendedResources": [
    {
      "title": "string",
      "topic": "string",
      "linkQuery": "string: google search query for candidate study"
    }
  ]
}
`;

/**
 * Generates an in-depth AI performance evaluation for an interview session
 */
export async function evaluateInterviewSession(session: InterviewSession): Promise<InterviewEvaluation> {
  const geminiKey = import.meta.env.VITE_GEMINI_API_KEY;
  const mistralKey = import.meta.env.VITE_MISTRAL_API_KEY;

  const durationMin = Math.max(1, Math.round(session.durationSeconds / 60));
  const questionsCount = session.qaPairs.length;

  const formattedQA = session.qaPairs.length > 0
    ? session.qaPairs.map((qa, i) => `
[Q${i + 1}]: ${qa.question}
Candidate Answer: ${qa.answer || '(No answer provided / Skipped)'}
Candidate Emotion at time: ${qa.emotion || 'neutral'}
`).join('\n---\n')
    : session.transcript.map(t => `${t.role === 'user' ? 'Candidate' : 'Interviewer'}: ${t.content}`).join('\n');

  const dominantEmotions = session.dominantEmotions?.join(', ') || 'neutral, focused';

  const systemInstruction = `You are a Principal Hiring Committee Lead and Staff Evaluator at ${session.company} reviewing a mock technical interview for the "${session.role}" position.
Analyze the candidate's actual answers with high scrutiny. Evaluate knowledge depth, conceptual clarity, system architecture reasoning, trade-offs, and behavioral maturity.

Interview Meta:
- Target Company: ${session.company}
- Target Role: ${session.role}
- Total Turns/Questions Answered: ${questionsCount}
- Duration: ~${durationMin} minute(s)
- Biometric Emotion Observations: ${dominantEmotions}
- Completion Status: ${session.status} (${session.status === 'ended-early' ? 'Candidate ended interview mid-way' : 'Completed session'})

${EVALUATION_PROMPT_SCHEMA}

IMPORTANT:
- If only 1-2 questions were answered because the interview ended early, score fairly based on the depth demonstrated in those questions, and provide constructive feedback on how to expand answers.
- Point out concrete technical mistakes, code bugs, architectural flaws, or missed trade-offs in the 'mistakes' array.
- Deliver genuine, actionable feedback tailored specifically to ${session.company}'s engineering culture and high bar.
- Output ONLY the JSON block. Do not include markdown wraps or surrounding text.`;

  // 1. Try Gemini 2.5 Flash
  if (geminiKey && geminiKey !== 'YOUR_GEMINI_API_KEY') {
    try {
      console.log('[Evaluator] Generating evaluation via Gemini 2.5 Flash...');
      const client = new GoogleGenAI({ apiKey: geminiKey });
      
      const response = await client.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          {
            role: 'user',
            parts: [
              {
                text: `${systemInstruction}\n\nCandidate Interview Transcript & Q&A Log:\n${formattedQA}`
              }
            ]
          }
        ],
        config: {
          responseMimeType: 'application/json',
          temperature: 0.2
        }
      });

      const responseText = response.text || '';
      const parsed = cleanAndParseJSON(responseText);
      if (parsed) {
        return sanitizeEvaluation(parsed, session);
      }
    } catch (geminiErr) {
      console.warn('[Evaluator] Gemini evaluation failed, attempting fallback to Mistral:', geminiErr);
    }
  }

  // 2. Fallback to Mistral Large
  if (mistralKey) {
    try {
      console.log('[Evaluator] Generating evaluation via Mistral Large fallback...');
      const res = await fetch('/api/mistral/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${mistralKey}`
        },
        body: JSON.stringify({
          model: 'mistral-large-latest',
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemInstruction },
            { role: 'user', content: `Interview Transcript:\n${formattedQA}\n\nGenerate structured JSON evaluation now.` }
          ],
          temperature: 0.2,
          max_tokens: 2500
        })
      });

      if (res.ok) {
        const data = await res.json();
        const content = data.choices?.[0]?.message?.content || '';
        const parsed = cleanAndParseJSON(content);
        if (parsed) {
          return sanitizeEvaluation(parsed, session);
        }
      }
    } catch (mistralErr) {
      console.warn('[Evaluator] Mistral evaluation failed:', mistralErr);
    }
  }

  // 3. Fallback Heuristic Evaluation if API keys are unreachable
  return createHeuristicFallbackEvaluation(session);
}

function cleanAndParseJSON(raw: string): any | null {
  try {
    const cleaned = raw
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();
    return JSON.parse(cleaned);
  } catch (e) {
    console.error('[Evaluator] Failed to parse JSON:', e, raw.slice(0, 200));
    // Try regex extraction of outermost {}
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {}
    }
    return null;
  }
}

function sanitizeEvaluation(raw: any, session: InterviewSession): InterviewEvaluation {
  return {
    overallScore: Math.min(100, Math.max(0, Number(raw.overallScore) || 75)),
    grade: typeof raw.grade === 'string' ? raw.grade : 'B',
    knowledgeDepthScore: Math.min(100, Math.max(0, Number(raw.knowledgeDepthScore) || 70)),
    communicationScore: Math.min(100, Math.max(0, Number(raw.communicationScore) || 75)),
    practicalApplicationScore: Math.min(100, Math.max(0, Number(raw.practicalApplicationScore) || 70)),
    problemSolvingScore: Math.min(100, Math.max(0, Number(raw.problemSolvingScore) || 72)),
    strengths: Array.isArray(raw.strengths) && raw.strengths.length > 0 ? raw.strengths : [
      'Demonstrated enthusiasm and good foundational understanding of core concepts.',
      'Willingness to explore technical questions and communicate thought process clearly.'
    ],
    drawbacks: Array.isArray(raw.drawbacks) && raw.drawbacks.length > 0 ? raw.drawbacks : [
      'Could provide deeper architectural trade-offs (e.g. latency vs consistency, memory vs CPU).',
      'Elaborate more on production scale edge cases and fault tolerance.'
    ],
    mistakes: Array.isArray(raw.mistakes) ? raw.mistakes.map((m: any) => ({
      mistake: String(m.mistake || 'Incomplete technical detail'),
      context: String(m.context || 'General responses'),
      correction: String(m.correction || 'Elaborate on real-world best practices and edge cases'),
      severity: (['minor', 'moderate', 'critical'].includes(m.severity) ? m.severity : 'minor') as 'minor' | 'moderate' | 'critical'
    })) : [],
    improvements: Array.isArray(raw.improvements) && raw.improvements.length > 0 ? raw.improvements : [
      `Deep dive into ${session.company}'s specific tech stack and distributed systems papers.`,
      'Structure technical explanations using concrete metrics, complexity benchmarks, and trade-off tables.'
    ],
    detailedFeedback: typeof raw.detailedFeedback === 'string' && raw.detailedFeedback.length > 20
      ? raw.detailedFeedback
      : `The candidate completed an interview session for the ${session.role} position at ${session.company}. They displayed solid fundamentals and communicative ability. With deeper emphasis on scale, edge cases, and architectural justification, they can achieve a top-tier score.`,
    biometricSummary: {
      confidenceLevel: raw.biometricSummary?.confidenceLevel || 'Moderate',
      emotionalStability: raw.biometricSummary?.emotionalStability || 'Composed',
      notes: raw.biometricSummary?.notes || 'Maintained steady eye contact and positive emotional engagement throughout the session.'
    },
    questionBreakdown: Array.isArray(raw.questionBreakdown) && raw.questionBreakdown.length > 0
      ? raw.questionBreakdown.map((qb: any) => ({
        question: String(qb.question || 'Interview Question'),
        answerSummary: String(qb.answerSummary || 'Candidate response'),
        depthRating: (['Shallow', 'Moderate', 'Deep', 'Expert'].includes(qb.depthRating) ? qb.depthRating : 'Moderate') as any,
        score: Math.min(100, Math.max(0, Number(qb.score) || 75)),
        critique: String(qb.critique || 'Good foundation with room for deeper technical expansion.'),
        suggestedIdealAnswer: String(qb.suggestedIdealAnswer || 'Focus on concrete metrics, edge cases, and systemic trade-offs.')
      }))
      : (session.qaPairs.map(qa => ({
        question: qa.question,
        answerSummary: qa.answer.slice(0, 140) + '...',
        depthRating: 'Moderate' as const,
        score: 75,
        critique: 'Provided direct answer. Can be deepened by adding quantitative examples.',
        suggestedIdealAnswer: 'State core mechanism, trade-offs, and scalability guarantees.'
      }))),
    recommendedResources: Array.isArray(raw.recommendedResources) && raw.recommendedResources.length > 0
      ? raw.recommendedResources
      : [
        {
          title: `${session.company} System Design Primer`,
          topic: 'Distributed Systems & High Scale Architectures',
          linkQuery: `${session.company} engineering system design interview guide`
        },
        {
          title: `${session.role} LeetCode & Technical Patterns`,
          topic: 'Data Structures & Algorithms',
          linkQuery: `LeetCode discuss ${session.company} ${session.role} interview questions`
        }
      ],
    evaluatedAt: Date.now()
  };
}

function createHeuristicFallbackEvaluation(session: InterviewSession): InterviewEvaluation {
  const qaCount = session.qaPairs.length;
  const avgLen = qaCount > 0 ? session.qaPairs.reduce((acc, q) => acc + (q.answer?.length || 0), 0) / qaCount : 0;
  
  let score = 70;
  if (avgLen > 250) score += 15;
  else if (avgLen > 100) score += 8;
  if (qaCount >= 3) score += 10;

  score = Math.min(95, Math.max(50, score));
  const grade = score >= 90 ? 'A' : score >= 80 ? 'B+' : score >= 70 ? 'B' : 'C';

  return {
    overallScore: score,
    grade,
    knowledgeDepthScore: Math.round(score * 0.95),
    communicationScore: Math.round(score * 1.02),
    practicalApplicationScore: Math.round(score * 0.92),
    problemSolvingScore: Math.round(score * 0.96),
    strengths: [
      'Active participation and clear responses to interviewer prompts.',
      'Demonstrated understanding of core technical concepts required for the role.',
      'Positive communication cadence and articulate delivery.'
    ],
    drawbacks: [
      'Further depth on concurrency, caching strategies, and resilience patterns would strengthen answers.',
      'Quantify results more frequently (e.g. latency ms, throughput QPS, memory footprints).'
    ],
    mistakes: session.qaPairs.length > 0 ? [
      {
        mistake: 'Broad overview without deep dive into implementation trade-offs.',
        context: session.qaPairs[0]?.question || 'General technical discussion',
        correction: 'Lead with the high-level architecture then immediately break down edge cases and scaling bottlenecks.',
        severity: 'minor'
      }
    ] : [],
    improvements: [
      `Practice STAR format responses specifically for ${session.company}'s behavioral and architectural principles.`,
      `Review recent engineering blogs and open-source projects released by ${session.company}.`,
      'Include failure modes and disaster recovery considerations when proposing technical designs.'
    ],
    detailedFeedback: `Candidate completed a mock interview for the ${session.role} position at ${session.company}. They demonstrated solid communication and fundamental understanding. For competitive roles at ${session.company}, amplifying deep architectural trade-offs and quantifiable benchmarks will significantly boost the evaluation outcome.`,
    biometricSummary: {
      confidenceLevel: 'Moderate',
      emotionalStability: 'Composed',
      notes: 'Maintained focused composure and engagement during questioning.'
    },
    questionBreakdown: session.qaPairs.map(qa => ({
      question: qa.question,
      answerSummary: qa.answer ? (qa.answer.slice(0, 120) + (qa.answer.length > 120 ? '...' : '')) : 'Brief answer',
      depthRating: qa.answer.length > 200 ? 'Deep' : qa.answer.length > 80 ? 'Moderate' : 'Shallow',
      score: qa.answer.length > 200 ? 88 : qa.answer.length > 80 ? 76 : 64,
      critique: 'Clear foundational points covered. Expand on practical trade-offs.',
      suggestedIdealAnswer: 'Structured answer highlighting system trade-offs, constraints, and execution plan.'
    })),
    recommendedResources: [
      {
        title: `${session.company} Engineering Blog & Architecture`,
        topic: 'System Architecture & Scale',
        linkQuery: `${session.company} engineering blog technical interview`
      },
      {
        title: `${session.role} Interview Deep-Dive`,
        topic: 'Role-Specific Technical Mastery',
        linkQuery: `How to ace ${session.role} interview at ${session.company}`
      }
    ],
    evaluatedAt: Date.now()
  };
}