# 📘 Professional Friend — Technical Frameworks, Inbuilt Architecture & Error Resolution Guide

This document provides a comprehensive technical breakdown of **all frameworks, third-party libraries, and native/inbuilt browser and Node.js technologies** used in **Professional Friend**, formatted in alignment with the team's `Daily Activities.xlsx` architecture standards.

---

## 🛠️ Section 1: Third-Party Frameworks & Libraries

| Library / Package | Version | Classification | What It Is & Why It Was Chosen |
|---|---|---|---|
| **`three`** | `^0.184.0` | 3D Graphics Engine | **WebGL-based 3D scene renderer**. Powers the 3D Ready Player Me avatar (`aura.glb`), realistic PBR lighting (Hemisphere, Directional, Point lights), PMREM room environment, shadows, OrbitControls, and skeletal mesh skinning. Direct WebGL is too low-level; Three.js provides the ideal balance of performance and control. |
| **`@mediapipe/tasks-vision`** | `^0.10.32` | ML Vision Tracking | **Google MediaPipe FaceLandmarker**. Runs client-side WASM neural networks at 60 FPS to detect **478 3D facial landmarks**, gaze vector, and 52 facial blendshapes from the webcam stream without sending video to external servers (zero latency + 100% privacy). |
| **`@tensorflow/tfjs`** & **`@tensorflow-models/coco-ssd`** | `^4.22.0` / `^2.2.3` | Real-Time Object Detection | **TensorFlow.js COCO-SSD**. Detects physical objects in the candidate's video feed (e.g., laptop, cell phone, book, chair, person) to provide real-time environmental context for conversational grounding. |
| **`@google/genai`** | `^1.29.0` | Multi-Modal LLM SDK | **Google Gemini 2.5 Flash SDK**. Provides streaming generation and live **Google Search Grounding** (`tools: [{ googleSearch: {} }]`) to pull real-time verified interview discussions and source URLs directly from Google search index. |
| **`express`** | `^4.21.2` | Backend HTTP Server | **Lightweight Node.js REST API**. Runs on port `3001` to serve secure backend relays (`/api/mistral-chat`, `/api/nim-agent`) and proxy WebSocket/HTTP connections, preventing browser CORS issues and protecting API keys. |
| **`http-proxy-middleware`** | `^3.0.5` | Reverse Proxy | Proxies requests from Express to external AI APIs (Groq, Mistral, Deepgram, Cartesia) transparently. |
| **`dotenv`** | `^17.2.3` | Configuration | Loads variables from `.env` into `process.env` at server initialization. |
| **`lucide-react`** | `^0.546.0` | UI Icons | SVG iconography (Camera, Play, Send, Mic, Info, Speaker, Activity, Bot, User, etc.) with tree-shaking support. |
| **`motion`** *(Framer Motion)* | `^12.34.4` | UI Motion Engine | Hardware-accelerated transitions, floating control overlays, slide-out interview sidebars, and smooth loading spinners. |
| **`tone`** | `^15.1.22` | Web Audio Synthesis | Micro-synthesizers for user feedback (button hover frequencies, chime ramps, and tone pulses). |
| **`@convai/web-sdk`** | `^1.3.0` | Conversational 3D Sync | Integrates with Convai WebSockets for real-time blendshape streaming when Convai mode is enabled. |
| **`react`** & **`react-dom`** | `^19.0.0` | Frontend UI Framework | Component-based reactive UI state management. |
| **`vite`** & **`@vitejs/plugin-react`** | `^6.2.0` | Build & Dev Tooling | Ultra-fast Hot Module Replacement (HMR) bundler and multi-prefix environment manager (`envPrefix`). |
| **`tailwindcss`** & **`@tailwindcss/vite`** | `^4.1.14` | CSS Design System | Next-gen zero-config CSS framework for responsive dark-mode styling and glassmorphism. |

---

## ⚡ Section 2: Inbuilt & Native Technologies (No External Libraries Needed)

These capabilities run entirely on **native Web Standards and Node.js built-ins**:

