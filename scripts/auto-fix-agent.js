// Autonomous Auto-Fix Agent for Professional Friend
// Powered by Google Gemini 2.5 Flash inside GitHub Actions

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { GoogleGenAI } from '@google/genai';

async function main() {
  const geminiKey = process.env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY;
  const issueTitle = process.env.ISSUE_TITLE || 'Bug Report';
  const issueBody = process.env.ISSUE_BODY || 'No description provided';
  const issueNumber = process.env.ISSUE_NUMBER || 'test';

  if (!geminiKey) {
    console.error('❌ Error: GEMINI_API_KEY is not configured in repository secrets.');
    process.exit(1);
  }

  console.log(`🤖 Starting Autonomous AI Auto-Fix Agent for Issue #${issueNumber}...`);
  console.log(`📌 Title: "${issueTitle}"`);
  console.log(`📝 Description Preview: ${issueBody.slice(0, 200)}...`);

  const client = new GoogleGenAI({ apiKey: geminiKey });

  // 1. Gather repository context & file list
  const srcFiles = getSourceFiles('./src');
  console.log(`📂 Scanning ${srcFiles.length} source files for context...`);

  const fileContents = {};
  for (const f of srcFiles) {
    fileContents[f] = fs.readFileSync(f, 'utf8');
  }

  const systemPrompt = `You are a Principal Staff Software Engineer & Autonomous Code Repair Agent.
You are tasked with diagnosing and fixing a bug reported in this repository.

Repository Context:
- Tech Stack: React 19, TypeScript, Vite, Tailwind CSS, Three.js, Web Audio, @google/genai, IndexedDB.
- Available Source Files:
${Object.keys(fileContents).map(f => `- ${f}`).join('\n')}

INSTRUCTIONS:
1. Carefully analyze the issue title, error message, stack trace, and user description.
2. Identify the root cause in the source code.
3. Provide the full replacement content for the affected files that fixes the bug cleanly without breaking other features.
4. Ensure the updated code strictly compiles in TypeScript with 0 lint errors and builds in Vite.

RESPONSE FORMAT:
Respond ONLY with a valid JSON object matching this exact schema:
{
  "diagnosis": "Detailed 2-3 sentence explanation of the root cause and why it occurred.",
  "fixedFiles": [
    {
      "filePath": "relative path to file, e.g. src/App.tsx",
      "content": "the complete, entire updated file content including imports and comments"
    }
  ],
  "commitMessage": "Concise git commit message, e.g. fix: resolve null reference in interview evaluation flow",
  "prDescription": "Markdown formatted description explaining the bug, root cause, and how it was fixed."
}
Do not wrap in extra markdown text outside the JSON.`;

  const userPrompt = `Issue #${issueNumber}:
Title: ${issueTitle}
Body / Error Details:
${issueBody}

Source Code of Repository:
${Object.entries(fileContents).map(([f, code]) => `=== FILE: ${f} ===\n${code}\n=== END OF FILE ===`).join('\n\n')}

Analyze and generate the complete automated code fix in JSON format.`;

  let attempts = 0;
  const maxAttempts = 3;
  let lastBuildError = '';

  while (attempts < maxAttempts) {
    attempts++;
    console.log(`\n🧠 AI Analysis & Fix Generation (Attempt ${attempts}/${maxAttempts})...`);

    const promptWithErrors = lastBuildError
      ? `${userPrompt}\n\n⚠️ PREVIOUS ATTEMPT FAILED WITH BUILD ERROR:\n${lastBuildError}\nPlease correct the code to eliminate this build error.`
      : userPrompt;

    const response = await client.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          role: 'user',
          parts: [{ text: `${systemPrompt}\n\n${promptWithErrors}` }]
        }
      ],
      config: {
        responseMimeType: 'application/json',
        temperature: 0.1
      }
    });

    const responseText = response.text || '';
    const fixData = cleanAndParseJSON(responseText);

    if (!fixData || !Array.isArray(fixData.fixedFiles) || fixData.fixedFiles.length === 0) {
      console.warn('⚠️ AI did not propose file modifications or invalid JSON format.');
      lastBuildError = 'Invalid response structure from AI. Provide fixedFiles array with valid file contents.';
      continue;
    }

    console.log(`🔍 AI Diagnosis: ${fixData.diagnosis}`);

    // Apply the proposed fixes
    for (const fileFix of fixData.fixedFiles) {
      const targetPath = path.resolve(fileFix.filePath);
      console.log(`📝 Applying fix to ${fileFix.filePath}...`);
      fs.writeFileSync(targetPath, fileFix.content, 'utf8');
    }

    // Verify build
    console.log('🧪 Running automated verification: tsc --noEmit && vite build...');
    try {
      execSync('npm run lint', { stdio: 'pipe' });
      execSync('npm run build', { stdio: 'pipe' });
      console.log('✅ Automated verification PASSED (0 errors)!');

      // Save summary artifact for GitHub Actions step outputs
      fs.writeFileSync('auto-fix-summary.json', JSON.stringify({
        diagnosis: fixData.diagnosis,
        commitMessage: fixData.commitMessage || `fix: auto-resolve issue #${issueNumber}`,
        prDescription: fixData.prDescription || `Autonomous fix for issue #${issueNumber}\n\n**Diagnosis**: ${fixData.diagnosis}`,
        fixedFilesCount: fixData.fixedFiles.length
      }, null, 2));

      return;
    } catch (buildErr) {
      const errOutput = (buildErr.stdout?.toString() || '') + '\n' + (buildErr.stderr?.toString() || '') + '\n' + buildErr.message;
      console.warn(`❌ Verification failed on attempt ${attempts}:`);
      console.warn(errOutput.slice(0, 500));
      lastBuildError = errOutput.slice(0, 1000);
    }
  }

  console.error('❌ Auto-fix agent exceeded maximum attempts without producing a passing build.');
  process.exit(1);
}

function getSourceFiles(dir) {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
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
  try {
    const cleaned = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
    return JSON.parse(cleaned);
  } catch (e) {
    const match = raw.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch {}
    }
    return null;
  }
}

main().catch(err => {
  console.error('Fatal Auto-Fix Agent Error:', err);
  process.exit(1);
});
