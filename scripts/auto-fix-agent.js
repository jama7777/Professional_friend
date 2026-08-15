// Autonomous Auto-Fix Agent for Professional Friend
// Powered by Google Gemini 2.5 Flash inside GitHub Actions

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { GoogleGenAI } from '@google/genai';

async function main() {
  const geminiKey = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY;
  const issueTitle  = process.env.ISSUE_TITLE  || 'Bug Report';
  const issueBody   = process.env.ISSUE_BODY   || 'No description provided';
  const issueNumber = process.env.ISSUE_NUMBER || 'test';

  if (!geminiKey) {
    console.error('❌ GEMINI_API_KEY is not set in repository secrets.');
    console.error('   Go to GitHub → Settings → Secrets & Variables → Actions → New repository secret');
    console.error('   Name: GEMINI_API_KEY   Value: your Gemini API key from aistudio.google.com');
    process.exit(1);
  }

  console.log(`🤖 Auto-Fix Agent starting for Issue #${issueNumber}`);
  console.log(`📌 Title: "${issueTitle}"`);
  console.log(`📝 Preview: ${issueBody.slice(0, 200)}...`);

  const client = new GoogleGenAI({ apiKey: geminiKey });

  // ── 1. Gather source files ────────────────────────────────────────────────
  const srcFiles = getSourceFiles('./src');
  console.log(`📂 Scanning ${srcFiles.length} source files...`);

  const fileContents = {};
  for (const f of srcFiles) {
    // Skip very large files (>80KB) to stay within Gemini's context
    const stat = fs.statSync(f);
    if (stat.size > 80_000) {
      console.log(`  ⚠️  Skipping ${f} (${Math.round(stat.size / 1024)}KB — too large for context)`);
      fileContents[f] = `// [FILE TOO LARGE — ${Math.round(stat.size / 1024)}KB — SKIPPED FROM CONTEXT]`;
    } else {
      fileContents[f] = fs.readFileSync(f, 'utf8');
    }
  }

  // ── 2. Build prompts ──────────────────────────────────────────────────────
  const systemPrompt = `You are a Principal Staff Software Engineer & Autonomous Code Repair Agent.
Your job: diagnose and fix the reported bug in this React/TypeScript/Vite repository.

Tech stack: React 19, TypeScript 5, Vite 6, Tailwind CSS 4, Three.js, @google/genai, IndexedDB.

Source files available:
${Object.keys(fileContents).map(f => `  - ${f}`).join('\n')}

RULES:
1. Analyze the issue title, error message, stack trace, and user description carefully.
2. Identify the EXACT root cause — reference specific file paths and line logic.
3. Return ONLY a valid JSON object matching the schema below. No markdown, no explanation outside the JSON.
4. Only include files you actually changed in fixedFiles. Do NOT include unchanged files.
5. The fixed code MUST pass: tsc --noEmit AND vite build with 0 errors.

RESPONSE SCHEMA (output ONLY this, nothing else):
{
  "diagnosis": "2-3 sentence root cause explanation referencing specific code.",
  "fixedFiles": [
    {
      "filePath": "src/components/Example.tsx",
      "content": "/* complete file content */"
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

Generate the JSON fix now.`;

  // ── 3. Agentic retry loop ─────────────────────────────────────────────────
  let lastBuildError = '';
  const maxAttempts  = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log(`\n🧠 Gemini analysis — Attempt ${attempt}/${maxAttempts}...`);

    const finalPrompt = lastBuildError
      ? `${userPrompt}\n\n⚠️ PREVIOUS ATTEMPT BUILD ERROR:\n${lastBuildError}\nFix the code to eliminate this error.`
      : userPrompt;

    let responseText = '';
    try {
      const response = await client.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          {
            role: 'user',
            parts: [{ text: `${systemPrompt}\n\n${finalPrompt}` }],
          },
        ],
        config: {
          responseMimeType: 'application/json',
          temperature: 0.05,
        },
      });

      // ⚠️  FIX: response.text is a METHOD, not a property
      responseText = typeof response.text === 'function' ? response.text() : (response.text ?? '');
    } catch (apiErr) {
      console.error(`❌ Gemini API call failed on attempt ${attempt}:`, apiErr.message);
      lastBuildError = `Gemini API error: ${apiErr.message}`;
      continue;
    }

    const fixData = cleanAndParseJSON(responseText);

    if (!fixData || !Array.isArray(fixData.fixedFiles)) {
      console.warn('⚠️  Invalid or empty JSON response from Gemini:');
      console.warn(responseText.slice(0, 400));
      lastBuildError = 'Response was not valid JSON with a fixedFiles array. Return ONLY the JSON object.';
      continue;
    }

    if (fixData.fixedFiles.length === 0) {
      console.log('ℹ️  Gemini found no code changes necessary for this issue.');
      console.log(`   Diagnosis: ${fixData.diagnosis}`);
      // Write a summary so the workflow can still comment on the issue
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
    }
  }

  console.error(`❌ Agent exceeded ${maxAttempts} attempts without a passing build.`);
  process.exit(1);
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
    // Strip any accidental markdown fences
    const cleaned = raw
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();
    return JSON.parse(cleaned);
  } catch {
    // Try to extract the first JSON object
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
