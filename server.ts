import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createProxyMiddleware } from 'http-proxy-middleware';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// ── NIM + Tavily Agent Loop (Path B — Primary) ──────────────────────────────
//
// POST /api/nim-agent
// Body: { query: string, history: {role, content}[], systemPrompt?: string }
// Response: text/event-stream (SSE)
//   data: { type: "token", text: "..." }
//   data: { type: "sources", sources: [{title, url}], queries: [string] }
//   data: { type: "done" }
//
// Flow:
//   1. Call Tavily /search  → get top 5 web results
//   2. Build system prompt with context block injected
//   3. Stream NIM chat/completions → forward each token as SSE event
//   4. Send a final SSE "sources" event with Tavily URLs

app.post('/api/nim-agent', async (req, res) => {
  const NV_API_KEY = process.env.NV_API_KEY;
  const TAVILY_API_KEY = process.env.TAVILY_API_KEY;
  const NIM_MODEL = process.env.NIM_MODEL || 'meta/llama-3.3-70b-instruct';

  if (!NV_API_KEY || !TAVILY_API_KEY || TAVILY_API_KEY === 'tvly-YOUR_KEY_HERE') {
    res.status(503).json({ error: 'NV_API_KEY or TAVILY_API_KEY not configured' });
    return;
  }

  const { query, history = [], systemPrompt = '' } = req.body as {
    query: string;
    history: { role: string; content: string }[];
    systemPrompt?: string;
  };

  // ── SSE headers ────────────────────────────────────────────────────────────
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const send = (data: object) => res.write(`data: ${JSON.stringify(data)}\n\n`);

  try {
    // ── Step 1: Tavily Web Search ───────────────────────────────────────────
    console.log(`[NIM-Agent] Tavily search: "${query.slice(0, 80)}"`);
    let tavilySources: Array<{ title: string; url: string }> = [];
    let tavilyContext = '';

    try {
      const tavilyRes = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${TAVILY_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          max_results: 5,
          include_answer: false,
          search_depth: 'basic',
        }),
      });

      if (tavilyRes.ok) {
        const tavilyData = await tavilyRes.json() as {
          results?: Array<{ title: string; url: string; content: string }>;
        };
        const results = tavilyData.results ?? [];
        tavilySources = results.map(r => ({ title: r.title ?? r.url, url: r.url }));
        tavilyContext = results
          .map((r, i) => `[Source ${i + 1}] ${r.title}\nURL: ${r.url}\n${r.content}`)
          .join('\n\n---\n\n');
        console.log(`[NIM-Agent] Tavily returned ${results.length} results`);
      } else {
        const errText = await tavilyRes.text();
        console.warn(`[NIM-Agent] Tavily ${tavilyRes.status}:`, errText.slice(0, 200));
      }
    } catch (tavilyErr) {
      console.warn('[NIM-Agent] Tavily fetch failed:', tavilyErr);
    }

    // ── Step 2: Build NIM messages ─────────────────────────────────────────
    const contextBlock = tavilyContext
      ? `\n\n## Live Web Search Results (use these as your primary source)\n\n${tavilyContext}\n\n---`
      : '';

    const fullSystemPrompt = (systemPrompt || 'You are Professional Friend AI, a smart and concise assistant.')
      + contextBlock;

    const nimMessages: { role: string; content: string }[] = [
      { role: 'system', content: fullSystemPrompt },
      ...history.slice(-6),              // keep last 3 turns (6 messages)
      { role: 'user', content: query },
    ];

    // ── Step 3: Stream NIM response ────────────────────────────────────────
    console.log(`[NIM-Agent] Calling NIM (${NIM_MODEL}) — streaming`);
    const nimRes = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${NV_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: NIM_MODEL,
        messages: nimMessages,
        temperature: 0.7,
        max_tokens: 300,   // interview replies must be short; 300 is a hard ceiling
        stream: true,
      }),
    });

    if (!nimRes.ok || !nimRes.body) {
      const errText = await nimRes.text();
      console.error('[NIM-Agent] NIM error:', nimRes.status, errText.slice(0, 300));
      send({ type: 'error', message: `NIM API error ${nimRes.status}` });
      res.end();
      return;
    }

    // Read SSE stream from NIM and forward tokens to browser
    const reader = nimRes.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';            // keep incomplete line

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const payload = trimmed.slice(6);
        if (payload === '[DONE]') continue;

        try {
          const parsed = JSON.parse(payload);
          const token: string = parsed.choices?.[0]?.delta?.content ?? '';
          if (token) send({ type: 'token', text: token });
        } catch {
          // skip malformed JSON
        }
      }
    }

    // ── Step 4: Send sources then close ───────────────────────────────────
    send({ type: 'sources', sources: tavilySources, queries: [query] });
    send({ type: 'done' });
    console.log(`[NIM-Agent] Done. Tavily sources: ${tavilySources.length}`);

  } catch (err: any) {
    console.error('[NIM-Agent] Unhandled error:', err);
    send({ type: 'error', message: err.message ?? 'Unknown error' });
  }

  res.end();
});

