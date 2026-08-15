# 🌐 Professional Friend — 3D AI Interviewer & Biometric Interaction Platform

<div align="center">

**An intelligent 3D AI Interviewer and Conversational Avatar fusing real-time computer vision, multi-band phonetic lip-sync, and multi-tier LLM intelligence.**

[![React](https://img.shields.io/badge/React-18.x-61DAFB?logo=react)](https://reactjs.org/)
[![Three.js](https://img.shields.io/badge/Three.js-WebGL-black?logo=three.js)](https://threejs.org/)
[![Vite](https://img.shields.io/badge/Vite-6.x-646CFF?logo=vite)](https://vitejs.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript)](https://www.typescriptlang.org/)
[![Mistral AI](https://img.shields.io/badge/Mistral_AI-Large-FF7000)](https://mistral.ai/)
[![Google Gemini](https://img.shields.io/badge/Google_Gemini-2.5_Flash-8E75B2?logo=google)](https://ai.google.dev/)
[![Deepgram](https://img.shields.io/badge/Deepgram-Aura_TTS_%26_Nova--2-13EF93)](https://deepgram.com/)

</div>

---

## ✨ Features

- 🎭 **3D Ready Player Me Avatar (`aura.glb`)**: Full Apple ARKit 52 blendshape facial animation with bone retargeting and realistic rendering in Three.js.
- 🏢 **Dual 3D Environments & Cyber Chair**:
  - **Interview Mode**: Interactive modern office environment with desk, laptop, lamp, bookshelf, city skyline view, and cyber chair sitting pose.
  - **Chat Mode**: Twilight nature landscape with trees, rocks, flowers, and glowing fireflies.
- 🗣️ **Realistic Multi-Band Lip-Sync**:
  - Web Audio API FFT Formant Analyser for instant vowel/consonant mouth shaping (`jawOpen`, `mouthFunnel`, `mouthSmile`, `mouthPucker`).
  - NVIDIA Audio2Face & Convai NeuroSync blendshape integration.
- 🎯 **Real-Time Technical Interviewer**:
  - Dynamic 15-question interview bank generated for any company (*Google, Meta, Apple, OpenAI, etc.*) and role across Coding, System Design, STAR Behavioral, and Domain Specifics.
  - Powered by **Mistral Large** (`mistral-large-latest`) and **Gemini 2.5 Flash** with live Google Search citations.
- 👁️ **Biometric Emotion & Attention Tracking**:
  - Real-time webcam face tracking using **MediaPipe FaceLandmarker** and object detection with **TensorFlow.js COCO-SSD**.
  - Natural character movements: conversational head nods while speaking, attentive listening tilt, and autonomous eye blinking.
- 🎙️ **Ultra-Low Latency Speech Pipeline**:
  - Deepgram Nova-2 STT (with Groq Whisper fallback).
  - Deepgram Aura TTS with parallel sentence streaming.

---

## 🛠️ Tech Stack

- **Frontend**: React 18, TypeScript, Vite, Tailwind CSS, Motion (Framer Motion), Lucide Icons
- **3D & Graphics**: Three.js, GLTFLoader, FBXLoader, OrbitControls
- **Vision & ML**: MediaPipe Tasks Vision, TensorFlow.js COCO-SSD
- **Audio & Speech**: Web Audio API (AnalyserNode), Tone.js, Deepgram API, Cartesia WebSocket TTS
- **AI Models**: Mistral AI Large, Google Gemini 2.5 Flash, NVIDIA NIM & Audio2Face

---

## 🚀 Quick Start

### 1. Prerequisites
- **Node.js** (v18 or higher recommended)
- **npm** or **yarn**

### 2. Installation
```bash
# Clone the repository
git clone https://github.com/jama7777/Professional_friend.git
cd Professional_friend

# Install dependencies
npm install
```

### 3. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Fill in your API keys in `.env`:
```env
GEMINI_API_KEY="your_gemini_api_key"
MISTRAL_API_KEY="your_mistral_api_key"
DEEPGRAM_API_KEY="your_deepgram_api_key"
CARTESIA_API_KEY="your_cartesia_api_key"
```

### 4. Run Locally
Start the standalone Vite application:

```bash
npm run dev
```

Open [http://localhost:3000/](http://localhost:3000/) in your browser.

---

## 📁 Repository Structure

```text
Professional_friend/
├── .env.example              # Single-entry environment variables template
├── .gitignore                # Optimized Git ignore file (excludes secrets & private spreadsheets)
├── package.json              # Project scripts & dependencies
├── tsconfig.json             # TypeScript configuration
├── vite.config.ts            # Vite standalone proxy & bundler settings
├── index.html                # App entry HTML
├── docs/                     # Architectural and technical documentation
│   ├── FRAMEWORKS_AND_INBUILT_SYSTEM_DOC.md  # Framework and system architecture
│   ├── PROJECT_ACTIVITIES_MATRIX.md          # Technical specifications and matrices
│   └── internal/             # (Gitignored) Private company documents & spreadsheets
├── src/
│   ├── main.tsx              # React mounting with ErrorBoundary
│   ├── App.tsx               # Core application, 3D scene, biometrics & state
│   ├── components/
│   │   └── InterviewDashboard.tsx  # Cyberpunk Glassmorphic Evaluation Dashboard
│   ├── services/
│   │   ├── db.ts             # IndexedDB local database service for interview history
│   │   └── evaluator.ts      # AI performance, depth & mistake scoring engine
│   ├── index.css             # Tailwind design system
│   └── vite-env.d.ts         # TypeScript environment types
└── public/
    └── models/
        ├── aura/
        │   └── aura.glb      # Ready Player Me 3D Avatar
        └── animations/       # Mixamo FBX gesture & sitting animations
            ├── Standing Greeting.fbx
            ├── Talking.fbx
            ├── Happy.fbx
            ├── Clapping.fbx
            ├── Hip Hop Dancing.fbx
            └── Sitting_interview_position@1.fbx
```

---

## 📜 License
This project is licensed under the [MIT License](LICENSE).
