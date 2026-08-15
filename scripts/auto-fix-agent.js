// Autonomous Auto-Fix Agent for Professional Friend
// Multi-LLM Engine: Google Gemini with automatic Mistral fallback

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
  const srcFiles = getSourceFiles('./src');
  console.log(`📂 Scanning ${srcFiles.length} source files...`);

  const fileContents = {};
  for (const f of srcFiles) {
    const stat = fs.statSync(f);
    if (stat.size > 80_000) {
      console.log(`  ⚠️  Skipping ${f} (${Math.round(stat.size / 1024)}KB — too large for context)`);
      fileContents[f] = `// [FILE EXCLUDED FROM CONTEXT: ${f} (${Math.round(stat.size / 1024)}KB). Do NOT modify unless explicitly requested in bug description.]`;
    } else {
      fileContents[f] = fs.readFileSync(f, 'utf8');
    }
  }

  // ── 2. Build system prompt ────────────────────────────────────────────────
  const systemPrompt = `You are a Principal Staff Software Engineer & Autonomous Code Repair Agent.
Your job: accurately diagnose and fix the reported bug in this React/TypeScript/Vite repository.

Tech stack & constraints:
- React 19, TypeScript 5.8, Vite 6, Tailwind CSS 4
- "motion": "^12.x" is installed. Correct import is: import { motion, AnimatePresence } from 'motion/react'; DO NOT change to 'framer-motion'.
- Lucide React icons, Three.js, @google/genai, IndexedDB.

Source files available:
${Object.keys(fileContents).map(f => `  - ${f}`).join('\n')}

RULES:
1. Analyze the issue title, error message, stack trace, and user description carefully.
2. If this issue does NOT describe an actionable bug or test modification, return "fixedFiles": [] and explain why in "diagnosis".
3. When providing a file fix in fixedFiles, provide the COMPLETE, FULL file replacement content with all imports, functions, and closing tags intact. Do NOT truncate.
4. Only include files you actually modified in fixedFiles.
5. The fixed code MUST pass: tsc --noEmit AND vite build with 0 errors.

RESPONSE SCHEMA (output ONLY valid JSON matching this schema, no markdown code fences):
{
  "diagnosis": "2-3 sentence root cause explanation referencing specific code.",
  "fixedFiles": [
    {
      "filePath": "src/components/Example.tsx",
      "content": "/* complete full file content */"
    }
  ],
  "commitMessage": "fix: concise description of what was fixed",
  "prDescription": "Markdown PR description explaining the bug and fix."
}`;

  const userPrompt = `Issue #${issueNumber}
Title: ${issueTitle}
Description:
${issueBody}

--- SOURCE CODE ---
${Object.entries(fileContents)
  .map(([f, code]) => `=== ${f} ===\n${code}\n=== END ${f} ===`)
  .join('\n\n')}

Analyze the issue and generate the JSON fix now.`;

  // ── 3. Multi-Engine Query Helper ──────────────────────────────────────────
  async function queryLLM(promptText) {
    // Try Gemini first if key is present
    if (geminiKey) {
      try {
        console.log('🧠 Querying Gemini (gemini-2.5-flash)...');
        const client = new GoogleGenAI({ apiKey: geminiKey });
        const response = await client.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\n${promptText}` }] }],
          config: { responseMimeType: 'application/json', temperature: 0.1 }
        });
        const text = typeof response.text === 'function' ? response.text() : (response.text ?? '');
        if (text) return { text, engine: 'Gemini 2.5 Flash' };
      } catch (err) {
        console.warn(`⚠️  Gemini failed (${err.message.slice(0, 120)}). Falling back to Mistral...`);
      }
    }

    // Fallback to Mistral
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
            { role: 'user', content: promptText }
          ],
          temperature: 0.1
        })
      });
      if (res.ok) {
        const data = await res.json();
        const text = data.choices?.[0]?.message?.content ?? '';
        return { text, engine: 'Mistral Large' };
      } else {
        const errText = await res.text();
        throw new Error(`Mistral API Error ${res.status}: ${errText.slice(0, 200)}`);
      }
    }

    throw new Error('No working AI API key available (both Gemini and Mistral failed).');
  }

  // ── 4. Fix generation & verification loop ─────────────────────────────────
  let lastBuildError = '';
  const maxAttempts  = 2;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log(`\n🧠 Auto-Fix Analysis — Attempt ${attempt}/${maxAttempts}...`);

    const finalPrompt = lastBuildError
      ? `${userPrompt}\n\n⚠️ PREVIOUS ATTEMPT BUILD ERROR:\n${lastBuildError}\nFix the code to eliminate this error and ensure valid TypeScript and complete JSX tags.`
      : userPrompt;

    let responseData;
    try {
      responseData = await queryLLM(finalPrompt);
      console.log(`✅ Response received from ${responseData.engine}`);
    } catch (err) {
      console.error(`❌ AI generation failed on attempt ${attempt}:`, err.message);
      lastBuildError = err.message;
      await new Promise(r => setTimeout(r, 3000));
      continue;
    }

    const fixData = cleanAndParseJSON(responseData.text);

    if (!fixData || !Array.isArray(fixData.fixedFiles)) {
      console.warn('⚠️  Invalid or empty JSON response from model.');
      lastBuildError = 'Response was not valid JSON with a fixedFiles array. Return ONLY the JSON object.';
      continue;
    }

    if (fixData.fixedFiles.length === 0) {
      console.log('ℹ️  AI analyzed the issue and determined no code changes are required.');
      console.log(`   Diagnosis: ${fixData.diagnosis}`);
      fs.writeFileSync('auto-fix-summary.json', JSON.stringify({
        diagnosis: fixData.diagnosis || 'No code changes required.',
        commitMessage: `chore: analysis of issue #${issueNumber} — no code changes needed`,
        prDescription: `No code changes were generated.\n\n**Analysis**: ${fixData.diagnosis}`,
        fixedFilesCount: 0,
        noChanges: true,
      }, null, 2));
      return;
    }

    console.log(`🔍 Diagnosis: ${fixData.diagnosis}`);
    console.log(`📝 Applying ${fixData.fixedFiles.length} file fix(es)...`);

    // Apply fixes
    for (const fileFix of fixData.fixedFiles) {
      const targetPath = path.resolve(fileFix.filePath);
      if (!fileFix.content || typeof fileFix.content !== 'string') {
        console.warn(`  ⚠️  Skipping ${fileFix.filePath} — no content provided`);
        continue;
      }
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.writeFileSync(targetPath, fileFix.content, 'utf8');
      console.log(`  ✅ Applied fix → ${fileFix.filePath}`);
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
        diagnosis:       fixData.diagnosis,
        commitMessage:   fixData.commitMessage || `fix: auto-resolve issue #${issueNumber}`,
        prDescription:   fixData.prDescription || `Autonomous fix for issue #${issueNumber}\n\n**Diagnosis**: ${fixData.diagnosis}`,
        fixedFilesCount: fixData.fixedFiles.length,
      }, null, 2));

      console.log(`\n🎉 Auto-fix complete! Summary saved to auto-fix-summary.json`);
      return;

    } catch (buildErr) {
      const errOut = [
        buildErr.stdout?.toString() ?? '',
        buildErr.stderr?.toString() ?? '',
        buildErr.message ?? '',
      ].join('\n');

      console.warn(`❌ Verification failed on attempt ${attempt}:`);
      console.warn(errOut.slice(0, 800));
      lastBuildError = errOut.slice(0, 1200);

      // Revert dirty files so repo stays clean
      try {
        execSync('git checkout -- .', { stdio: 'ignore' });
      } catch {}

      await new Promise(r => setTimeout(r, 4000));
    }
  }

  console.warn(`⚠️ Agent finished without a verified build. Leaving diagnostic comment.`);
  fs.writeFileSync('auto-fix-summary.json', JSON.stringify({
    diagnosis: `The AI analyzed the issue but the proposed fix failed automated verification (${lastBuildError.slice(0, 250)}...).`,
    commitMessage: `chore: unverified auto-fix attempt for issue #${issueNumber}`,
    prDescription: `Could not verify automated fix.`,
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
    if (entry.isDirectory()) {
      results.push(...getSourceFiles(fullPath));
    } else if (/\.(ts|tsx|js|jsx)$/.test(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

function cleanAndParseJSON(raw) {
  if (!raw || typeof raw !== 'string') return null;
  try {
    const cleaned = raw
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    return JSON.parse(cleaned);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      try { return JSON.parse(match[0]); } catch {}
    }
    return null;
  }
}

main().catch(err => {
  console.error('💥 Fatal Auto-Fix Agent Error:', err.message || err);
  process.exit(1);
});