// ── Mistral Chat Endpoint (server-side relay — avoids browser→Mistral 504s) ──
//
// POST /api/mistral-chat
// Body: { model, messages, temperature, max_tokens, stream? }
// Response: mirrors Mistral JSON response directly
//
app.post('/api/mistral-chat', async (req, res) => {
  const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY;
  if (!MISTRAL_API_KEY) {
    res.status(503).json({ error: 'MISTRAL_API_KEY not configured on server' });
    return;
  }

  const body = req.body;
  if (!body?.messages || !body?.model) {
    res.status(400).json({ error: 'Missing required fields: model, messages' });
    return;
  }

  try {
    console.log(`[Mistral] Relaying to Mistral API — model: ${body.model}`);
    const mistralRes = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${MISTRAL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000), // 30s server-side timeout
    });

    const responseBody = await mistralRes.text();
    console.log(`[Mistral] Response status: ${mistralRes.status}`);

    res.status(mistralRes.status)
      .set('Content-Type', mistralRes.headers.get('content-type') || 'application/json')
      .send(responseBody);

  } catch (err: any) {
    console.error('[Mistral] Relay error:', err?.message ?? err);
    res.status(504).json({ error: `Mistral relay failed: ${err?.message ?? 'timeout'}` });
  }
});


// Groq Proxy (kept for Whisper STT fallback)
app.use('/api/groq', createProxyMiddleware({
  target: 'https://api.groq.com',
  changeOrigin: true,
  pathRewrite: { '^/api/groq': '/openai/v1' },
}));

// Mistral Proxy
app.use('/api/mistral', createProxyMiddleware({
  target: 'https://api.mistral.ai',
  changeOrigin: true,
  pathRewrite: { '^/api/mistral': '' },
}));

// Deepgram Proxy
app.use('/api/deepgram', createProxyMiddleware({
  target: 'https://api.deepgram.com',
  changeOrigin: true,
  pathRewrite: { '^/api/deepgram': '/v1' },
}));

// Cartesia Proxy (Supports WebSockets)
app.use('/api/cartesia', createProxyMiddleware({
  target: 'https://api.cartesia.ai',
  changeOrigin: true,
  ws: true,
  pathRewrite: { '^/api/cartesia': '' },
}));

// ── Static Files ─────────────────────────────────────────────────────────────

app.use(express.static(path.join(__dirname, 'dist')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

const server = app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`API Proxies active for Groq (STT), Mistral, Deepgram, and Cartesia (WS)`);
  console.log(`NIM+Tavily agent endpoint: POST /api/nim-agent`);
  console.log(`Mistral chat endpoint: POST /api/mistral/v1/chat/completions`);
});

// Explicitly handle WebSocket upgrades for the proxy
server.on('upgrade', (req, socket, head) => {
  if (req.url?.startsWith('/api/cartesia')) {
    const cartesiaProxy = createProxyMiddleware({
      target: 'https://api.cartesia.ai',
      changeOrigin: true,
      ws: true,
      pathRewrite: { '^/api/cartesia': '' },
    });
    (cartesiaProxy as any).upgrade(req, socket, head);
  }
});
