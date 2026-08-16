// Autonomous Auto-Fix Agent for Professional Friend
// Multi-Engine: GitHub Models (FREE via GITHUB_TOKEN) → Gemini → Mistral fallback

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

async function main() {
  const githubToken = process.env.GITHUB_TOKEN;
  const geminiKey   = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
  const mistralKey  = process.env.MISTRAL_API_KEY || process.env.VITE_MISTRAL_API_KEY || '5JcglJFMR52ixZlEoeVpcLqSlpvjV6BQ';
  const issueTitle  = process.env.ISSUE_TITLE  || 'Bug Report';
  const issueBody   = process.env.ISSUE_BODY   || 'No description provided';
  const issueNumber = process.env.ISSUE_NUMBER || 'test';

  console.log(`🤖 Auto-Fix Agent starting for Issue #${issueNumber}`);
  console.log(`📌 Title: "${issueTitle}"`);
  console.log(`📝 Preview: ${issueBody.slice(0, 200)}...`);

  // ── 1. Gather source files ────────────────────────────────────────────────
  const srcFiles = [
    ...getSourceFiles('./src'),
    'vite.config.ts',
    'vercel.json',
    'package.json',
    'tsconfig.json',
  ].filter(f => fs.existsSync(f));

  console.log(`📂 Scanning ${srcFiles.length} source files...`);

  const fileContents = {};
  for (const f of srcFiles) {
    const stat = fs.statSync(f);
    if (stat.size > 350_000) {
      console.log(`  ⚠️  Skipping ${f} (${Math.round(stat.size / 1024)}KB — too large)`);
      fileContents[f] = `// [FILE EXCLUDED — ${Math.round(stat.size / 1024)}KB]`;
    } else {
      fileContents[f] = fs.readFileSync(f, 'utf8');
    }
  }

  // ── 2. Build system prompt ────────────────────────────────────────────────
  const systemPrompt = `You are a Principal Staff Software Engineer & Autonomous Code Repair Agent.
Your job: accurately diagnose and fix the reported bug in this React/TypeScript/Vite repository.

Tech stack:
- React 19, TypeScript 5.8, Vite 6, Tailwind CSS 4
- "motion": "^12.x" → import from 'motion/react' (NOT 'framer-motion')
- Lucide React icons, Three.js, @google/genai, IndexedDB
- Mistral API calls must use full URL: https://api.mistral.ai/v1/... (proxies cannot forward Authorization headers)

Source files:
${Object.keys(fileContents).map(f => `  - ${f}`).join('\n')}

RULES:
1. Analyze the issue carefully. If no actionable code fix is needed, return fixedFiles: [].
2. Provide COMPLETE file content (no truncation, no placeholders).
3. Only include files you actually modified.
4. Code must pass: tsc --noEmit AND vite build.

OUTPUT: ONLY valid JSON matching this schema (no markdown fences):
{
  "diagnosis": "Root cause in 2-3 sentences.",
  "fixedFiles": [{ "filePath": "src/...", "content": "complete file content" }],
  "commitMessage": "fix: short description",
  "prDescription": "PR body markdown"
}`;

  const userPrompt = `Issue #${issueNumber}
Title: ${issueTitle}
Description:
${issueBody}

--- SOURCE CODE ---
${Object.entries(fileContents)
  .map(([f, code]) => `=== ${f} ===\n${code}\n=== END ${f} ===`)
  .join('\n\n')}

Analyze and generate the JSON fix.`;

  // ── 3. Multi-Engine Query ─────────────────────────────────────────────────
  async function queryLLM(promptText, buildError = '') {
    const finalPrompt = buildError
      ? `${promptText}\n\n⚠️ PREVIOUS BUILD ERROR:\n${buildError}\nFix ALL errors. Ensure complete JSX tags and valid TypeScript.`
      : promptText;

    // ── Engine 1: GitHub Models (FREE, no extra key needed) ────────────────
    if (githubToken) {
      const ghModels = [
        { model: 'gpt-4o-mini', endpoint: 'https://models.inference.ai.azure.com/chat/completions' },
        { model: 'deepseek-v3-0324', endpoint: 'https://models.inference.ai.azure.com/chat/completions' },
        { model: 'Codestral-2501', endpoint: 'https://models.inference.ai.azure.com/chat/completions' },
        { model: 'mistral-nemo', endpoint: 'https://models.inference.ai.azure.com/chat/completions' },
      ];

      for (const { model, endpoint } of ghModels) {
        try {
          console.log(`🧠 Querying GitHub Models (${model}) — FREE via GITHUB_TOKEN...`);
          const res = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${githubToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model,
              messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: finalPrompt },
              ],
              response_format: { type: 'json_object' },
              temperature: 0.1,
            }),
          });
          if (res.ok) {
            const data = await res.json();
            const text = data.choices?.[0]?.message?.content ?? '';
            if (text) {
              console.log(`✅ Response from GitHub Models (${model})`);
              return { text, engine: `GitHub Models (${model})` };
            }
          } else {
            const errText = await res.text();
            console.warn(`  ⚠️  GitHub Models ${model} returned ${res.status}: ${errText.slice(0, 120)}`);
          }
        } catch (err) {
          console.warn(`  ⚠️  GitHub Models ${model} error: ${err.message}`);
        }
      }
    }

    // ── Engine 2: Google Gemini (fallback) ─────────────────────────────────
    if (geminiKey) {
      try {
        console.log('🧠 Falling back to Google Gemini...');
        const { GoogleGenAI } = await import('@google/genai');
        const client = new GoogleGenAI({ apiKey: geminiKey });
        const response = await client.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\n${finalPrompt}` }] }],
          config: { responseMimeType: 'application/json', temperature: 0.1 },
        });
        const text = typeof response.text === 'function' ? response.text() : (response.text ?? '');
        if (text) {
          console.log('✅ Response from Google Gemini');
          return { text, engine: 'Google Gemini 2.5 Flash' };
        }
      } catch (err) {
        console.warn(`  ⚠️  Gemini failed: ${err.message.slice(0, 120)}`);
      }
    }

    // ── Engine 3: Mistral (last resort) ────────────────────────────────────
    if (mistralKey) {
      console.log('🧠 Falling back to Mistral Large...');
      const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${mistralKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'mistral-large-latest',
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: finalPrompt },
          ],
          temperature: 0.1,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const text = data.choices?.[0]?.message?.content ?? '';
        console.log('✅ Response from Mistral Large');
        return { text, engine: 'Mistral Large' };
      }
      const errText = await res.text();
      throw new Error(`Mistral error ${res.status}: ${errText.slice(0, 200)}`);
    }

    throw new Error('No AI engine available. Set GITHUB_TOKEN (free), GEMINI_API_KEY, or MISTRAL_API_KEY.');
  }

  // ── 4. Fix generation + verification loop ─────────────────────────────────
  let lastBuildError = '';
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log(`\n🔄 Attempt ${attempt}/${maxAttempts}...`);

    let responseData;
    try {
      responseData = await queryLLM(userPrompt, lastBuildError);
    } catch (err) {
      console.error(`❌ All AI engines failed: ${err.message}`);
      break;
    }

    const fixData = cleanAndParseJSON(responseData.text);

    if (!fixData || !Array.isArray(fixData.fixedFiles)) {
      console.warn('⚠️  Invalid JSON response from model.');
      lastBuildError = 'Return ONLY valid JSON with a fixedFiles array.';
      continue;
    }

    if (fixData.fixedFiles.length === 0) {
      console.log('ℹ️  No code changes needed.');
      console.log(`   Diagnosis: ${fixData.diagnosis}`);
      fs.writeFileSync('auto-fix-summary.json', JSON.stringify({
        diagnosis: fixData.diagnosis || 'No code changes required.',
        commitMessage: `chore: analysis of issue #${issueNumber} — no code changes needed`,
        prDescription: `No changes needed.\n\n**Analysis**: ${fixData.diagnosis}`,
        fixedFilesCount: 0,
        noChanges: true,
      }, null, 2));
      return;
    }

    console.log(`🔍 Diagnosis: ${fixData.diagnosis}`);
    console.log(`📝 Applying ${fixData.fixedFiles.length} file fix(es) via ${responseData.engine}...`);

    for (const fileFix of fixData.fixedFiles) {
      const targetPath = path.resolve(fileFix.filePath);
      if (!fileFix.content || typeof fileFix.content !== 'string') {
        console.warn(`  ⚠️  Skipping ${fileFix.filePath} — no content`);
        continue;
      }
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.writeFileSync(targetPath, fileFix.content, 'utf8');
      console.log(`  ✅ Applied → ${fileFix.filePath}`);
    }

    // Verify
    console.log('\n🧪 Verifying: tsc --noEmit...');
    try {
      execSync('npm run lint', { stdio: 'pipe' });
      console.log('  ✅ TypeScript: 0 errors');

      console.log('🧪 Verifying: vite build...');
      execSync('npm run build', { stdio: 'pipe' });
      console.log('  ✅ Build: passed');

      fs.writeFileSync('auto-fix-summary.json', JSON.stringify({
        diagnosis: fixData.diagnosis,
        commitMessage: fixData.commitMessage || `fix: auto-resolve issue #${issueNumber}`,
        prDescription: fixData.prDescription || `Autonomous fix for #${issueNumber}.\n\n**Diagnosis**: ${fixData.diagnosis}`,
        fixedFilesCount: fixData.fixedFiles.length,
        engine: responseData.engine,
      }, null, 2));

      console.log(`\n🎉 Auto-fix complete via ${responseData.engine}!`);
      return;

    } catch (buildErr) {
      const errOut = [
        buildErr.stdout?.toString() ?? '',
        buildErr.stderr?.toString() ?? '',
        buildErr.message ?? '',
      ].join('\n');

      console.warn(`❌ Build failed on attempt ${attempt}:`);
      console.warn(errOut.slice(0, 800));
      lastBuildError = errOut.slice(0, 1200);

      try { execSync('git checkout -- .', { stdio: 'ignore' }); } catch {}
      await new Promise(r => setTimeout(r, 3000));
    }
  }

  console.warn('⚠️ All attempts exhausted — leaving diagnostic comment.');
  fs.writeFileSync('auto-fix-summary.json', JSON.stringify({
    diagnosis: `Fix attempts exhausted. Last build error: ${lastBuildError.slice(0, 250)}`,
    commitMessage: `chore: unverified fix attempt for #${issueNumber}`,
    prDescription: 'Fix could not be verified.',
    fixedFilesCount: 0,
    noChanges: true,
  }, null, 2));
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getSourceFiles(dir) {
  const results = [];
  if (!fs.existsSync(dir)) return results;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) results.push(...getSourceFiles(fullPath));
    else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) results.push(fullPath);
  }
  return results;
}

function cleanAndParseJSON(raw) {
  if (!raw || typeof raw !== 'string') return null;
  try {
    return JSON.parse(raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim());
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) { try { return JSON.parse(match[0]); } catch {} }
    return null;
  }
}

main().catch(err => {
  console.error('💥 Fatal error:', err.message || err);
  process.exit(1);
});