| Inbuilt Technology | Standard / Runtime | How It Works & Why It Is Used |
|---|---|---|
| **Web Audio API (`AudioContext`, `AnalyserNode`)** | Native Browser Web Standard | **Powers real-time lip-sync**. Connects audio stream through an `AnalyserNode` with FFT size 2048 to extract live RMS volume and frequency formants (200Hz–800Hz for vowels, 800Hz–2500Hz for front vowels, 3000Hz–8000Hz for fricatives) without needing heavy external speech-to-viseme libraries. |
| **`MediaDevices.getUserMedia()`** | Native Browser WebRTC Standard | Captures high-definition camera video and microphone audio directly from the operating system with hardware acceleration. |
| **Three.js `GLTFLoader` & `FBXLoader`** | Standard 3D Loaders | Directly loads binary `.glb` Ready Player Me avatars and retargets Mixamo `.fbx` bone rotation tracks in-browser. |
| **Apple ARKit 52 Blendshape Spec** | 3D Morph Target Standard | Morph target dictionary on `Wolf3D_Avatar` meshes (`jawOpen`, `mouthFunnel`, `mouthSmile`, `mouthPucker`, `eyeBlinkLeft/Right`) driven frame-by-frame in `requestAnimationFrame`. |
| **`AbortController` & `fetch` Streaming** | Native JavaScript API | Manages request timeouts (30s abort timers) and reads token streams chunks with zero dependency overhead. |
| **Node.js `http`, `crypto`, `stream`** | Node.js Built-in Modules | Handles process piping, UUID generation, and WebSocket upgrades in `server.ts`. |

---

## ⚠️ Section 3: Diagnosis & Resolution of Known Errors

| Error Encountered | Root Cause | How It Was Fixed in Code |
|---|---|---|
| **1. 504 / 503 API Timeout on Mistral Calls** | Direct browser-to-Mistral HTTPS requests suffered from network latency and browser preflight (OPTIONS) overhead. | **Created Express Relay (`/api/mistral-chat`)** in `server.ts` with 30s timeout and server-side relaying to Mistral API. |
| **2. Gemini 404 (`gemini-2.0-flash is no longer available`)** | Google deprecated the `gemini-2.0-flash` model endpoint on `v1beta`. | **Upgraded model to `gemini-2.5-flash`** in `src/App.tsx`, fully restoring Google Search Grounding with verified source links. |
| **3. Avatar Facing Backward** | Adding `object.rotation.y = Math.PI` to the GLB loader collided with Mixamo animation bone tracks (which are already baked facing front). | **Reset `object.rotation.y = 0`** in `AvatarViewer`, ensuring character faces front at all times. |
| **4. Character Standing Stiff / No Animations** | Ready Player Me GLB files do not contain embedded animation clips (`gltf.animations` is empty). | **Added Mixamo FBX Animation Loader** (`Standing Greeting`, `Talking`, `Happy`, `Clapping`, `Dancing`, `Sitting_interview_position`) with automatic bone name retargeting (`mixamorig` prefix stripper). |
| **5. Excessive Mouth Opening (Mouth Wide Open)** | Previous RMS multipliers (`audioVol * 2.8` and `A2F * 5.0`) pushed `jawOpen` to `1.0` (100% max jaw drop). | **Calibrated conversational bounds**: Capped `jawOpen` to a realistic `0.35` maximum, combined with frequency formant shaping (`mouthFunnel`, `mouthSmile`, `mouthPucker`). |
| **6. Git Merge Conflicts in `README.md`** | Unresolved conflict markers (`<<<<<<< HEAD`, `=======`). | **Re-authored clean `README.md`**, removed scratch files, and attributed commits to `jamadagni` (`jama7777`). |

---

## 🚀 Section 4: Daily Operational Workflow & Execution Commands

### Starting the Application:
```bash
# 1. Start Backend Express Relay (Port 3001)
npm run dev:server

# 2. Start Frontend Vite Application (Port 3000)
npm run dev
```

### Accessing the Platform:
- **Frontend URL**: `http://localhost:3000/`
- **Backend Health Check**: `http://localhost:3001/`
