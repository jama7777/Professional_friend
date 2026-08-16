// Autonomous Auto-Fix Agent for Professional Friend
// Multi-Engine: Gemini 2.5 Flash → Mistral Large fallback
// Note: GitHub Models was retired July 30, 2026

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { GoogleGenAI } from '@google/genai';

async function main() {
  const geminiKey  = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
  const mistralKey = process.env.MISTRAL_API_KEY || process.env.VITE_MISTRAL_API_KEY || '5JcglJFMR52ixZlEoeVpcLqSlpvjV6BQ';
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

  // ── 2. System prompt ──────────────────────────────────────────────────────
  const systemPrompt = `You are a Principal Staff Software Engineer & Autonomous Code Repair Agent.
Your job: accurately diagnose and fix the reported bug in this React/TypeScript/Vite repository.

Tech stack:
- React 19, TypeScript 5.8, Vite 6, Tailwind CSS 4
- "motion": "^12.x" → import from 'motion/react' (NOT 'framer-motion')
- Lucide React icons, Three.js, @google/genai, IndexedDB
- Mistral API calls MUST use full URL: https://api.mistral.ai/v1/... (never /api/mistral/... — proxies cannot forward Authorization headers)
- Deepgram API calls MUST use full URL: https://api.deepgram.com/v1/...

Source files:
${Object.keys(fileContents).map(f => `  - ${f}`).join('\n')}

RULES:
1. Analyze the issue carefully. If no actionable code fix is needed, return fixedFiles: [].
2. Provide COMPLETE file content — no truncation, no "// ... rest of file" comments.
3. Only include files you actually changed in fixedFiles.
4. All template strings must be properly closed. Check every backtick.
5. Code must pass: tsc --noEmit AND vite build with 0 errors.

OUTPUT: ONLY valid JSON (no markdown fences):
{
  "diagnosis": "Root cause in 2-3 sentences.",
  "fixedFiles": [{ "filePath": "src/...", "content": "complete file content" }],
  "commitMessage": "fix: short description",
  "prDescription": "PR markdown body"
}`;

  const userPrompt = `Issue #${issueNumber}
Title: ${issueTitle}
Description:
${issueBody}

--- SOURCE CODE ---
${Object.entries(fileContents)
  .map(([f, code]) => `=== ${f} ===\n${code}\n=== END ${f} ===`)
  .join('\n\n')}

Analyze and output the JSON fix now.`;

  // ── 3. Multi-Engine Query ─────────────────────────────────────────────────
  async function queryLLM(finalPrompt) {
    // Engine 1: Google Gemini 2.5 Flash
    if (geminiKey) {
      try {
        console.log('🧠 Querying Gemini 2.5 Flash...');
        const client = new GoogleGenAI({ apiKey: geminiKey });
        const response = await client.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\n${finalPrompt}` }] }],
          config: { responseMimeType: 'application/json', temperature: 0.1 },
        });
        const text = typeof response.text === 'function' ? response.text() : (response.text ?? '');
        if (text && text.trim().startsWith('{')) {
          console.log('✅ Response from Gemini 2.5 Flash');
          return { text, engine: 'Gemini 2.5 Flash' };
        }
        console.warn('⚠️  Gemini returned non-JSON response, falling back...');
      } catch (err) {
        console.warn(`⚠️  Gemini failed: ${err.message?.slice(0, 120)}. Trying Mistral...`);
      }
    }

    // Engine 2: Mistral Large
    if (mistralKey) {
      console.log('🧠 Querying Mistral Large...');
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

    throw new Error('No AI engine available. Set GEMINI_API_KEY or MISTRAL_API_KEY in GitHub Secrets.');
  }

  // ── 4. Fix generation + verification loop ─────────────────────────────────
  let lastBuildError = '';
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log(`\n🔄 Attempt ${attempt}/${maxAttempts}...`);

    const promptWithError = lastBuildError
      ? `${userPrompt}\n\n⚠️ PREVIOUS BUILD ERROR (must fix ALL of these):\n${lastBuildError}\n\nEnsure: complete JSX tags, all template literals closed, valid TypeScript, no "// ..." truncations.`
      : userPrompt;

    let responseData;
    try {
      responseData = await queryLLM(promptWithError);
    } catch (err) {
      console.error(`❌ All engines failed: ${err.message}`);
      break;
    }

    const fixData = cleanAndParseJSON(responseData.text);

    if (!fixData || !Array.isArray(fixData.fixedFiles)) {
      console.warn('⚠️  Invalid JSON from model, retrying...');
      lastBuildError = 'Your previous response was not valid JSON. Return ONLY a JSON object with fixedFiles array.';
      await new Promise(r => setTimeout(r, 3000));
      continue;
    }

    if (fixData.fixedFiles.length === 0) {
      console.log('ℹ️  No code changes needed.');
      console.log(`   Diagnosis: ${fixData.diagnosis}`);
      fs.writeFileSync('auto-fix-summary.json', JSON.stringify({
        diagnosis: fixData.diagnosis || 'No code changes required.',
        commitMessage: `chore: analysis of issue #${issueNumber} — no changes needed`,
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
      lastBuildError = errOut.slice(0, 1500);

      try { execSync('git checkout -- .', { stdio: 'ignore' }); } catch {}
      await new Promise(r => setTimeout(r, 4000));
    }
  }

  console.warn('⚠️ All attempts exhausted — leaving diagnostic comment.');
  fs.writeFileSync('auto-fix-summary.json', JSON.stringify({
    diagnosis: `Fix attempts exhausted. Last error: ${lastBuildError.slice(0, 300)}`,
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
