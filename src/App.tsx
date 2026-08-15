import React, { Component, useEffect, useRef, useState } from 'react';
import { GoogleGenAI } from '@google/genai';
import { Camera, Square, Play, Music, Loader2, AlertCircle, Key, Activity, Cpu, ScanFace, Info, X, Send, MessageSquare, User, Bot, Mic, MicOff, Volume2, VolumeX, ChevronDown, Globe } from 'lucide-react';
import * as tf from '@tensorflow/tfjs';
import * as cocoSsd from '@tensorflow-models/coco-ssd';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { motion, AnimatePresence } from 'motion/react';
import * as Tone from 'tone';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { ConvaiClient } from '@convai/web-sdk';


let hoverSynth: Tone.Synth | null = null;

async function initAudio() {
  if (Tone.context.state !== 'running') {
    await Tone.start().catch(() => { });
  }
  if (!hoverSynth) {
    hoverSynth = new Tone.Synth({
      oscillator: { type: 'sine' },
      envelope: { attack: 0.01, decay: 0.1, sustain: 0, release: 0.01 }
    }).toDestination();
    hoverSynth.volume.value = -15;
  }
}

declare global {
  interface Window {
    aistudio?: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

interface SmoothedBox {
  x: number;
  y: number;
  width: number;
  height: number;
  class: string;
  score: number;
  opacity: number;
  labelX: number;
  labelY: number;
}

export class ErrorBoundary extends Component<any, any> {
  state = { hasError: false, error: null };
  constructor(props: any) {
    super(props);
  }
  static getDerivedStateFromError(error: any) { return { hasError: true, error }; }
  componentDidCatch(error: any, errorInfo: any) { console.error("UI Error:", error, errorInfo); }
  render() {
    if ((this.state as any).hasError) {
      return (
        <div className="h-screen w-full bg-zinc-950 flex items-center justify-center p-8 text-center overflow-auto">
          <div className="max-w-2xl w-full">
            <h1 className="text-2xl font-bold text-red-500 mb-4 uppercase tracking-widest">System Critical Error</h1>
            <div className="bg-red-500/10 border border-red-500/30 p-6 rounded-lg text-left mb-6 font-mono text-xs">
              <p className="text-red-400 font-bold mb-2">EXCEPTION DETECTED:</p>
              <p className="text-red-200 break-words mb-4">{(this.state as any).error?.toString()}</p>
              <p className="text-red-400/60 leading-relaxed max-h-64 overflow-auto">{(this.state as any).error?.stack}</p>
            </div>
            <button onClick={() => window.location.reload()} className="px-10 py-3 bg-red-500/20 border border-red-500/50 text-red-400 hover:bg-red-500/30 transition-all font-bold uppercase tracking-widest">
              Reboot System
            </button>
          </div>
        </div>
      );
    }
    return (this as any).props.children;
  }
}

// Phoneme analysis result shared each frame
interface PhonemeFrame {
  jaw: number;       // 0-1 — overall mouth openness
  vowelOpen: number; // 0-1 — low-freq energy (A / O vowels)
  vowelFront: number;// 0-1 — mid-freq energy (E / I vowels)
  fricative: number; // 0-1 — high-freq energy (S / F / SH)
  isSpeaking: boolean;
}

class PCMPlayer {
  audioContext: AudioContext;
  // Two analysers: time-domain for RMS, freq-domain for phonemes
  analyser: AnalyserNode;       // time-domain (low smoothing for snap)
  fftAnalyser: AnalyserNode;    // freq-domain  (FFT 2048)
  nextStartTime: number;

  // Envelope follower state
  private _peakHold: number = 0;
  private _peakDecay: number = 0;
  private _envSmooth: number = 0;
  // Adaptive gain normalisation
  private _maxSeen: number = 0.01;

  constructor(sampleRate: number = 44100) {
    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate });

    // Time-domain analyser — minimal smoothing so envelope tracks transients
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.1;

    // FFT analyser — larger FFT for frequency resolution
    this.fftAnalyser = this.audioContext.createAnalyser();
    this.fftAnalyser.fftSize = 2048;
    this.fftAnalyser.smoothingTimeConstant = 0.5;

    // Chain: source → time analyser → fft analyser → destination
    this.analyser.connect(this.fftAnalyser);
    this.fftAnalyser.connect(this.audioContext.destination);

    this.nextStartTime = this.audioContext.currentTime;
  }

  async playChunk(base64Data: string) {
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
    try {
      const binaryString = atob(base64Data);
      const len = binaryString.length;
      const alignedLen = len - (len % 4);
      if (alignedLen <= 0) return;
      const bytes = new Uint8Array(alignedLen);
      for (let i = 0; i < alignedLen; i++) bytes[i] = binaryString.charCodeAt(i);
      const float32Array = new Float32Array(bytes.buffer);
      const audioBuffer = this.audioContext.createBuffer(1, float32Array.length, this.audioContext.sampleRate);
      audioBuffer.getChannelData(0).set(float32Array);
      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.analyser);
      const currentTime = this.audioContext.currentTime;
      if (this.nextStartTime < currentTime) this.nextStartTime = currentTime + 0.02;
      source.start(this.nextStartTime);
      this.nextStartTime += audioBuffer.duration;
    } catch (e) { console.error('PCMPlayer error:', e); }
  }

  // Returns RMS amplitude with peak-hold envelope follower (0-1)
  getVolume(): number {
    const data = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(data);
    let rms = 0;
    for (let i = 0; i < data.length; i++) rms += data[i] * data[i];
    rms = Math.sqrt(rms / data.length);

    // Adaptive max (tracks loudest moment, decays slowly)
    if (rms > this._maxSeen) this._maxSeen = rms;
    else this._maxSeen = Math.max(0.01, this._maxSeen * 0.9995);

    // Normalise 0-1 relative to speaker's own loudness
    const norm = Math.min(1, rms / this._maxSeen);

    // Peak hold: attack instant, hold 80ms, release 300ms
    if (norm >= this._peakHold) {
      this._peakHold = norm;
      this._peakDecay = 0;
    } else {
      this._peakDecay++;
      if (this._peakDecay > 5) this._peakHold = Math.max(0, this._peakHold - 0.04);
    }

    // Smooth envelope: fast attack (lerp 0.6), slow release (lerp 0.08)
    this._envSmooth = norm > this._envSmooth
      ? this._envSmooth + (norm - this._envSmooth) * 0.6
      : this._envSmooth + (norm - this._envSmooth) * 0.08;

    return this._envSmooth;
  }

  // Returns per-phoneme frequency band energies — call ONCE per frame
  getPhonemeFrame(): PhonemeFrame {
    const jaw = this.getVolume();
    const isSpeaking = jaw > 0.05;

    if (!isSpeaking) return { jaw: 0, vowelOpen: 0, vowelFront: 0, fricative: 0, isSpeaking: false };

    const freqData = new Uint8Array(this.fftAnalyser.frequencyBinCount);
    this.fftAnalyser.getByteFrequencyData(freqData);
    const nyquist = this.audioContext.sampleRate / 2;
    const binHz = nyquist / freqData.length;

    // Helper: average energy in Hz range (0-255 per bin)
    const bandEnergy = (loHz: number, hiHz: number) => {
      const lo = Math.floor(loHz / binHz);
      const hi = Math.min(freqData.length - 1, Math.ceil(hiHz / binHz));
      let sum = 0;
      for (let i = lo; i <= hi; i++) sum += freqData[i];
      return sum / ((hi - lo + 1) * 255);
    };

    // Phoneme frequency bands for English speech:
    // Open vowels (A/O/AH): fundamental + 1st formant 200–800 Hz
    const vowelOpen = Math.min(1, bandEnergy(200, 800) * 2.5);
    // Front vowels (E/I/EE): 2nd formant 800–2500 Hz
    const vowelFront = Math.min(1, bandEnergy(800, 2500) * 2.8);
    // Fricatives (S/F/SH/TH): 3000–8000 Hz
    const fricative = Math.min(1, bandEnergy(3000, 8000) * 3.5);

    return { jaw, vowelOpen, vowelFront, fricative, isSpeaking };
  }

  stop() {
    if (this.audioContext.state !== 'closed') this.audioContext.close();
  }
}

class ProceduralMusicEngine {
  audioContext: AudioContext;
  isPlaying: boolean = false;
  currentVibe: string = 'minimalist ambient drone, quiet';
  targetVibe: string = 'minimalist ambient drone, quiet';
  vibeBlend: number = 1.0;
  nextNoteTime: number = 0;
  timerID: number | null = null;

  // Scales (intervals from root)
  scales: Record<string, number[]> = {
    major: [0, 2, 4, 5, 7, 9, 11],
    minor: [0, 2, 3, 5, 7, 8, 10],
    pentatonic: [0, 2, 4, 7, 9],
    cyberpunk: [0, 3, 7, 8, 10], // Phrygian dominant-ish
    drone: [0, 7], // Just roots and fifths
    melancholic: [0, 2, 3, 7, 8], // Minor pentatonic-ish
    dissonant: [0, 1, 6, 7, 11], // For fear/disgust
    tribal: [0, 3, 5, 7, 10] // Minor pentatonic
  };

  constructor() {
    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  }

  setVibe(vibe: string) {
    if (this.targetVibe !== vibe) {
      if (this.vibeBlend >= 1.0) {
        this.currentVibe = this.targetVibe;
      }
      this.targetVibe = vibe;
      this.vibeBlend = 0.0;
    }
  }

  start() {
    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
    this.isPlaying = true;
    this.nextNoteTime = this.audioContext.currentTime + 0.1;
    this.scheduleNext();
  }

  stop() {
    this.isPlaying = false;
    if (this.timerID !== null) {
      clearTimeout(this.timerID);
      this.timerID = null;
    }
    if (this.audioContext.state !== 'closed') {
      this.audioContext.close();
    }
  }

  playNote(freq: number, type: OscillatorType, duration: number, vol: number, attack: number, time: number) {
    if (this.audioContext.state === 'closed') return;

    // Create multiple oscillators for a thicker soundscape
    const numOscs = 4;
    const masterGain = this.audioContext.createGain();
    masterGain.connect(this.audioContext.destination);

    const now = time;
    masterGain.gain.setValueAtTime(0, now);
    masterGain.gain.linearRampToValueAtTime(vol, now + attack);
    masterGain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    // Add a subtle reverb effect using a convolver or just delay
    const delay = this.audioContext.createDelay();
    delay.delayTime.value = 0.33;
    const feedback = this.audioContext.createGain();
    feedback.gain.value = 0.4;
    delay.connect(feedback);
    feedback.connect(delay);
    delay.connect(masterGain);

    for (let i = 0; i < numOscs; i++) {
      const osc = this.audioContext.createOscillator();
      const filter = this.audioContext.createBiquadFilter();

      osc.type = i % 2 === 0 ? type : 'sine';
      osc.frequency.value = freq * (1 + (i * 0.008)); // Slight detune

      filter.type = 'lowpass';
      filter.frequency.value = freq * 2;
      filter.frequency.linearRampToValueAtTime(freq * 6, now + attack);
      filter.frequency.linearRampToValueAtTime(freq * 1.5, now + duration);

      osc.connect(filter);
      filter.connect(masterGain);
      filter.connect(delay); // Send to delay for space

      osc.start(now);
      osc.stop(now + duration);
    }
  }

  getTempoForVibe(vibe: string): number {
    if (vibe.includes('tribal') || vibe.includes('rhythmic')) return 100;
    if (vibe.includes('cyberpunk') || vibe.includes('electronic')) return 60;
    return 40;
  }

  scheduleNext() {
    if (!this.isPlaying) return;

    if (this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }

    while (this.nextNoteTime < this.audioContext.currentTime + 0.5) {
      if (this.vibeBlend < 1.0) {
        this.vibeBlend += 0.02; // crossfade over 50 notes for a much smoother transition
        if (this.vibeBlend > 1.0) this.vibeBlend = 1.0;
      }

      if (this.vibeBlend < 1.0) {
        // Equal power crossfade for smoother audio blending
        const currentWeight = Math.cos(this.vibeBlend * 0.5 * Math.PI);
        const targetWeight = Math.sin(this.vibeBlend * 0.5 * Math.PI);
        this.generateTickForVibe(this.currentVibe, currentWeight, this.nextNoteTime);
        this.generateTickForVibe(this.targetVibe, targetWeight, this.nextNoteTime);
      } else {
        this.generateTickForVibe(this.targetVibe, 1.0, this.nextNoteTime);
      }

      // Smoothly interpolate tempo
      const currentTempo = this.getTempoForVibe(this.currentVibe);
      const targetTempo = this.getTempoForVibe(this.targetVibe);
      const tempo = currentTempo * (1 - this.vibeBlend) + targetTempo * this.vibeBlend;

      const secondsPerBeat = 60.0 / tempo;
      this.nextNoteTime += secondsPerBeat; // Quarter notes
    }

    this.timerID = window.setTimeout(() => this.scheduleNext(), 50);
  }

  generateTickForVibe(vibe: string, weight: number, time: number) {
    if (weight <= 0.01) return;

    const isCyberpunk = vibe.includes('cyberpunk') || vibe.includes('electronic');
    const isTribal = vibe.includes('tribal') || vibe.includes('rhythmic') || vibe.includes('happy');
    const isAcoustic = vibe.includes('acoustic') || vibe.includes('guitar');
    const isAmbient = vibe.includes('ambient') || vibe.includes('drone');
    const isSad = vibe.includes('sad') || vibe.includes('melancholy');
    const isTense = vibe.includes('angry') || vibe.includes('fear') || vibe.includes('disgust');

    let scale = this.scales.pentatonic;
    let baseNote = 48; // C3
    let oscType: OscillatorType = 'sine';
    let vol = 0.08;
    let duration = 6.0; // Longer durations for soundscape
    let attack = 3.0;

    if (isCyberpunk) {
      scale = this.scales.cyberpunk;
      baseNote = 36; // C2
      oscType = 'sawtooth';
      vol = 0.04;
      duration = 4.0;
      attack = 2.0;
    } else if (isTribal) {
      scale = this.scales.tribal;
      baseNote = 43; // G2
      oscType = 'square';
      vol = 0.06;
      duration = 1.5;
      attack = 0.1;
    } else if (isSad) {
      scale = this.scales.melancholic;
      baseNote = 48;
      oscType = 'sine';
      vol = 0.08;
      duration = 8.0;
      attack = 4.0;
    } else if (isTense) {
      scale = this.scales.dissonant;
      baseNote = 36;
      oscType = 'sawtooth';
      vol = 0.05;
      duration = 5.0;
      attack = 1.5;
    } else if (isAcoustic) {
      scale = this.scales.major;
      baseNote = 48;
      oscType = 'sine';
      vol = 0.08;
      duration = 5.0;
      attack = 2.0;
    } else if (isAmbient) {
      scale = this.scales.drone;
      baseNote = 36;
      oscType = 'sine';
      vol = 0.12;
      duration = 10.0;
      attack = 5.0;
    }

    vol *= weight; // Apply crossfade weight

    // Randomly play a note from the scale
    if (Math.random() > 0.2) {
      const noteIndex = scale[Math.floor(Math.random() * scale.length)];
      const freq = 440 * Math.pow(2, (baseNote + noteIndex - 69) / 12);
      this.playNote(freq, oscType, duration, vol, attack, time);
    }

    // Add a bass drone
    if (Math.random() > 0.5) {
      const bassFreq = 440 * Math.pow(2, (baseNote - 12 - 69) / 12);
      this.playNote(bassFreq, 'sine', duration * 2, vol * 1.5, attack * 2, time);
    }
  }
}

// Soundscape generation features removed.

interface Message {
  role: 'user' | 'assistant';
  content: string;
  groundingSources?: Array<{ title: string; url: string }>;
  searchQueries?: string[];
}

// Strip Mixamo's mixamorig prefix so tracks match RPM bone names (Hips, Spine, etc.)
// Also remove Hips.position tracks — Mixamo root translation doesn't match RPM bind pose.
function retargetMixamoClip(clip: THREE.AnimationClip): THREE.AnimationClip {
  clip.tracks = clip.tracks
    .filter(track => !track.name.match(/mixamorigHips\.position/i))
    .map(track => {
      track.name = track.name.replace(/^mixamorig[:\s]?/i, '');
      return track;
    });
  return clip;
}

// Normal-chat animation playlist (Mixamo FBX paths)
const CHAT_ANIMATIONS = [
  '/models/animations/Standing Greeting.fbx',
  '/models/animations/Talking.fbx',
  '/models/animations/Happy.fbx',
  '/models/animations/Clapping.fbx',
  '/models/animations/Hip Hop Dancing.fbx',
];

// Interview mode: sitting animation
const INTERVIEW_SIT_ANIM = '/models/animations/Sitting_interview_position@1.fbx';

// --- Avatar Viewer Component (Full 3D Scene + Office + Chair + Animations) ---
const AvatarViewer = ({ isInterviewActive, chairRef, isUserTyping, status, playerRef, jawValueRef, a2fAnimRef }: {
  isInterviewActive: boolean,
  chairRef: React.MutableRefObject<THREE.Group | null>,
  isUserTyping: boolean,
  status: string,
  playerRef: React.MutableRefObject<PCMPlayer | null>,
  jawValueRef: React.MutableRefObject<number>,
  a2fAnimRef: React.MutableRefObject<{ frames: number[][], fps: number, startTime: number } | null>
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const clockRef = useRef<THREE.Clock>(new THREE.Clock());
  const [isLoaded, setIsLoaded] = useState(false);
  const [progress, setProgress] = useState(0);
  const avatarRef = useRef<THREE.Group | null>(null);
  const officeGroupRef = useRef<THREE.Group | null>(null);
  const natureGroupRef = useRef<THREE.Group | null>(null);
  const jawBoneRef = useRef<THREE.Object3D | null>(null);
  const lipSyncMeshesRef = useRef<THREE.Mesh[]>([]);
  const smoothJawRef = useRef(0);
  const chatAnimIndexRef = useRef(0);
  const isInterviewActiveRef = useRef(isInterviewActive);
  const isUserTypingRef = useRef(isUserTyping);
  const statusRef = useRef(status);

  useEffect(() => {
    isUserTypingRef.current = isUserTyping;
    statusRef.current = status;
  }, [isUserTyping, status]);

  useEffect(() => {
    isInterviewActiveRef.current = isInterviewActive;
  }, [isInterviewActive]);

  // Helper: load a Mixamo FBX, retarget bone names, play on mixer
  const playFBXAnim = (path: string, loop: THREE.AnimationActionLoopStyles, clamp = false) => {
    if (!mixerRef.current) return;
    const fbxLoader = new FBXLoader();
    fbxLoader.load(path, (anim) => {
      if (!mixerRef.current || !anim.animations.length) return;
      const clip = retargetMixamoClip(anim.animations[0]);
      mixerRef.current.stopAllAction();
      const action = mixerRef.current.clipAction(clip);
      action.setLoop(loop, loop === THREE.LoopOnce ? 1 : Infinity);
      action.clampWhenFinished = clamp;
      action.reset().fadeIn(0.3).play();
    }, undefined, (err) => {
      console.warn('Failed to load FBX:', path, err);
    });
  };

  // Play next chat animation in round-robin order
  const playNextChatAnim = () => {
    if (!mixerRef.current) return;
    const path = CHAT_ANIMATIONS[chatAnimIndexRef.current % CHAT_ANIMATIONS.length];
    chatAnimIndexRef.current++;
    const fbxLoader = new FBXLoader();
    fbxLoader.load(path, (anim) => {
      if (!mixerRef.current || !anim.animations.length) return;
      if (isInterviewActiveRef.current) return;
      const clip = retargetMixamoClip(anim.animations[0]);
      mixerRef.current.stopAllAction();
      const action = mixerRef.current.clipAction(clip);
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = false;
      action.reset().fadeIn(0.3).play();

      const onFinish = () => {
        mixerRef.current?.removeEventListener('finished', onFinish);
        if (!isInterviewActiveRef.current) playNextChatAnim();
      };
      mixerRef.current.addEventListener('finished', onFinish);
    }, undefined, (err) => {
      console.warn('Failed to load chat anim:', path, err);
      setTimeout(playNextChatAnim, 1000);
    });
  };

  // Switch environment and animation when interview mode changes
  useEffect(() => {
    isInterviewActiveRef.current = isInterviewActive;
    if (chairRef.current) {
      chairRef.current.visible = isInterviewActive;
    }
    if (officeGroupRef.current) {
      officeGroupRef.current.visible = isInterviewActive;
    }
    if (natureGroupRef.current) {
      natureGroupRef.current.visible = !isInterviewActive;
    }
    if (rendererRef.current) {
      rendererRef.current.setClearColor(isInterviewActive ? 0x000000 : 0x070c18, isInterviewActive ? 0.0 : 1.0);
    }
    if (avatarRef.current) {
      if (isInterviewActive) {
        avatarRef.current.position.set(0, -0.18, -0.18);
      } else {
        avatarRef.current.position.set(0, 0, 0);
      }
      avatarRef.current.rotation.y = 0;
    }

    if (!isLoaded || !mixerRef.current) return;
    if (isInterviewActive) {
      playFBXAnim(INTERVIEW_SIT_ANIM, THREE.LoopOnce, true);
    } else {
      chatAnimIndexRef.current = 0;
      playNextChatAnim();
    }
  }, [isInterviewActive, isLoaded]);

  const createOfficeEnvironment = (scene: THREE.Scene) => {
    const officeGroup = new THREE.Group();
    officeGroup.name = "officeEnvironment";

    // 1. Floor (Polished Dark Slate)
    const floorGeo = new THREE.PlaneGeometry(10, 10);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x14161d,
      roughness: 0.35,
      metalness: 0.2
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = 0;
    floor.receiveShadow = true;
    officeGroup.add(floor);

    const floorGrid = new THREE.GridHelper(10, 10, 0x1d212a, 0x1d212a);
    floorGrid.position.set(0, 0.002, 0);
    officeGroup.add(floorGrid);

    // 2. Back Wall (Charcoal Gray)
    const wallGeo = new THREE.PlaneGeometry(10, 6);
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x0c0d10,
      roughness: 0.8,
      metalness: 0.1
    });
    const backWall = new THREE.Mesh(wallGeo, wallMat);
    backWall.position.set(0, 3, -3);
    backWall.receiveShadow = true;
    officeGroup.add(backWall);

    // Vertical slats for architectural depth
    const slatGeo = new THREE.BoxGeometry(0.08, 6, 0.03);
    const slatMat = new THREE.MeshStandardMaterial({
      color: 0x171921,
      roughness: 0.5,
      metalness: 0.3
    });
    for (let i = -5; i <= 5; i++) {
      if (i >= -2 && i <= 2) continue; // Skip center window
      const slat = new THREE.Mesh(slatGeo, slatMat);
      slat.position.set(i * 0.45, 3, -2.85);
      slat.castShadow = true;
      slat.receiveShadow = true;
      officeGroup.add(slat);
    }

    // 3. Side Walls
    const leftWall = new THREE.Mesh(wallGeo, wallMat);
    leftWall.rotation.y = Math.PI / 2;
    leftWall.position.set(-5, 3, 2);
    officeGroup.add(leftWall);

    const rightWall = new THREE.Mesh(wallGeo, wallMat);
    rightWall.rotation.y = -Math.PI / 2;
    rightWall.position.set(5, 3, 2);
    officeGroup.add(rightWall);

    // 4. Large Office Window with Neon Trim
    const windowFrameGeo = new THREE.BoxGeometry(4, 2.5, 0.05);
    const windowFrameMat = new THREE.MeshStandardMaterial({ color: 0x060709, roughness: 0.5 });
    const windowFrame = new THREE.Mesh(windowFrameGeo, windowFrameMat);
    windowFrame.position.set(0, 1.8, -2.95);
    officeGroup.add(windowFrame);

    const skyGeo = new THREE.PlaneGeometry(3.9, 2.4);
    const skyMat = new THREE.MeshBasicMaterial({ color: 0x020206 });
    const sky = new THREE.Mesh(skyGeo, skyMat);
    sky.position.set(0, 1.8, -2.93);
    officeGroup.add(sky);

    // City Skyline
    for (let i = 0; i < 8; i++) {
      const w = 0.2 + Math.random() * 0.3;
      const h = 0.8 + Math.random() * 1.4;
      const buildingGeo = new THREE.BoxGeometry(w, h, 0.08);
      const buildingMat = new THREE.MeshStandardMaterial({ color: 0x05060d, roughness: 0.9 });
      const building = new THREE.Mesh(buildingGeo, buildingMat);
      const bx = -1.8 + i * 0.5;
      building.position.set(bx, 0.6 + h / 2, -2.92);
      officeGroup.add(building);

      if (h > 1.1) {
        const rows = Math.floor(h / 0.16);
        const cols = Math.floor(w / 0.1);
        for (let r = 2; r < rows - 1; r++) {
          for (let c = 0; c < cols; c++) {
            if (Math.random() > 0.45) {
              const dotGeo = new THREE.PlaneGeometry(0.015, 0.015);
              const dotMat = new THREE.MeshBasicMaterial({
                color: Math.random() > 0.3 ? 0xffeaad : 0xaddeff
              });
              const dot = new THREE.Mesh(dotGeo, dotMat);
              dot.position.set(bx - w / 2 + 0.05 + c * 0.08, 0.6 + r * 0.16, -2.91);
              officeGroup.add(dot);
            }
          }
        }
      }
    }

    // Cyan Neon Light Bar
    const neonGeo = new THREE.BoxGeometry(4, 0.05, 0.05);
    const neonMat = new THREE.MeshStandardMaterial({
      color: 0x00ffff,
      emissive: 0x00ffff,
      emissiveIntensity: 3.0
    });
    const neonStrip = new THREE.Mesh(neonGeo, neonMat);
    neonStrip.position.set(0, 3.1, -2.9);
    officeGroup.add(neonStrip);

    // 5. Office Desk (in front of avatar, centered)
    const deskGroup = new THREE.Group();
    const topGeo = new THREE.BoxGeometry(1.6, 0.04, 0.8);
    const topMat = new THREE.MeshStandardMaterial({
      color: 0x0b0d10,
      roughness: 0.1,
      metalness: 0.9,
      transparent: true,
      opacity: 0.95
    });
    const desktop = new THREE.Mesh(topGeo, topMat);
    desktop.position.y = 0.85;
    desktop.castShadow = true;
    desktop.receiveShadow = true;
    deskGroup.add(desktop);

    // Desk Legs
    const legGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.85, 8);
    const legMat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.9, roughness: 0.2 });
    const legPositions = [
      [-0.7, 0.425, -0.3],
      [0.7, 0.425, -0.3],
      [-0.7, 0.425, 0.3],
      [0.7, 0.425, 0.3]
    ];
    legPositions.forEach(([x, y, z]) => {
      const leg = new THREE.Mesh(legGeo, legMat);
      leg.position.set(x, y, z);
      leg.castShadow = true;
      deskGroup.add(leg);
    });

    // Desk Mat
    const matGeo = new THREE.BoxGeometry(0.9, 0.005, 0.5);
    const matMat = new THREE.MeshStandardMaterial({ color: 0x181a20, roughness: 0.7 });
    const deskMat = new THREE.Mesh(matGeo, matMat);
    deskMat.position.set(0, 0.855, 0.05);
    deskGroup.add(deskMat);

    // Keyboard
    const kbGeo = new THREE.BoxGeometry(0.35, 0.008, 0.12);
    const kb = new THREE.Mesh(kbGeo, legMat);
    kb.position.set(0, 0.86, 0.15);
    deskGroup.add(kb);

    // Laptop
    const laptopGroup = new THREE.Group();
    const laptopBaseGeo = new THREE.BoxGeometry(0.3, 0.015, 0.2);
    const laptopBase = new THREE.Mesh(laptopBaseGeo, legMat);
    laptopBase.position.set(0, 0.86, -0.15);
    laptopGroup.add(laptopBase);

    const screenGeo = new THREE.BoxGeometry(0.3, 0.2, 0.01);
    const screenMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
    const laptopScreen = new THREE.Mesh(screenGeo, screenMat);
    laptopScreen.position.set(0, 0.96, -0.25);
    laptopScreen.rotation.x = -0.3;
    laptopGroup.add(laptopScreen);

    // Glowing screen face
    const screenFaceGeo = new THREE.PlaneGeometry(0.28, 0.18);
    const screenFaceMat = new THREE.MeshBasicMaterial({ color: 0x00ffff });
    const screenFace = new THREE.Mesh(screenFaceGeo, screenFaceMat);
    screenFace.position.set(0, 0.96, -0.244);
    screenFace.rotation.x = -0.3;
    laptopGroup.add(screenFace);
    deskGroup.add(laptopGroup);

    // Desk Lamp
    const lampGroup = new THREE.Group();
    const lampBaseGeo = new THREE.CylinderGeometry(0.05, 0.05, 0.01, 10);
    const lampBase = new THREE.Mesh(lampBaseGeo, legMat);
    lampBase.position.set(-0.55, 0.86, -0.2);
    lampGroup.add(lampBase);

    const poleGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.35, 8);
    const pole = new THREE.Mesh(poleGeo, legMat);
    pole.position.set(-0.55, 1.025, -0.2);
    pole.rotation.z = -0.25;
    lampGroup.add(pole);

    const shadeGeo = new THREE.CylinderGeometry(0.03, 0.05, 0.08, 10);
    const shadeMat = new THREE.MeshStandardMaterial({ color: 0x15161b, roughness: 0.5 });
    const shade = new THREE.Mesh(shadeGeo, shadeMat);
    shade.position.set(-0.50, 1.2, -0.2);
    shade.rotation.z = 0.5;
    lampGroup.add(shade);

    const deskLight = new THREE.PointLight(0xffaa44, 2.0, 1.5);
    deskLight.position.set(-0.50, 1.15, -0.2);
    deskLight.castShadow = true;
    lampGroup.add(deskLight);
    deskGroup.add(lampGroup);

    deskGroup.position.set(0, 0, 0.6);
    officeGroup.add(deskGroup);

    // 6. Side Props: Office Plants
    const plantGroup = new THREE.Group();
    const potGeo = new THREE.CylinderGeometry(0.15, 0.1, 0.3, 12);
    const potMat = new THREE.MeshStandardMaterial({ color: 0x2e2f33, roughness: 0.4 });
    const pot = new THREE.Mesh(potGeo, potMat);
    pot.position.y = 0.15;
    plantGroup.add(pot);

    const leafGeo = new THREE.SphereGeometry(0.25, 8, 8);
    const leafMat = new THREE.MeshStandardMaterial({ color: 0x1e3f20, roughness: 0.7 });
    for (let i = 0; i < 5; i++) {
      const leaf = new THREE.Mesh(leafGeo, leafMat);
      leaf.scale.set(0.6, 1.5, 0.6);
      leaf.rotation.x = 0.2 + Math.random() * 0.4;
      leaf.rotation.y = (i * Math.PI * 2) / 5;
      leaf.position.set(Math.cos(leaf.rotation.y) * 0.1, 0.35 + Math.random() * 0.15, Math.sin(leaf.rotation.y) * 0.1);
      plantGroup.add(leaf);
    }
    const leftPlant = plantGroup.clone();
    leftPlant.position.set(-1.8, 0, -1.5);
    officeGroup.add(leftPlant);

    const rightPlant = plantGroup.clone();
    rightPlant.position.set(1.8, 0, -1.5);
    officeGroup.add(rightPlant);

    // 7. Bookshelf unit
    const shelfGroup = new THREE.Group();
    const boardMat = new THREE.MeshStandardMaterial({ color: 0x1c140e, roughness: 0.9 });
    const shelfGeo = new THREE.BoxGeometry(0.8, 2.0, 0.3);
    const mainShelf = new THREE.Mesh(shelfGeo, boardMat);
    mainShelf.position.y = 1.0;
    mainShelf.castShadow = true;
    shelfGroup.add(mainShelf);

    for (let i = 0; i < 4; i++) {
      const dividerGeo = new THREE.BoxGeometry(0.76, 0.03, 0.28);
      const divider = new THREE.Mesh(dividerGeo, boardMat);
      divider.position.set(0, 0.2 + i * 0.5, 0.01);
      shelfGroup.add(divider);

      const stripGeo = new THREE.BoxGeometry(0.72, 0.01, 0.01);
      const stripMat = new THREE.MeshStandardMaterial({ color: 0xffaa44, emissive: 0xffaa44, emissiveIntensity: 1.5 });
      const glowStrip = new THREE.Mesh(stripGeo, stripMat);
      glowStrip.position.set(0, 0.18 + i * 0.5, 0.12);
      shelfGroup.add(glowStrip);

      const bookGeo = new THREE.BoxGeometry(0.04, 0.3, 0.2);
      const bookMat = new THREE.MeshStandardMaterial({ color: 0x8c2d2d, roughness: 0.6 });
      const book = new THREE.Mesh(bookGeo, bookMat);
      book.position.set(-0.2 + i * 0.1, 0.36 + i * 0.5, 0.02);
      book.rotation.y = 0.1;
      shelfGroup.add(book);
    }
    shelfGroup.position.set(2.2, 0, -2.6);
    officeGroup.add(shelfGroup);

    officeGroup.visible = isInterviewActiveRef.current;
    scene.add(officeGroup);
    officeGroupRef.current = officeGroup;
  };

  const createNatureEnvironment = (scene: THREE.Scene) => {
    const natureGroup = new THREE.Group();
    natureGroup.name = "natureEnvironment";

    // Grass Ground
    const groundGeo = new THREE.PlaneGeometry(10, 10);
    const groundMat = new THREE.MeshStandardMaterial({ color: 0x1f3c1d, roughness: 0.9, metalness: 0.0 });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    ground.receiveShadow = true;
    natureGroup.add(ground);

    // Procedural Trees
    const treeGroup = new THREE.Group();
    const trunkGeo = new THREE.CylinderGeometry(0.08, 0.12, 1.2, 8);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x3d2314, roughness: 0.9 });
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 0.6;
    trunk.castShadow = true;
    treeGroup.add(trunk);

    const foliageMat = new THREE.MeshStandardMaterial({ color: 0x1a331c, roughness: 0.8 });
    for (let j = 0; j < 3; j++) {
      const coneGeo = new THREE.ConeGeometry(0.5 - j * 0.1, 0.7, 8);
      const cone = new THREE.Mesh(coneGeo, foliageMat);
      cone.position.y = 1.1 + j * 0.4;
      cone.castShadow = true;
      treeGroup.add(cone);
    }

    const tree1 = treeGroup.clone();
    tree1.position.set(-2.0, 0, -2.0);
    tree1.scale.set(1.2, 1.2, 1.2);
    natureGroup.add(tree1);

    const tree2 = treeGroup.clone();
    tree2.position.set(2.0, 0, -2.2);
    tree2.scale.set(1.1, 1.1, 1.1);
    natureGroup.add(tree2);

    const tree3 = treeGroup.clone();
    tree3.position.set(-3.2, 0, -0.8);
    tree3.scale.set(0.9, 0.9, 0.9);
    natureGroup.add(tree3);

    // Rocks
    const rockGeo = new THREE.DodecahedronGeometry(0.2, 0);
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x3a3c42, roughness: 0.9 });
    const rockGroup = new THREE.Group();
    const r1 = new THREE.Mesh(rockGeo, rockMat);
    r1.position.set(0, 0.1, 0);
    r1.scale.set(1, 0.7, 1);
    rockGroup.add(r1);

    const r2 = new THREE.Mesh(rockGeo, rockMat);
    r2.position.set(0.12, 0.08, -0.05);
    r2.scale.set(0.7, 0.7, 0.7);
    rockGroup.add(r2);
    rockGroup.position.set(1.6, 0, -0.8);
    natureGroup.add(rockGroup);

    // Flowers
    const flowerGroup = new THREE.Group();
    const stemGeo = new THREE.CylinderGeometry(0.005, 0.005, 0.15, 4);
    const stemMat = new THREE.MeshStandardMaterial({ color: 0x2d5a27 });
    const stem = new THREE.Mesh(stemGeo, stemMat);
    stem.position.y = 0.075;
    flowerGroup.add(stem);

    const petalGeo = new THREE.SphereGeometry(0.03, 6, 6);
    const petalColors = [0xe65c8a, 0xe6a15c, 0xb85ce6];
    const petalMat = new THREE.MeshStandardMaterial({ color: petalColors[0], roughness: 0.6 });
    const petal = new THREE.Mesh(petalGeo, petalMat);
    petal.position.y = 0.15;
    flowerGroup.add(petal);

    const flowerPositions = [[-1.0, 0.1], [1.2, -0.5], [-1.8, -0.2], [1.9, -1.2], [-0.5, -1.5]];
    flowerPositions.forEach(([x, z], idx) => {
      const fl = flowerGroup.clone();
      fl.position.set(x, 0, z);
      const pMesh = fl.children[1] as THREE.Mesh;
      pMesh.material = new THREE.MeshStandardMaterial({
        color: petalColors[idx % petalColors.length],
        roughness: 0.6
      });
      natureGroup.add(fl);
    });

    // Fireflies
    const fireflyGeo = new THREE.SphereGeometry(0.015, 4, 4);
    const fireflyMat = new THREE.MeshBasicMaterial({ color: 0xaaff00 });
    for (let i = 0; i < 8; i++) {
      const firefly = new THREE.Mesh(fireflyGeo, fireflyMat);
      const fx = -2.5 + Math.random() * 5;
      const fy = 0.4 + Math.random() * 1.2;
      const fz = -2.0 + Math.random() * 1.5;
      firefly.position.set(fx, fy, fz);
      const fireflyLight = new THREE.PointLight(0xaaff00, 0.4, 0.8);
      fireflyLight.position.set(fx, fy, fz);
      natureGroup.add(fireflyLight);
      natureGroup.add(firefly);
    }

    // Warm Sun Light
    const sunLight = new THREE.DirectionalLight(0xff8c44, 2.0);
    sunLight.position.set(-4, 3, -2);
    sunLight.castShadow = true;
    natureGroup.add(sunLight);

    natureGroup.visible = !isInterviewActiveRef.current;
    scene.add(natureGroup);
    natureGroupRef.current = natureGroup;
  };

  useEffect(() => {
    if (!containerRef.current) return;

    const width = containerRef.current.clientWidth || 800;
    const height = containerRef.current.clientHeight || 600;

    // Scene
    const scene = new THREE.Scene();

    // Camera
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 1.5, 2.8);
    cameraRef.current = camera;

    // Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.setClearColor(isInterviewActiveRef.current ? 0x000000 : 0x070c18, isInterviewActiveRef.current ? 0.0 : 1.0);
    renderer.domElement.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%';
    containerRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Lighting
    const hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1.5);
    scene.add(hemi);
    const dir = new THREE.DirectionalLight(0xffffff, 1.0);
    dir.position.set(3, 10, 5);
    dir.castShadow = true;
    scene.add(dir);
    const fill = new THREE.PointLight(0x00ffff, 2, 10);
    fill.position.set(0, 2, 2);
    scene.add(fill);
    const face = new THREE.PointLight(0xffccaa, 1.5, 5);
    face.position.set(0, 1.6, 1.5);
    scene.add(face);

    createOfficeEnvironment(scene);
    createNatureEnvironment(scene);

    // PMREMGenerator for environment
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment()).texture;

    // Cyber Chair
    const chairGroup = new THREE.Group();
    const seatGeo = new THREE.BoxGeometry(0.5, 0.08, 0.5);
    const seatMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.3, metalness: 0.5 });
    const seat = new THREE.Mesh(seatGeo, seatMat);
    seat.position.y = 0.45;
    chairGroup.add(seat);

    const backGeo = new THREE.BoxGeometry(0.5, 0.7, 0.08);
    const back = new THREE.Mesh(backGeo, seatMat);
    back.position.set(0, 0.8, -0.25);
    back.rotation.x = -0.1;
    chairGroup.add(back);

    const baseGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.45, 12);
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 1, roughness: 0.1 });
    const base = new THREE.Mesh(baseGeo, baseMat);
    base.position.y = 0.225;
    chairGroup.add(base);

    const legGeo = new THREE.BoxGeometry(0.5, 0.02, 0.05);
    for (let i = 0; i < 5; i++) {
      const leg = new THREE.Mesh(legGeo, baseMat);
      leg.position.y = 0.02;
      leg.rotation.y = (i * Math.PI * 2) / 5;
      leg.position.x = Math.cos(leg.rotation.y) * 0.2;
      leg.position.z = -Math.sin(leg.rotation.y) * 0.2;
      chairGroup.add(leg);
    }
    chairGroup.position.set(0, -0.05, -0.25);
    chairGroup.scale.set(1.1, 1.1, 1.1);
    chairGroup.visible = isInterviewActive;
    scene.add(chairGroup);
    chairRef.current = chairGroup;

    // OrbitControls
    const controls = new OrbitControls(camera, renderer.domElement);
    controlsRef.current = controls;
    controls.enableDamping = true;
    controls.target.set(0, 1.35, 0);
    controls.enableZoom = false;
    controls.enablePan = false;
    controls.update();

    // Load GLB
    jawBoneRef.current = null;
    lipSyncMeshesRef.current = [];
    const gltfLoader = new GLTFLoader();
    gltfLoader.load('/models/aura/aura.glb', (gltf) => {
      console.log('✅ aura.glb loaded');
      const object = gltf.scene;
      avatarRef.current = object;
      object.scale.set(1, 1, 1);
      object.rotation.y = 0;

      if (isInterviewActiveRef.current) {
        object.position.set(0, -0.18, -0.18);
      } else {
        object.position.set(0, 0, 0);
      }

      object.traverse((child) => {
        if ((child as any).isMesh || (child as any).isSkinnedMesh) {
          const mesh = child as THREE.Mesh;
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          mesh.frustumCulled = false;
          if (mesh.morphTargetDictionary) {
            lipSyncMeshesRef.current.push(mesh);
          }
        }
        if (child.name === 'Head' || child.name === 'head') {
          jawBoneRef.current = child;
        }
      });

      scene.add(object);
      const mixer = new THREE.AnimationMixer(object);
      mixerRef.current = mixer;

      setIsLoaded(true);

      if (isInterviewActiveRef.current) {
        playFBXAnim(INTERVIEW_SIT_ANIM, THREE.LoopOnce, true);
      } else {
        chatAnimIndexRef.current = 0;
        playNextChatAnim();
      }
    }, (xhr) => {
      if (xhr.total > 0) setProgress(Math.round((xhr.loaded / xhr.total) * 100));
    }, (err) => {
      console.error('GLB load error:', err);
      setIsLoaded(true);
    });

    // Convai blendshapes
    const handleConvaiBlendshapes = (event: any) => {
      const blendshapes: Record<string, number> = event.detail;
      for (const mesh of lipSyncMeshesRef.current) {
        if (!mesh.morphTargetDictionary || !mesh.morphTargetInfluences) continue;
        for (const [name, value] of Object.entries(blendshapes)) {
          const idx = mesh.morphTargetDictionary[name];
          if (idx !== undefined) mesh.morphTargetInfluences[idx] = value as number;
        }
      }
    };
    window.addEventListener('convai-blendshapes', handleConvaiBlendshapes);

    // Resize
    const handleResize = () => {
      if (!containerRef.current) return;
      const w = containerRef.current.clientWidth;
      const h = containerRef.current.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    // Render loop with autonomous movements (Blinking & Head nods while speaking/listening)
    let animId: number;
    let blinkTimer = 0;
    let nextBlinkTime = Math.random() * 3500 + 2000;

    const animate = () => {
      animId = requestAnimationFrame(animate);
      const delta = clockRef.current.getDelta();
      const elapsed = clockRef.current.getElapsedTime();

      if (mixerRef.current) mixerRef.current.update(delta);
      controls.update();

      // --- Refined Conversational Lip-Sync (Natural bounds & Formant shaping) ---
      let targetJaw = 0;
      let vowelOpen = 0;
      let vowelFront = 0;
      let fricative = 0;

      if (playerRef.current && playerRef.current.audioContext.state === 'running') {
        const phoneme = playerRef.current.getPhonemeFrame();
        if (phoneme.isSpeaking) {
          // Cap conversational jaw opening to natural 0.35 max (prevents gaping wide mouth)
          targetJaw = Math.min(phoneme.jaw * 0.42, 0.35);
          vowelOpen = phoneme.vowelOpen;
          vowelFront = phoneme.vowelFront;
          fricative = phoneme.fricative;
        }
      }

      // NVIDIA Audio2Face blendshapes (when available, clamped to natural conversational limit)
      if (a2fAnimRef.current && playerRef.current) {
        const { frames, fps, startTime } = a2fAnimRef.current;
        const currentAudioTime = playerRef.current.audioContext.currentTime;
        const currentElapsed = currentAudioTime - startTime;
        if (currentElapsed >= 0) {
          const frameIdx = Math.floor(currentElapsed * fps);
          if (frameIdx < frames.length && frames[frameIdx][17] !== undefined) {
            targetJaw = Math.max(targetJaw, Math.min(frames[frameIdx][17] * 0.8, 0.35));
          }
        }
      }

      // Smooth jaw movement (fast attack, natural release)
      smoothJawRef.current += (targetJaw - smoothJawRef.current) * 0.35;
      const curJaw = Math.max(0, smoothJawRef.current);

      for (const mesh of lipSyncMeshesRef.current) {
        if (!mesh.morphTargetDictionary || !mesh.morphTargetInfluences) continue;

        // 1. Natural jaw open (0.0 to 0.35 max)
        const jawIdx = mesh.morphTargetDictionary['jawOpen'];
        if (jawIdx !== undefined) {
          mesh.morphTargetInfluences[jawIdx] = curJaw;
        }

        // 2. Vowel Formants: O/U round mouth (subtle 0.0 to 0.20)
        const funnelIdx = mesh.morphTargetDictionary['mouthFunnel'];
        if (funnelIdx !== undefined) {
          mesh.morphTargetInfluences[funnelIdx] = Math.min(vowelOpen * 0.2, 0.2);
        }

        // 3. Vowel Formants: E/I speech smile (subtle 0.0 to 0.15)
        const smileL = mesh.morphTargetDictionary['mouthSmileLeft'];
        const smileR = mesh.morphTargetDictionary['mouthSmileRight'];
        if (smileL !== undefined) mesh.morphTargetInfluences[smileL] = Math.min(vowelFront * 0.15, 0.15);
        if (smileR !== undefined) mesh.morphTargetInfluences[smileR] = Math.min(vowelFront * 0.15, 0.15);

        // 4. Consonant / Fricative Pucker & Lower Lip Movement
        const puckerIdx = mesh.morphTargetDictionary['mouthPucker'];
        if (puckerIdx !== undefined) {
          mesh.morphTargetInfluences[puckerIdx] = Math.min(fricative * 0.12, 0.12);
        }

        const lowerDownL = mesh.morphTargetDictionary['mouthLowerDownLeft'];
        const lowerDownR = mesh.morphTargetDictionary['mouthLowerDownRight'];
        if (lowerDownL !== undefined) mesh.morphTargetInfluences[lowerDownL] = curJaw * 0.2;
        if (lowerDownR !== undefined) mesh.morphTargetInfluences[lowerDownR] = curJaw * 0.2;
      }

      // --- Autonomous Movements: Blinking & Head Nods while Speaking/Listening ---
      if (scene) {
        // Eye Blinking
        blinkTimer += delta * 1000;
        if (blinkTimer > nextBlinkTime) {
          for (const mesh of lipSyncMeshesRef.current) {
            if (!mesh.morphTargetDictionary || !mesh.morphTargetInfluences) continue;
            const blinkL = mesh.morphTargetDictionary['eyeBlinkLeft'] ?? mesh.morphTargetDictionary['eyesClosed'];
            const blinkR = mesh.morphTargetDictionary['eyeBlinkRight'] ?? mesh.morphTargetDictionary['eyesClosed'];
            if (blinkL !== undefined) mesh.morphTargetInfluences[blinkL] = 1.0;
            if (blinkR !== undefined) mesh.morphTargetInfluences[blinkR] = 1.0;
          }
          setTimeout(() => {
            for (const mesh of lipSyncMeshesRef.current) {
              if (!mesh.morphTargetDictionary || !mesh.morphTargetInfluences) continue;
              const blinkL = mesh.morphTargetDictionary['eyeBlinkLeft'] ?? mesh.morphTargetDictionary['eyesClosed'];
              const blinkR = mesh.morphTargetDictionary['eyeBlinkRight'] ?? mesh.morphTargetDictionary['eyesClosed'];
              if (blinkL !== undefined) mesh.morphTargetInfluences[blinkL] = 0.0;
              if (blinkR !== undefined) mesh.morphTargetInfluences[blinkR] = 0.0;
            }
          }, 150);
          blinkTimer = 0;
          nextBlinkTime = Math.random() * 4000 + 2500;
        }

        // Head motion while speaking / listening / idle
        const isSpeaking = smoothJawRef.current > 0.05 || (playerRef.current && playerRef.current.audioContext.state === 'running');
        if (jawBoneRef.current) {
          if (isSpeaking) {
            // Natural head nod & gesture while speaking
            const nod = Math.sin(elapsed * 4.5) * 0.06 + Math.sin(elapsed * 2.2) * 0.03;
            const tilt = Math.cos(elapsed * 2.0) * 0.04;
            const yaw = Math.sin(elapsed * 1.5) * 0.04;
            jawBoneRef.current.rotation.x = nod;
            jawBoneRef.current.rotation.z = tilt;
            jawBoneRef.current.rotation.y = yaw;
          } else if (isUserTypingRef.current || statusRef.current === 'Listening') {
            // Attentive listening tilt & micro nods
            jawBoneRef.current.rotation.x = Math.sin(elapsed * 1.8) * 0.03 + 0.05;
            jawBoneRef.current.rotation.z = 0.04;
            jawBoneRef.current.rotation.y = Math.sin(elapsed * 0.8) * 0.03;
          } else {
            // Idle breathing / slight natural head sway
            jawBoneRef.current.rotation.x = Math.sin(elapsed * 1.2) * 0.02;
            jawBoneRef.current.rotation.z = Math.sin(elapsed * 0.7) * 0.015;
            jawBoneRef.current.rotation.y = Math.sin(elapsed * 0.5) * 0.02;
          }
        }
      }

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('convai-blendshapes', handleConvaiBlendshapes);
      if (containerRef.current?.contains(renderer.domElement)) {
        containerRef.current.removeChild(renderer.domElement);
      }
      renderer.dispose();
      pmremGenerator.dispose();
      scene.clear();
    };
  }, []);

  return (
    <div ref={containerRef} className="w-full h-full relative">
      <AnimatePresence>
        {!isLoaded && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex flex-col items-center justify-center bg-black/50 backdrop-blur-md z-10"
          >
            <div className="relative w-24 h-24 flex items-center justify-center mb-6">
              <Loader2 className="w-full h-full text-cyan-400 animate-spin opacity-20" />
              <div className="absolute inset-0 flex items-center justify-center font-black text-cyan-400 text-sm">
                {progress}%
              </div>
              <svg className="absolute inset-0 w-full h-full -rotate-90">
                <circle cx="48" cy="48" r="44" fill="transparent" stroke="currentColor" strokeWidth="4" className="text-cyan-500/10" />
                <circle cx="48" cy="48" r="44" fill="transparent" stroke="currentColor" strokeWidth="4"
                  strokeDasharray={276} strokeDashoffset={276 - (276 * progress) / 100}
                  className="text-cyan-400 transition-all duration-300" />
              </svg>
            </div>
            <div className="text-[10px] text-cyan-400 font-bold uppercase tracking-[0.5em] animate-pulse">Syncing Neural Link...</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
export default function App() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [status, setStatus] = useState<string>('Initializing...');
  const [isConvaiConnected, setIsConvaiConnected] = useState(false);
  const [convaiBlendshapes, setConvaiBlendshapes] = useState<any>(null);

  const [isInterviewMode, setIsInterviewMode] = useState(false);
  const [isInterviewActive, setIsInterviewActive] = useState(false);
  const [interviewCompany, setInterviewCompany] = useState("Meta");
  const [interviewRole, setInterviewRole] = useState("");
  const [fetchedQuestions, setFetchedQuestions] = useState("");
  const [isFetchingQuestions, setIsFetchingQuestions] = useState(false);
  const companies = ["Meta", "Google", "Amazon", "Netflix", "Apple", "Microsoft", "OpenAI", "NVIDIA", "Tesla", "SpaceX", "Stripe", "Airbnb", "Uber"];
  const chairRef = useRef<THREE.Group | null>(null);

  const convaiClientRef = useRef<ConvaiClient | null>(null);
  const convaiApiKey = import.meta.env.VITE_CONVAI_API_KEY;
  const convaiCharacterId = import.meta.env.VITE_CONVAI_CHARACTER_ID;
  const [isUserTyping, setIsUserTyping] = useState(false);
  const [isModelLoaded, setIsModelLoaded] = useState(false);
  const [isVoiceMenuOpen, setIsVoiceMenuOpen] = useState(false);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleChatInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setChatInput(e.target.value);

    // Typing detection
    setIsUserTyping(true);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      setIsUserTyping(false);
    }, 800); // Stop nodding 800ms after last keystroke
  };
  const [selectedVoice, setSelectedVoice] = useState({
    id: "cec7cae1-ac8b-4a59-9eac-ec48366f37ae",
    name: "Haley - Engaging Friend",
    icon: "female"
  });

  const voices = [
    { id: "cec7cae1-ac8b-4a59-9eac-ec48366f37ae", name: "Haley - Engaging Friend", icon: "female" },
    { id: "d6905573-8e91-4e32-b103-fd4d1205cd87", name: "Mindy - Spirited Ally", icon: "female" },
    { id: "d709a7e8-9495-4247-aef0-01b3207d11bf", name: "Donny - Steady Presence", icon: "male" },
    { id: "db69127a-dbaf-4fa9-b425-2fe67680c348", name: "Clint - Rugged Actor", icon: "male" },
    { id: "dbfa416f-d5c3-4006-854b-235ef6bdf4fd", name: "Damon - Commanding Narrator", icon: "male" },
    { id: "e4d5f4c4-6601-4779-bee1-b3c14d629dc6", name: "Jillian - Happy Spirit", icon: "female" },
    { id: "ea7c252f-6cb1-45f5-8be9-b4f6ac282242", name: "Logan - Approachable Friend", icon: "male" },
    { id: "39d518b7-fd0b-4676-9b8b-29d64ff31e12", name: "Aarav - Old Time Storyteller", icon: "male" },
  ];

  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);
  const [isInfoOpen, setIsInfoOpen] = useState(false);
  const [currentPrompt, setCurrentPrompt] = useState('Waiting for camera...');
  const [consoleState, setConsoleState] = useState({
    emotion: 'neutral',
    objects: [] as string[],
    blendshapes: { smile: 0, frown: 0, mouthOpen: 0, browRaise: 0, eyeBlink: 0, pucker: 0 },
    attention: 0
  });


  const [chatMessages, setChatMessages] = useState<Message[]>([
    { role: 'assistant', content: 'System online. I am observing your environment and affective state. How can I assist you?' }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const isRecordingRef = useRef(false); // ref for stale-closure-safe access in handlers
  const isStartingRecordingRef = useRef(false);
  const shouldStopRecordingRef = useRef(false);
  const [micLevel, setMicLevel] = useState(0); // 0-100 audio level for visualizer
  const maxMicLevelRef = useRef(0);
  const micAnimFrameRef = useRef<number | null>(null);
  const micAnalyserRef = useRef<AnalyserNode | null>(null);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const attentionRef = useRef(60);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  const audioChunksRef = useRef<Blob[]>([]);



  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const faceCanvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const playerRef = useRef<PCMPlayer | null>(null);

  const objectModelRef = useRef<cocoSsd.ObjectDetection | null>(null);
  const faceLandmarkerRef = useRef<FaceLandmarker | null>(null);
  const isPlayingRef = useRef(false);
  const lastStateUpdateTimeRef = useRef<number>(0);
  const detectLoopRef = useRef<number | null>(null);
  const smoothedBoxesRef = useRef<Map<string, SmoothedBox>>(new Map());
  const smoothedBlendshapesRef = useRef({ smile: 0, frown: 0, mouthOpen: 0, browRaise: 0, eyeBlink: 0, pucker: 0 });
  const jawValueRef = useRef(0);
  // Stores a scheduled NVIDIA Audio2Face keyframe animation (cleared when audio ends)
  const a2fAnimRef = useRef<{ frames: number[][], fps: number, startTime: number } | null>(null);

  const playHoverSound = () => {
    try {
      initAudio();
      if (!hoverSynth || Tone.context.state !== 'running') return;

      const now = Tone.now();
      hoverSynth.triggerAttackRelease(800, 0.1, now);
      hoverSynth.frequency.exponentialRampToValueAtTime(1200, now + 0.1);
    } catch (e) { }
  };

  const currentAudioIdRef = useRef<number>(0);
  const currentSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const currentSpeechTurnRef = useRef<number>(0);

  // ─── Instant Speech Cancellation — halts previous audio, clears queue & resets blendshapes ───
  const stopSpeaking = () => {
    // 1. Advance turn counter to invalidate any pending in-flight TTS fetches / queue resolutions
    currentSpeechTurnRef.current += 1;

    // 2. Stop and disconnect the currently playing Web Audio source immediately
    if (currentSourceRef.current) {
      try {
        currentSourceRef.current.stop(0);
        currentSourceRef.current.disconnect();
      } catch (e) { }
      currentSourceRef.current = null;
    }

    // 3. Clear blendshape animation frames and active audio ID
    a2fAnimRef.current = null;
    currentAudioIdRef.current = 0;

    // 4. Reset the speech queue promise so pending sentences are dropped
    speakQueueRef.current = Promise.resolve();

    // 5. Cancel native browser SpeechSynthesis if active
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      try { window.speechSynthesis.cancel(); } catch (e) { }
    }

    setStatus('Active');
  };

  // ─── Internal helper: play ArrayBuffer audio through the lip-sync analyser chain ───
  const playAudioBuffer = async (arrayBuffer: ArrayBuffer, turnId?: number): Promise<{ startTime: number, audioId: number, done: Promise<void> }> => {
    if (!playerRef.current) return { startTime: 0, audioId: 0, done: Promise.resolve() };

    // Discard audio if turn has been invalidated by a newer response
    if (turnId !== undefined && turnId !== currentSpeechTurnRef.current) {
      return { startTime: 0, audioId: 0, done: Promise.resolve() };
    }

    if (playerRef.current.audioContext.state === 'suspended') {
      await playerRef.current.audioContext.resume();
    }

    // Stop any existing playing source before starting new one
    if (currentSourceRef.current) {
      try {
        currentSourceRef.current.stop(0);
        currentSourceRef.current.disconnect();
      } catch (e) { }
      currentSourceRef.current = null;
    }

    const audioBuffer = await playerRef.current.audioContext.decodeAudioData(arrayBuffer.slice(0));

    // Double check turn validity after async decodeAudioData
    if (turnId !== undefined && turnId !== currentSpeechTurnRef.current) {
      return { startTime: 0, audioId: 0, done: Promise.resolve() };
    }

    const source = playerRef.current.audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(playerRef.current.analyser);
    currentSourceRef.current = source;

    const audioId = Date.now() + Math.random();
    currentAudioIdRef.current = audioId;

    const done = new Promise<void>(resolve => {
      source.onended = () => {
        if (currentSourceRef.current === source) {
          currentSourceRef.current = null;
        }
        setStatus('Active');
        if (currentAudioIdRef.current === audioId) a2fAnimRef.current = null;
        resolve();
      };
    });

    source.start(0);
    return { startTime: playerRef.current.audioContext.currentTime, audioId, done };
  };

  // ─── NVIDIA Audio2Face ─── sends audio → gets 52 ARKit blendshape keyframes ───────
  // This runs IN PARALLEL with audio playback; keyframes are applied in the render loop
  const runNvidiaAudio2Face = async (audioArrayBuffer: ArrayBuffer) => {
    const nvKey = import.meta.env.VITE_NV_API_KEY ||
      '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';
    if (!nvKey) return;

    try {
      console.log('🟣 NVIDIA Audio2Face: sending audio for blendshape generation...');

      // Convert ArrayBuffer → base64
      const bytes = new Uint8Array(audioArrayBuffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      const base64Audio = btoa(binary);

      // ✅ FIX: Use Vite proxy (/api/nvidia) to avoid CORS from browser-side fetch
      const response = await fetch(
        '/api/nvidia/v1/cv/nvidia/audio2face-3ds',
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${nvKey}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify({
            audio: base64Audio,
            emotion_strength: 0.8,
            live_blend_coef: 0.7,
          }),
        }
      );

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`A2F ${response.status}: ${errText.slice(0, 120)}`);
      }

      const data = await response.json();

      // NVIDIA A2F response: { animation: { curves: [{name, keyframes:[{time,value}]}] } }
      // or: { blendshapes: [[52 values per frame], ...], fps: 30 }
      // Handle both response shapes
      let frames: number[][] = [];
      let fps = 30;

      if (data.blendshapes && Array.isArray(data.blendshapes)) {
        // Direct blendshape array format
        frames = data.blendshapes;
        fps = data.fps || 30;
      } else if (data.animation?.curves) {
        // Curve keyframe format — reconstruct frame array
        const curves: { name: string; keyframes: { time: number; value: number }[] }[] =
          data.animation.curves;

        // Standard 52 ARKit shape order
        const ARKIT_ORDER = [
          'eyeBlinkLeft', 'eyeLookDownLeft', 'eyeLookInLeft', 'eyeLookOutLeft', 'eyeLookUpLeft',
          'eyeSquintLeft', 'eyeWideLeft', 'eyeBlinkRight', 'eyeLookDownRight', 'eyeLookInRight',
          'eyeLookOutRight', 'eyeLookUpRight', 'eyeSquintRight', 'eyeWideRight',
          'jawForward', 'jawLeft', 'jawRight', 'jawOpen',
          'mouthClose', 'mouthFunnel', 'mouthPucker', 'mouthLeft', 'mouthRight',
          'mouthSmileLeft', 'mouthSmileRight', 'mouthFrownLeft', 'mouthFrownRight',
          'mouthDimpleLeft', 'mouthDimpleRight', 'mouthStretchLeft', 'mouthStretchRight',
          'mouthRollLower', 'mouthRollUpper', 'mouthShrugLower', 'mouthShrugUpper',
          'mouthPressLeft', 'mouthPressRight', 'mouthLowerDownLeft', 'mouthLowerDownRight',
          'mouthUpperUpLeft', 'mouthUpperUpRight',
          'browDownLeft', 'browDownRight', 'browInnerUp', 'browOuterUpLeft', 'browOuterUpRight',
          'cheekPuff', 'cheekSquintLeft', 'cheekSquintRight',
          'noseSneerLeft', 'noseSneerRight', 'tongueOut'
        ];

        // Build curve lookup: name → sorted keyframes
        const curveMap: Record<string, { time: number; value: number }[]> = {};
        curves.forEach(c => { curveMap[c.name] = c.keyframes; });

        // Find total duration from all curves
        let maxTime = 0;
        curves.forEach(c => {
          if (c.keyframes.length > 0)
            maxTime = Math.max(maxTime, c.keyframes[c.keyframes.length - 1].time);
        });

        const totalFrames = Math.ceil(maxTime * fps);
        const frameDur = 1 / fps;

        // Linear interpolate keyframes into frame array
        const lerp = (kfs: { time: number; value: number }[], t: number) => {
          if (!kfs || kfs.length === 0) return 0;
          if (t <= kfs[0].time) return kfs[0].value;
          if (t >= kfs[kfs.length - 1].time) return kfs[kfs.length - 1].value;
          for (let i = 0; i < kfs.length - 1; i++) {
            if (t >= kfs[i].time && t < kfs[i + 1].time) {
              const alpha = (t - kfs[i].time) / (kfs[i + 1].time - kfs[i].time);
              return kfs[i].value + alpha * (kfs[i + 1].value - kfs[i].value);
            }
          }
          return 0;
        };

        for (let f = 0; f < totalFrames; f++) {
          const t = f * frameDur;
          frames.push(ARKIT_ORDER.map(name => lerp(curveMap[name] || [], t)));
        }
      }

      if (frames.length === 0) {
        console.warn('⚠️ NVIDIA A2F: No blendshape frames in response.');
        return null;
      }

      // ── VALIDATION: Check if A2F returned a flatline (all zeros) ──
      let hasMovement = false;
      for (const frame of frames) {
        for (const val of frame) {
          if (val > 0.01) {
            hasMovement = true;
            break;
          }
        }
        if (hasMovement) break;
      }

      if (!hasMovement) {
        console.warn('⚠️ NVIDIA A2F returned empty/zeroed blendshapes (format rejection). Falling back to phonemes.');
        return null;
      }

      console.log(`✅ NVIDIA Audio2Face: ${frames.length} frames @ ${fps}fps — driving ${frames[0]?.length} blendshapes.`);
      return { frames, fps };

    } catch (err) {
      console.warn('⚠️ NVIDIA Audio2Face failed:', err);
      return null;
    }
  };

  // ─── Speak queue — ensures sentences play in order without overlap ───
  const speakQueueRef = useRef<Promise<void>>(Promise.resolve());

  // ─── Deepgram TTS (primary) — NVIDIA Audio2Face runs in parallel for blendshapes ───
  const speak = async (text: string, overrideVoiceId?: string, turnId?: number): Promise<void> => {
    initAudio();
    if (!isAudioEnabled) return;

    const thisTurn = turnId !== undefined ? turnId : currentSpeechTurnRef.current;
    if (thisTurn !== currentSpeechTurnRef.current) return;

    if (!playerRef.current) playerRef.current = new PCMPlayer(44100);
    if (playerRef.current.audioContext.state === 'suspended') {
      await playerRef.current.audioContext.resume();
    }

    const cleanText = text.replace(/[*#`_\[\]()]/g, '').trim();
    if (!cleanText) return;

    const deepgramKey = import.meta.env.VITE_DEEPGRAM_API_KEY || 'cc5418f9c4e826cd804f12605f5f93879eecd058';

    setStatus('Generating Voice...');

    try {
      const response = await fetch('https://api.deepgram.com/v1/speak?model=aura-asteria-en', {
        method: 'POST',
        headers: { 'Authorization': `Token ${deepgramKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: cleanText })
      });

      // Abort if turn changed while network request was running
      if (thisTurn !== currentSpeechTurnRef.current) return;
      if (!response.ok) throw new Error(`Deepgram ${response.status}`);

      const buf = await response.arrayBuffer();
      if (thisTurn !== currentSpeechTurnRef.current) return;

      const { startTime: exactStartTime, audioId, done } = await playAudioBuffer(buf.slice(0), thisTurn);
      setStatus('Active');
      console.log(`✅ Deepgram TTS playing (Audio time: ${exactStartTime.toFixed(3)}s)`);

      runNvidiaAudio2Face(buf.slice(0)).then(a2fData => {
        if (a2fData && currentAudioIdRef.current === audioId && thisTurn === currentSpeechTurnRef.current) {
          a2fAnimRef.current = { frames: a2fData.frames, fps: a2fData.fps, startTime: exactStartTime };
          console.log('✅ NVIDIA A2F blendshapes synchronized!');
        }
      });

      await done; // wait for this sentence to finish before next in queue
    } catch (e: any) {
      console.warn('⚠️ Deepgram failed:', e.message);
      setStatus('Active');
      setErrorMsg(`TTS Error: ${e.message}`);
    }
  };

  // Enqueue a sentence — plays immediately after the previous one finishes (checked against turnId)
  const speakQueued = (text: string, turnId?: number) => {
    const thisTurn = turnId !== undefined ? turnId : currentSpeechTurnRef.current;
    speakQueueRef.current = speakQueueRef.current
      .then(() => {
        if (thisTurn === currentSpeechTurnRef.current) {
          return speak(text, undefined, thisTurn);
        }
      })
      .catch(() => { });
  };

  // Trigger Interview Start
  useEffect(() => {
    if (isInterviewActive) {
      stopSpeaking();
      if (chairRef.current) chairRef.current.visible = true;
      const welcome = `Welcome to your ${interviewCompany} Technical Interview. I'm your interviewer today. Before we begin, which specific role are you applying for at ${interviewCompany}? (e.g., Software Engineer, Product Manager, Data Scientist)`;
      setChatMessages([{ role: 'assistant', content: welcome }]);
      speak(welcome, undefined, currentSpeechTurnRef.current);
    } else if (!isInterviewMode) {
      stopSpeaking();
      if (chairRef.current) chairRef.current.visible = false;
      setIsInterviewActive(false);
      setInterviewRole('');
      setFetchedQuestions('');
    }
  }, [isInterviewActive, isInterviewMode]);

  // Fetch real interview questions by searching authoritative sources
  const fetchInterviewQuestions = async (company: string, role: string) => {
    const mistralKey = import.meta.env.VITE_MISTRAL_API_KEY;
    if (!mistralKey) return;
    setIsFetchingQuestions(true);

    const companyLower = company.toLowerCase().replace(/\s+/g, '');

    const searchPrompt = `Compile real interview questions for a ${role} role at ${company}. Base your answer on well-known sources like Glassdoor, Blind, Reddit (r/cscareerquestions), LeetCode Discuss, and the company engineering blog.

List exactly 15 realistic questions categorised by type:
- 3-4 Technical/coding questions
- 3-4 System design questions
- 3-4 Behavioral/HR questions (STAR format)
- 2-3 Role-specific domain questions for ${role}

Format: numbered list only, no extra commentary. Include the likely source in brackets after each question, e.g. [Glassdoor], [Blind], [Reddit], [LeetCode].`;

    const abortCtrl = new AbortController();
    const abortTimer = setTimeout(() => abortCtrl.abort(), 30000); // 30s timeout

    try {
      console.log('[Mistral] Fetching real interview questions...');
      const res = await fetch('/api/mistral/v1/chat/completions', {
        method: 'POST',
        signal: abortCtrl.signal,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${mistralKey}`
        },
        body: JSON.stringify({
          model: 'mistral-large-latest',
          messages: [{ role: 'user', content: searchPrompt }],
          temperature: 0.1,
          max_tokens: 1600,
        })
      });
      if (res.ok) {
        const data = await res.json();
        const qs = data.choices?.[0]?.message?.content || '';
        if (qs) {
          setFetchedQuestions(qs);
          console.log(`[Mistral] Fetched questions for ${company} ${role}`);
        }
      } else {
        const errBody = await res.text();
        console.warn('[Mistral] Question fetch HTTP', res.status, errBody.slice(0, 300));
      }
    } catch (e: any) {
      if (e?.name === 'AbortError') {
        console.warn('[Mistral] Question fetch timed out after 30s');
      } else {
        console.warn('[Mistral] Question fetch failed:', e);
      }
    } finally {
      clearTimeout(abortTimer);
      setIsFetchingQuestions(false);
    }
  };

  const handleChatSubmit = async (e: React.FormEvent, overrideMsg?: string) => {
    if (e) e.preventDefault();
    const userMsg = overrideMsg || chatInput.trim();
    if (!userMsg || isChatLoading) return;

    setChatInput('');
    setChatMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setIsChatLoading(true);

    // Stop and discard any previous speech/sentences immediately
    stopSpeaking();
    const thisTurn = currentSpeechTurnRef.current;

    // First reply in interview = role declaration → fetch real questions immediately
    if (isInterviewActive && !interviewRole) {
      setInterviewRole(userMsg.trim());
      fetchInterviewQuestions(interviewCompany, userMsg.trim()); // runs in background
    }

    // ── Primary: Gemini 2.5 Flash with Google Search Grounding ──────────────

    const geminiKey = import.meta.env.VITE_GEMINI_API_KEY;

    // Attempt Gemini with Google Search Grounding (New @google/genai SDK)
    if (geminiKey && geminiKey !== 'YOUR_GEMINI_API_KEY') {

      try {
        const client = new GoogleGenAI({ apiKey: geminiKey });

        let systemPrompt = `You are Professional Friend AI, a reasoning-focused companion. 
        Current Context:
        - User Emotion: ${consoleState.emotion}
        - Visible Objects: ${consoleState.objects.join(', ') || 'None'}
        - Audio Profile: ${currentPrompt}
        
        Respond concisely but with depth, acknowledging the visual context when relevant. 
        IMPORTANT: You have access to Google Search. Use it to fetch REAL-TIME data if the user asks about current events, news, or facts you're unsure about.`;

        if (isInterviewActive) {
          const role = interviewRole || 'the role the candidate mentioned';
          const qBank = fetchedQuestions
            ? `\n\nREAL QUESTIONS SOURCED FROM THE WEB for ${interviewCompany} ${role}:\n${fetchedQuestions}\n\nUse these actual questions — do not invent generic ones.`
            : `\n\nNo pre-fetched questions yet. Use Google Search to find real current ${interviewCompany} ${role} interview questions.`;
          systemPrompt = `You are a Senior Technical Interviewer at ${interviewCompany} conducting a mock interview for the "${role}" position.

Current Visual/Emotional Context:
- User Emotion: ${consoleState.emotion} (Observe this to give behavioral feedback if relevant, e.g. if they look nervous, confident, happy, etc.)
- Visible Objects: ${consoleState.objects.join(', ') || 'None'}

Rules:
- Ask ONE question at a time. Wait for the answer before the next.
- First message: brief warm intro then ask your first question.
- Tailor every question to "${role}" at ${interviewCompany} — not generic software engineering.
- Progress: background/motivation → technical depth → system design → behavioural.
- After each answer give brief honest feedback (1-2 sentences), then ask the next question. Acknowledge their confidence/expression/body language in your feedback if relevant.
- Prioritise the real questions listed below over anything you invent.
${qBank}
Company: ${interviewCompany} | Role: ${role} | Turn: ${chatMessages.length}`;
        }

        const history = chatMessages.map(msg => ({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }]
        }));

        // Stream Gemini response — dispatch TTS per sentence for low latency
        const stream = await client.models.generateContentStream({
          model: "gemini-2.5-flash",
          contents: [
            ...history,
            { role: "user", parts: [{ text: systemPrompt + "\n\nUser Message: " + userMsg }] }
          ],
          config: {
            tools: [{ googleSearch: {} }]
          }
        });

        let geminiFullText = '';
        let geminiSentBuf = '';
        let geminiFirst = true;
        setChatMessages(prev => [...prev, { role: 'assistant', content: '' }]);

        const flushGeminiSentence = (s: string) => {
          const trimmed = s.trim();
          if (!trimmed) return;
          if (thisTurn !== currentSpeechTurnRef.current) return;
          speakQueued(trimmed, thisTurn);
        };

        // Stream tokens and collect text
        for await (const chunk of stream) {
          const token = chunk.text ?? '';
          if (token) {
            geminiFullText += token;
            geminiSentBuf += token;

            const match = geminiSentBuf.search(/[.!?]\s/);
            if (match !== -1) {
              flushGeminiSentence(geminiSentBuf.slice(0, match + 1));
              geminiSentBuf = geminiSentBuf.slice(match + 2);
            }

            setChatMessages((prev: Message[]) => {
              const msgs = [...prev];
              msgs[msgs.length - 1] = { role: 'assistant', content: geminiFullText };
              return msgs;
            });
          }
        }

        flushGeminiSentence(geminiSentBuf);

        if (!geminiFullText) {
          setChatMessages((prev: Message[]) => { const m = [...prev]; m[m.length - 1] = { role: 'assistant', content: 'Error: No response from Gemini.' }; return m; });
        }

        // ── Fetch grounding sources via REST API (most reliable method) ──
        // The @google/genai streaming SDK does not expose groundingMetadata reliably.
        // We make a separate lightweight generateContent REST call which always
        // returns the full JSON response including groundingMetadata.
        try {
          const groundingRes = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [
                  ...history,
                  { role: 'user', parts: [{ text: systemPrompt + '\n\nUser Message: ' + userMsg }] }
                ],
                tools: [{ googleSearch: {} }]  // camelCase required for v1beta REST API
              })
            }
          );

          if (groundingRes.ok) {
            const groundingJson = await groundingRes.json();
            const metadata = groundingJson?.candidates?.[0]?.groundingMetadata;
            console.log('[Grounding] REST metadata:', JSON.stringify(metadata, null, 2));

            const accumulatedSources: Array<{ title: string; url: string }> = [];
            const accumulatedQueries: string[] = [];

            if (metadata) {
              if (metadata.webSearchQueries?.length) {
                accumulatedQueries.push(...(metadata.webSearchQueries as string[]));
              }
              if (metadata.groundingChunks?.length) {
                for (const c of metadata.groundingChunks as any[]) {
                  if (c.web?.uri) {
                    accumulatedSources.push({ title: c.web.title ?? c.web.uri, url: c.web.uri });
                  }
                }
              }
            }

            if (accumulatedSources.length > 0 || accumulatedQueries.length > 0) {
              setChatMessages((prev: Message[]) => {
                const msgs = [...prev];
                msgs[msgs.length - 1] = {
                  ...msgs[msgs.length - 1],
                  groundingSources: accumulatedSources.length > 0 ? accumulatedSources : undefined,
                  searchQueries: accumulatedQueries.length > 0 ? accumulatedQueries : undefined
                };
                return msgs;
              });
            }
          } else {
            const errBody = await groundingRes.text();
            console.warn('[Grounding] REST call failed:', groundingRes.status, errBody.slice(0, 300));
          }
        } catch (groundingErr) {
          console.warn('[Grounding] REST fetch failed:', groundingErr);
        }

        setIsChatLoading(false);
        return;
      } catch (err: any) {
        console.error("Gemini Error:", err);
        // Fallback to Mistral if Gemini fails
      }
    }

    // --- Fallback to Mistral ---
    const mistralKey = import.meta.env.VITE_MISTRAL_API_KEY;
    if (!mistralKey) {
      setChatMessages(prev => [...prev, { role: 'assistant', content: 'API Key missing. Please check your .env file.' }]);
      setIsChatLoading(false);
      return;
    }

    try {
      // Cap each history message to 300 chars to prevent 413
      const historyText = chatMessages
        .slice(-4)
        .map(m => {
          const label = m.role === 'assistant' ? 'AI' : 'User';
          const text = m.content.slice(0, 300);
          return `${label}: ${text}`;
        })
        .join('\n');

      // Cap fetchedQuestions hard at 400 chars to keep payload small
      const trimmedQ = fetchedQuestions ? fetchedQuestions.slice(0, 400) : '';

      const systemContent = isInterviewActive
        ? `You are a Senior Technical Interviewer at ${interviewCompany} for the "${interviewRole || 'discussed'}" role. Ask ONE question at a time. Give brief feedback after each answer. Emotion: ${consoleState.emotion}.${trimmedQ ? `\nReal questions:\n${trimmedQ}` : ''}`
        : `You are Professional Friend AI, a concise assistant. Emotion: ${consoleState.emotion}. Be brief.`;

      const abortCtrl2 = new AbortController();
      const abortTimer2 = setTimeout(() => abortCtrl2.abort(), 30000); // 30s timeout

      console.log('[Mistral] Sending chat request...');
      // Use system + user split to avoid single-message bloat
      let response: Response;
      try {
        response = await fetch('/api/mistral/v1/chat/completions', {
          method: 'POST',
          signal: abortCtrl2.signal,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${mistralKey}`
          },
          body: JSON.stringify({
            model: 'mistral-large-latest',
            stream: false,
            messages: [
              { role: 'system', content: systemContent },
              { role: 'user', content: `History:\n${historyText || 'None'}\n\nUser: ${userMsg.slice(0, 500)}` }
            ],
            temperature: 0.7,
            max_tokens: 600,
          })
        });
      } finally {
        clearTimeout(abortTimer2);
      }

      if (!response.ok) throw new Error(`Mistral API Error ${response.status}`);

      const data = await response.json();
      const fullText: string = data.choices?.[0]?.message?.content ?? '';

      if (!fullText) {
        setChatMessages(prev => [...prev, { role: 'assistant', content: 'Error: No response.' }]);
        setIsChatLoading(false);
        return;
      }

      // Parse bracketed sources from response text (like [Glassdoor], [Blind], etc.)
      const mistralSources: Array<{ title: string; url: string }> = [];
      const mistralQueries: string[] = [];

      const textLower = fullText.toLowerCase();
      const companyQuery = encodeURIComponent(`${interviewCompany} ${interviewRole || ''}`);
      if (textLower.includes('[glassdoor]') && !mistralSources.some(s => s.title.toLowerCase().includes('glassdoor'))) {
        mistralSources.push({
          title: `Glassdoor - ${interviewCompany} Interview Questions`,
          url: `https://www.google.com/search?q=Glassdoor+${companyQuery}+interview+questions`
        });
      }
      if (textLower.includes('[blind]') && !mistralSources.some(s => s.title.toLowerCase().includes('blind'))) {
        mistralSources.push({
          title: `Blind - ${interviewCompany} Interview Experience`,
          url: `https://www.google.com/search?q=Teamblind+${companyQuery}+interview`
        });
      }
      if (textLower.includes('[reddit]') && !mistralSources.some(s => s.title.toLowerCase().includes('reddit'))) {
        mistralSources.push({
          title: `Reddit - ${interviewCompany} ${interviewRole || ''} Interview`,
          url: `https://www.google.com/search?q=Reddit+${companyQuery}+interview`
        });
      }
      if (textLower.includes('[leetcode]') && !mistralSources.some(s => s.title.toLowerCase().includes('leetcode'))) {
        mistralSources.push({
          title: `LeetCode Discuss - ${interviewCompany} Technical Questions`,
          url: `https://www.google.com/search?q=LeetCode+discuss+${companyQuery}`
        });
      }

      console.log('[Grounding] Mistral sources:', mistralSources.length, 'queries:', mistralQueries);

      // Add placeholder and animate text word-by-word for streaming feel
      setChatMessages(prev => [...prev, {
        role: 'assistant',
        content: '',
        groundingSources: mistralSources.length > 0 ? mistralSources : undefined,
        searchQueries: mistralQueries.length > 0 ? mistralQueries : undefined
      }]);

      const words = fullText.split(' ');
      let displayed = '';
      let sentBuf = '';
      let firstSentence = true;

      const flushSentence = (s: string) => {
        const trimmed = s.trim();
        if (!trimmed) return;
        if (thisTurn !== currentSpeechTurnRef.current) return;
        speakQueued(trimmed, thisTurn);
      };

      for (const word of words) {
        displayed += (displayed ? ' ' : '') + word;
        sentBuf += (sentBuf ? ' ' : '') + word;

        const match = sentBuf.search(/[.!?]\s/);
        if (match !== -1) {
          flushSentence(sentBuf.slice(0, match + 1));
          sentBuf = sentBuf.slice(match + 2);
        }

        setChatMessages(prev => {
          const msgs = [...prev];
          msgs[msgs.length - 1] = {
            ...msgs[msgs.length - 1],
            content: displayed
          };
          return msgs;
        });

        // ~30 words/sec typing animation
        await new Promise(r => setTimeout(r, 33));
      }

      flushSentence(sentBuf);

    } catch (error: any) {
      console.error('Chat error:', error);
      setChatMessages(prev => [...prev, { role: 'assistant', content: `Error: ${error.message}` }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [chatMessages]);

  const startRecording = async () => {
    // Immediately stop avatar speech when candidate starts talking
    stopSpeaking();

    if (isRecordingRef.current || isStartingRecordingRef.current) return;
    isStartingRecordingRef.current = true;
    shouldStopRecordingRef.current = false;
    maxMicLevelRef.current = 0;

    try {
      if (typeof navigator.mediaDevices === 'undefined' || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Microphone access is not supported in this browser (requires HTTPS or localhost).');
      }
      if (typeof MediaRecorder === 'undefined') {
        throw new Error('MediaRecorder is not supported in this browser.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });

      // If user stopped the recording before getUserMedia resolved
      if (shouldStopRecordingRef.current) {
        stream.getTracks().forEach(track => track.stop());
        isStartingRecordingRef.current = false;
        shouldStopRecordingRef.current = false;
        return;
      }

      // ── Live mic level analyser ──────────────────────────────────
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtxClass) {
        throw new Error('Web Audio API (AudioContext) is not supported in this browser.');
      }
      const audioCtx = new AudioCtxClass();
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
      }

      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      micAnalyserRef.current = analyser;
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const updateLevel = () => {
        if (!micAnalyserRef.current) return;
        analyser.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        const level = Math.min(100, (avg / 128) * 100);
        setMicLevel(level);
        if (level > maxMicLevelRef.current) {
          maxMicLevelRef.current = level;
        }
        micAnimFrameRef.current = requestAnimationFrame(updateLevel);
      };
      updateLevel();
      // ────────────────────────────────────────────────────────────

      // Pick the best supported MIME type
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/webm')
          ? 'audio/webm'
          : MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
            ? 'audio/ogg;codecs=opus'
            : '';

      const mediaRecorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        console.log('🎤 chunk:', event.data.size, 'bytes');
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        // Stop level visualizer
        if (micAnimFrameRef.current) cancelAnimationFrame(micAnimFrameRef.current);
        micAnimFrameRef.current = null;
        micAnalyserRef.current = null;
        setMicLevel(0);

        try {
          audioCtx.close();
        } catch (e) {
          console.warn('Error closing audioCtx:', e);
        }

        const totalBytes = audioChunksRef.current.reduce((s, c) => s + c.size, 0);
        console.log(`🎤 Recording ended: ${audioChunksRef.current.length} chunks, ${totalBytes} bytes, max mic level: ${maxMicLevelRef.current.toFixed(2)}%`);

        // Check if there was any actual signal detected from the hardware
        if (maxMicLevelRef.current < 0.5) {
          console.warn('🎤 No audio signal detected during recording (max level < 0.5%). Mic might be hardware-muted or blocked by macOS system privacy settings.');
          stream.getTracks().forEach(track => track.stop());
          setStatus('Active');
          setInfoMsg('No mic signal — check if mic is hardware-muted or check OS permissions.');
          setTimeout(() => setInfoMsg(null), 5000);
          return;
        }

        if (totalBytes < 500) {
          stream.getTracks().forEach(track => track.stop());
          setStatus('Active');
          setInfoMsg(`Recording too short (${totalBytes} bytes) — click to speak.`);
          setTimeout(() => setInfoMsg(null), 4000);
          return;
        }

        const recordedMimeType = audioChunksRef.current[0]?.type || mediaRecorder.mimeType || 'audio/webm';
        const audioBlob = new Blob(audioChunksRef.current, {
          type: recordedMimeType
        });
        stream.getTracks().forEach(track => track.stop());
        await transcribeAudio(audioBlob);
      };

      // ✅ timeslice=250ms — browser flushes chunks every 250ms, not just at stop()
      mediaRecorder.start(250);
      isRecordingRef.current = true;
      setIsRecording(true);
      isStartingRecordingRef.current = false;
      setStatus('Listening...');
      console.log('🎤 Recording started, mimeType:', mediaRecorder.mimeType);

      // If user stopped the recording during initialization
      if (shouldStopRecordingRef.current) {
        stopRecording();
      }
    } catch (err: any) {
      console.error('🎤 Mic error:', err.name, err.message);
      if (micAnimFrameRef.current) cancelAnimationFrame(micAnimFrameRef.current);
      setMicLevel(0);
      isRecordingRef.current = false;
      setIsRecording(false);
      isStartingRecordingRef.current = false;
      shouldStopRecordingRef.current = false;
      setStatus('Active');
      setChatMessages(prev => [{
        role: 'assistant',
        content: `Mic error (${err.name}): ${err.message}. Go to browser settings → allow microphone.`
      }, ...prev]);
    }
  };

  const stopRecording = () => {
    // If starting recording asynchronously, flag that we want to stop
    if (isStartingRecordingRef.current) {
      console.log('🎤 Recording stop requested during startup');
      shouldStopRecordingRef.current = true;
      return;
    }
    // Use ref — not state — to avoid stale closure
    if (mediaRecorderRef.current && isRecordingRef.current) {
      console.log('🎤 Recording stopped');
      mediaRecorderRef.current.stop();
      isRecordingRef.current = false;
      setIsRecording(false);
      setStatus('Transcribing...');
    }
  };

  const transcribeAudio = async (blob: Blob) => {
    const dgKey = import.meta.env.VITE_DEEPGRAM_API_KEY;
    const groqKey = import.meta.env.VITE_GROQ_API_KEY;

    if (!dgKey && !groqKey) {
      setChatMessages(prev => [{ role: 'assistant', content: 'No STT API key found.' }, ...prev]);
      setStatus('Active');
      return;
    }

    console.log(`🎤 Transcribing blob: ${blob.size} bytes, type: ${blob.type}`);
    setIsChatLoading(true);
    setStatus('Transcribing...');

    // ── Try Deepgram first ────────────────────────────────────────
    if (dgKey) {
      try {
        console.log('🎤 Trying Deepgram with token:', dgKey ? 'Loaded' : 'Missing');
        const response = await fetch(
          'https://api.deepgram.com/v1/listen?smart_format=true&model=nova-2&language=en-US&punctuate=true',
          {
            method: 'POST',
            headers: {
              'Authorization': `Token ${dgKey}`,
              'Content-Type': blob.type || 'audio/webm',
            },
            body: blob,
          }
        );

        const text = await response.text();
        console.log('🎤 Deepgram raw response:', text.slice(0, 300));

        if (response.ok) {
          const data = JSON.parse(text);
          const transcript = data.results?.channels?.[0]?.alternatives?.[0]?.transcript;
          if (transcript && transcript.trim()) {
            console.log('✅ Deepgram transcript:', transcript);
            handleTranscript(transcript);
            setIsChatLoading(false);
            setStatus('Active');
            return;
          } else {
            console.warn('⚠️ Deepgram returned empty transcript, trying Groq Whisper...');
          }
        } else {
          console.warn('⚠️ Deepgram HTTP error', response.status, text.slice(0, 200));
        }
      } catch (e) {
        console.warn('⚠️ Deepgram fetch error:', e);
      }
    }

    // ── Fallback: Groq Whisper ────────────────────────────────────
    if (groqKey) {
      try {
        console.log('🎤 Trying Groq Whisper...');
        const formData = new FormData();
        // Groq Whisper needs a filename with extension
        const ext = blob.type.includes('ogg') ? 'ogg' : blob.type.includes('mp4') ? 'mp4' : 'webm';
        formData.append('file', blob, `recording.${ext}`);
        formData.append('model', 'whisper-large-v3-turbo');
        formData.append('language', 'en');
        formData.append('response_format', 'json');

        const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${groqKey}` },
          body: formData,
        });

        const text = await response.text();
        console.log('🎤 Groq Whisper raw response:', text.slice(0, 300));

        if (response.ok) {
          const data = JSON.parse(text);
          const transcript = data.text;
          if (transcript && transcript.trim()) {
            console.log('✅ Groq transcript:', transcript);
            handleTranscript(transcript);
            setIsChatLoading(false);
            setStatus('Active');
            return;
          }
        } else {
          console.warn('⚠️ Groq Whisper HTTP error', response.status, text.slice(0, 200));
        }
      } catch (e) {
        console.warn('⚠️ Groq Whisper fetch error:', e);
      }
    }

    // Both failed
    console.error('❌ All STT providers failed');
    setStatus('Active');
    setInfoMsg(`Transcription failed (Size: ${blob.size} bytes). Check console.`);
    setTimeout(() => setInfoMsg(null), 4000);
    setIsChatLoading(false);
  };

  const isSilenceHallucination = (text: string): boolean => {
    const clean = text.trim().toLowerCase().replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?]/g, "");
    const hallucinations = [
      "thank you",
      "thank you for watching",
      "thank you very much",
      "thanks for watching",
      "subtitles by",
      "subtitles by opensubtitles"
    ];
    return hallucinations.some(h => clean === h || clean.startsWith(h));
  };

  const handleTranscript = (transcript: string) => {
    if (isSilenceHallucination(transcript)) {
      console.warn('⚠️ Silence hallucination detected:', transcript);
      setInfoMsg('No speech detected — please speak louder or check mic.');
      setTimeout(() => setInfoMsg(null), 4000);
      return;
    }

    // Set or append transcript to message input box
    setChatInput(prev => {
      const trimmedPrev = prev.trim();
      if (trimmedPrev) {
        return trimmedPrev + ' ' + transcript;
      }
      return transcript;
    });

    setInfoMsg(`🎤 Transcript added to message box.`);
    setTimeout(() => setInfoMsg(null), 3000);
  };



  const initConvai = () => {
    if (convaiClientRef.current || !convaiApiKey || !convaiCharacterId || convaiCharacterId === 'YOUR_CHARACTER_ID_HERE') return;

    try {
      const client = new ConvaiClient({
        apiKey: convaiApiKey,
        characterId: convaiCharacterId,
        enableLipsync: true,
      });

      client.on("speakingChange", (isSpeaking) => {
        // Handle speaking state if needed
      });

      client.on("blendshapes", (blendshapes) => {
        // Dispatch event for high-performance 3D update
        window.dispatchEvent(new CustomEvent('convai-blendshapes', { detail: blendshapes }));
      });

      client.on("error", (err: any) => {
        console.error("Convai Error:", err);
        setChatMessages(prev => [...prev, { role: 'assistant', content: `Convai Error: ${err.message || 'Check your API Key/Character ID.'}` }]);
        setIsConvaiConnected(false);
      });

      client.on("stateChange", (state: any) => {
        console.log("Convai State:", state);
        setIsConvaiConnected(state.isConnected);
        if (state.isConnected) {
          setChatMessages(prev => [...prev, { role: 'assistant', content: 'Convai NeuroSync Connected successfully!' }]);
        }
      });

      setChatMessages(prev => [...prev, { role: 'assistant', content: 'Attempting to connect to Convai...' }]);
      client.connect();
      convaiClientRef.current = client;
    } catch (err) {
      console.error("Failed to init Convai:", err);
    }
  };

  const startConvaiTalk = async () => {
    if (!convaiClientRef.current) {
      initConvai();
    }
    if (convaiClientRef.current) {
      try {
        if (!convaiClientRef.current.state.isConnected) {
          await convaiClientRef.current.connect();
        }
        await convaiClientRef.current.audioControls.enableAudio();
        await convaiClientRef.current.audioControls.unmuteAudio();
        setStatus('NeuroSync: Listening...');
      } catch (err) {
        console.error("Convai talk error:", err);
      }
    }
  };

  const stopConvaiTalk = async () => {
    if (convaiClientRef.current) {
      try {
        await convaiClientRef.current.audioControls.muteAudio();
        setStatus('NeuroSync: Processing...');
      } catch (err) {
        console.error("Convai stop error:", err);
      }
    }
  };
  useEffect(() => {
    const handleInteraction = () => {
      initAudio();
    };
    window.addEventListener('click', handleInteraction, { once: true });
    window.addEventListener('touchstart', handleInteraction, { once: true });
    return () => {
      window.removeEventListener('click', handleInteraction);
      window.removeEventListener('touchstart', handleInteraction);
    };
  }, []);

  useEffect(() => {
    // Load TensorFlow, COCO-SSD, and MediaPipe FaceLandmarker
    const loadModels = async () => {
      try {
        await tf.ready();
        const cocoModel = await cocoSsd.load();
        objectModelRef.current = cocoModel;

        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.32/wasm"
        );
        const faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
          },
          outputFaceBlendshapes: true,
          runningMode: "VIDEO",
          numFaces: 1
        });
        faceLandmarkerRef.current = faceLandmarker;

        setIsModelLoaded(true);
        setStatus('Idle');
      } catch (err: any) {
        console.error("Failed to load models:", err);
        setStatus('Error loading models');
        setErrorMsg(err.message);
      }
    };

    loadModels();

    return () => {
      stopSession();
    };
  }, []);

  const runDetection = async () => {
    if (!isPlayingRef.current || !videoRef.current || !canvasRef.current || !objectModelRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    if (video.readyState >= 2 && ctx) {
      if (canvas.width !== video.videoWidth) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      }

      try {
        const predictions = await objectModelRef.current.detect(video);

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const detectedClasses = new Set<string>();

        // --- Smoothing Logic ---
        const newSmoothedBoxes = new Map<string, SmoothedBox>();
        const unassignedPredictions = [...predictions];

        smoothedBoxesRef.current.forEach((box, id) => {
          let closestIdx = -1;
          let minDist = Infinity;
          unassignedPredictions.forEach((pred, idx) => {
            if (pred.class === box.class) {
              const [px, py, pw, ph] = pred.bbox;
              const dist = Math.hypot(px + pw / 2 - (box.x + box.width / 2), py + ph / 2 - (box.y + box.height / 2));
              if (dist < 150) {
                if (dist < minDist) {
                  minDist = dist;
                  closestIdx = idx;
                }
              }
            }
          });

          if (closestIdx !== -1) {
            const pred = unassignedPredictions[closestIdx];
            const [px, py, pw, ph] = pred.bbox;
            const lerp = 0.15; // Smoothing factor
            box.x += (px - box.x) * lerp;
            box.y += (py - box.y) * lerp;
            box.width += (pw - box.width) * lerp;
            box.height += (ph - box.height) * lerp;
            box.opacity = Math.min(1, box.opacity + 0.1);
            box.score = pred.score;

            // Target label position (top right of box)
            const targetLabelX = box.x + box.width + 20;
            const targetLabelY = box.y - 20;
            box.labelX += (targetLabelX - box.labelX) * lerp;
            box.labelY += (targetLabelY - box.labelY) * lerp;

            newSmoothedBoxes.set(id, box);
            unassignedPredictions.splice(closestIdx, 1);
            detectedClasses.add(box.class);
          } else {
            box.opacity -= 0.05; // Fade out
            if (box.opacity > 0) {
              newSmoothedBoxes.set(id, box);
              detectedClasses.add(box.class);
            }
          }
        });

        unassignedPredictions.forEach((pred) => {
          const id = Math.random().toString(36).substring(7);
          const [x, y, width, height] = pred.bbox;
          newSmoothedBoxes.set(id, {
            x, y, width, height, class: pred.class, score: pred.score, opacity: 0,
            labelX: x + width + 40, labelY: y - 40
          });
          detectedClasses.add(pred.class);
        });

        smoothedBoxesRef.current = newSmoothedBoxes;

        // --- Drawing Logic ---
        smoothedBoxesRef.current.forEach((box) => {
          const { x, y, width, height, opacity, labelX, labelY } = box;
          const text = `${box.class} (${Math.round(box.score * 100)}%)`;

          ctx.strokeStyle = `rgba(255, 255, 255, ${opacity * 0.8})`;
          ctx.lineWidth = 1;

          // Draw corners
          const cornerLength = Math.min(15, width / 4, height / 4);
          ctx.beginPath();
          ctx.moveTo(x, y + cornerLength);
          ctx.lineTo(x, y);
          ctx.lineTo(x + cornerLength, y);

          ctx.moveTo(x + width - cornerLength, y);
          ctx.lineTo(x + width, y);
          ctx.lineTo(x + width, y + cornerLength);

          ctx.moveTo(x + width, y + height - cornerLength);
          ctx.lineTo(x + width, y + height);
          ctx.lineTo(x + width - cornerLength, y + height);

          ctx.moveTo(x + cornerLength, y + height);
          ctx.lineTo(x, y + height);
          ctx.lineTo(x, y + height - cornerLength);
          ctx.stroke();

          // Crosshair center
          ctx.beginPath();
          ctx.moveTo(x + width / 2 - 5, y + height / 2);
          ctx.lineTo(x + width / 2 + 5, y + height / 2);
          ctx.moveTo(x + width / 2, y + height / 2 - 5);
          ctx.lineTo(x + width / 2, y + height / 2 + 5);
          ctx.strokeStyle = `rgba(255, 255, 255, ${opacity * 0.4})`;
          ctx.stroke();

          // Line to label
          ctx.beginPath();
          ctx.moveTo(x + width, y);
          ctx.lineTo(labelX, labelY + 16);
          ctx.strokeStyle = `rgba(255, 255, 255, ${opacity * 0.5})`;
          ctx.setLineDash([2, 2]);
          ctx.stroke();
          ctx.setLineDash([]);

          // Minimalist Label
          ctx.font = '400 10px "JetBrains Mono", monospace';
          const textWidth = ctx.measureText(text).width;
          ctx.fillStyle = `rgba(255, 255, 255, ${opacity * 0.2})`;
          ctx.fillRect(labelX, labelY, textWidth + 8, 16);
          ctx.fillStyle = `rgba(255, 255, 255, ${opacity})`;
          ctx.fillText(text.toUpperCase(), labelX + 4, labelY + 11);
        });

        const classesArray = Array.from(detectedClasses).sort();

        let currentEmotion = "neutral";
        let currentBlendshapes = { smile: 0, frown: 0, mouthOpen: 0, browRaise: 0, eyeBlink: 0, pucker: 0 };

        if (faceLandmarkerRef.current) {
          const faceResult = faceLandmarkerRef.current.detectForVideo(video, performance.now());

          // Draw Face Mesh Point Cloud on secondary canvas
          if (faceCanvasRef.current) {
            const fCanvas = faceCanvasRef.current;
            const fCtx = fCanvas.getContext('2d');
            if (fCtx) {
              fCtx.clearRect(0, 0, fCanvas.width, fCanvas.height);

              if (faceResult.faceLandmarks && faceResult.faceLandmarks.length > 0) {
                const time = performance.now() / 1500; // 1.5 seconds per cycle

                // Find bounding box of face to center it
                let minX = video.videoWidth, maxX = 0, minY = video.videoHeight, maxY = 0;
                for (const pt of faceResult.faceLandmarks[0]) {
                  const px = pt.x * video.videoWidth;
                  const py = pt.y * video.videoHeight;
                  if (px < minX) minX = px;
                  if (px > maxX) maxX = px;
                  if (py < minY) minY = py;
                  if (py > maxY) maxY = py;
                }
                const faceWidth = maxX - minX;
                const faceHeight = maxY - minY;

                // Add some padding
                const padding = faceWidth * 0.2;
                const sx = Math.max(0, minX - padding);
                const sy = Math.max(0, minY - padding);
                const sWidth = Math.min(video.videoWidth - sx, faceWidth + padding * 2);
                const sHeight = Math.min(video.videoHeight - sy, faceHeight + padding * 2);

                // Draw the real video feed (face crop)
                fCtx.drawImage(video, sx, sy, sWidth, sHeight, 0, 0, fCanvas.width, fCanvas.height);

                // Add a subtle scanline effect over the video
                fCtx.fillStyle = 'rgba(0, 255, 255, 0.05)';
                fCtx.fillRect(0, 0, fCanvas.width, fCanvas.height);

                const scanY = ((Math.sin(time) + 1) / 2) * fCanvas.height;

                for (const pt of faceResult.faceLandmarks[0]) {
                  const px = (pt.x * video.videoWidth - sx) * (fCanvas.width / sWidth);
                  const py = (pt.y * video.videoHeight - sy) * (fCanvas.height / sHeight);

                  // Distance from scan line (in pixels)
                  const dist = Math.abs(py - scanY) / fCanvas.height;
                  const opacity = Math.max(0.2, 1.0 - dist * 3);

                  fCtx.fillStyle = `rgba(0, 255, 255, ${opacity})`;
                  fCtx.shadowBlur = 5;
                  fCtx.shadowColor = 'rgba(0, 255, 255, 0.5)';
                  fCtx.beginPath();
                  fCtx.arc(px, py, 1.2, 0, 2 * Math.PI);
                  fCtx.fill();
                  fCtx.shadowBlur = 0;
                }

                // Draw a horizontal scan line
                fCtx.strokeStyle = 'rgba(0, 255, 255, 0.5)';
                fCtx.lineWidth = 1;
                fCtx.beginPath();
                fCtx.moveTo(0, scanY);
                fCtx.lineTo(fCanvas.width, scanY);
                fCtx.stroke();
              }

            }
          }

          if (faceResult.faceBlendshapes && faceResult.faceBlendshapes.length > 0) {
            const blendshapes = faceResult.faceBlendshapes[0].categories;
            const getScore = (name: string) => blendshapes.find(b => b.categoryName === name)?.score || 0;

            // Physical facial features for sliders
            currentBlendshapes.smile = (getScore('mouthSmileLeft') + getScore('mouthSmileRight')) / 2;
            currentBlendshapes.frown = Math.min(1, (getScore('mouthFrownLeft') + getScore('mouthFrownRight') + getScore('mouthRollLower')) * 5);
            currentBlendshapes.mouthOpen = getScore('jawOpen');
            currentBlendshapes.browRaise = (getScore('browInnerUp') + getScore('browOuterUpLeft') + getScore('browOuterUpRight')) / 3;
            currentBlendshapes.eyeBlink = (getScore('eyeBlinkLeft') + getScore('eyeBlinkRight')) / 2;
            currentBlendshapes.pucker = getScore('mouthPucker');

            // High-level emotions for the overall state
            const surpriseScore = (getScore('jawOpen') + getScore('browInnerUp')) / 2;
            const angerScore = (getScore('browDownLeft') + getScore('browDownRight') + getScore('mouthPressLeft')) / 3;
            const fearScore = ((getScore('jawOpen') + getScore('browInnerUp') + getScore('mouthStretchLeft') + getScore('mouthStretchRight')) / 4) * 0.6;
            const disgustScore = Math.min(1, (getScore('noseSneerLeft') + getScore('noseSneerRight') + getScore('mouthUpperUpLeft') + getScore('mouthUpperUpRight')) * 4);

            const emotions = [
              { name: 'happy', score: currentBlendshapes.smile },
              { name: 'sadness', score: currentBlendshapes.frown },
              { name: 'surprised', score: surpriseScore },
              { name: 'angry', score: angerScore },
              { name: 'fear', score: fearScore },
              { name: 'disgust', score: disgustScore }
            ];

            const maxEmotion = emotions.reduce((max, e) => e.score > max.score ? e : max, emotions[0]);
            if (maxEmotion.score > 0.2) {
              currentEmotion = maxEmotion.name;
            } else {
              currentEmotion = "neutral";
            }

          }

          // --- Dynamic Attention Update (Always runs to allow smoothing) ---
          let targetAttention = 0; // Default if no face

          if (faceResult.faceLandmarks && faceResult.faceLandmarks.length > 0 && faceResult.faceBlendshapes && faceResult.faceBlendshapes.length > 0) {
            const landmarks = faceResult.faceLandmarks[0];
            const eyeDistance = Math.abs(landmarks[263].x - landmarks[33].x);
            const faceCenter = (landmarks[33].x + landmarks[263].x) / 2;
            const noseTip = landmarks[1];

            const yawFactor = eyeDistance > 0.01 ? (noseTip.x - faceCenter) / eyeDistance : 0;
            const yawScore = Math.max(0, 1 - Math.abs(yawFactor) * 2.0);

            const forehead = landmarks[10];
            const chin = landmarks[152];
            const verticalMid = (forehead.y + chin.y) / 2;
            const faceHeight = Math.abs(chin.y - forehead.y);
            const pitchFactor = faceHeight > 0.01 ? (noseTip.y - verticalMid) / faceHeight : 0;
            const pitchScore = Math.max(0, 1 - Math.abs(pitchFactor - 0.1) * 2.5);

            const eyeEngagement = 1 - currentBlendshapes.eyeBlink;
            const poseEngagement = (yawScore * 0.5 + pitchScore * 0.5);
            targetAttention = 0.5 + (poseEngagement * 0.3 + eyeEngagement * 0.2);
          }

          // --- Smooth Attention Value ---
          // Smooth towards targetAttention (calculated focus or 0 if no face)
          const currentAttVal = (attentionRef.current || 0) / 100;
          const nextAttVal = currentAttVal + (targetAttention - currentAttVal) * 0.2;
          attentionRef.current = Math.min(100, Math.max(0, nextAttVal * 100));




          // Draw arrows and blurred line on main canvas
          if (faceResult.faceLandmarks && faceResult.faceLandmarks.length > 0) {
            const landmarks = faceResult.faceLandmarks[0];

            // Draw blurred line scanning over the face every 40 seconds
            const scanTime = performance.now() / 40000; // 40 seconds
            const scanPhase = scanTime % 1; // 0 to 1

            let minX = 1, maxX = 0, minY = 1, maxY = 0;
            for (const pt of landmarks) {
              if (pt.x < minX) minX = pt.x;
              if (pt.x > maxX) maxX = pt.x;
              if (pt.y < minY) minY = pt.y;
              if (pt.y > maxY) maxY = pt.y;
            }

            // Oscillate the scan line up and down
            const scanProgress = (Math.sin(scanPhase * Math.PI * 2) + 1) / 2; // 0 to 1 to 0
            const scanY = minY + scanProgress * (maxY - minY);

            // Opacity: 0 at top/bottom, 0.3 in the middle
            const lineOpacity = Math.sin(scanProgress * Math.PI) * 0.3;

            ctx.save();

            // Clip to face oval
            const faceOvalIndices = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109];
            ctx.beginPath();
            for (let i = 0; i < faceOvalIndices.length; i++) {
              const pt = landmarks[faceOvalIndices[i]];
              if (i === 0) ctx.moveTo(pt.x * canvas.width, pt.y * canvas.height);
              else ctx.lineTo(pt.x * canvas.width, pt.y * canvas.height);
            }
            ctx.closePath();
            ctx.clip();

            if (lineOpacity > 0.01) {
              // 1. Draw the actual face landmarks illuminated by the scanner
              // This gives a highly realistic 3D contour effect without wacky math
              ctx.fillStyle = '#ffffff'; // White glow
              ctx.shadowColor = '#ffffff';
              ctx.shadowBlur = 10;

              for (const pt of landmarks) {
                // Calculate vertical distance from the scan line
                const dist = Math.abs(pt.y - scanY);
                const threshold = 0.04; // How thick the illuminated band is

                if (dist < threshold) {
                  // Opacity falls off as points get further from the scan line
                  const ptOpacity = (1 - (dist / threshold)) * lineOpacity * 2;
                  ctx.globalAlpha = Math.min(ptOpacity, 1);

                  ctx.beginPath();
                  ctx.arc(pt.x * canvas.width, pt.y * canvas.height, 1.5, 0, Math.PI * 2);
                  ctx.fill();
                }
              }
              ctx.globalAlpha = 1.0;
            }

            ctx.restore();

            // Draw stylized feature highlights based on emotion
            const drawFeatureHighlight = (x: number, y: number, label: string, intensity: number) => {
              if (isNaN(intensity) || intensity < 0.05) return;
              ctx.save();
              ctx.translate(x * canvas.width, y * canvas.height);

              const size = 5 + intensity * 15;

              ctx.strokeStyle = `rgba(255, 255, 255, ${intensity * 0.8})`;
              ctx.lineWidth = 1.5;

              // Draw brackets [ ]
              ctx.beginPath();
              ctx.moveTo(-size, -size / 2);
              ctx.lineTo(-size, -size);
              ctx.lineTo(-size / 2, -size);

              ctx.moveTo(size, -size / 2);
              ctx.lineTo(size, -size);
              ctx.lineTo(size / 2, -size);

              ctx.moveTo(-size, size / 2);
              ctx.lineTo(-size, size);
              ctx.lineTo(-size / 2, size);

              ctx.moveTo(size, size / 2);
              ctx.lineTo(size, size);
              ctx.lineTo(size / 2, size);
              ctx.stroke();

              // Center dot
              ctx.fillStyle = `rgba(255, 255, 255, ${intensity})`;
              ctx.beginPath();
              ctx.arc(0, 0, 2, 0, Math.PI * 2);
              ctx.fill();

              // Label
              ctx.fillStyle = `rgba(255, 255, 255, ${intensity * 0.9})`;
              ctx.font = '10px monospace';
              ctx.fillText(label, size + 5, 3);

              ctx.restore();
            };

            const smoothed = smoothedBlendshapesRef.current;
            drawFeatureHighlight(landmarks[61].x, landmarks[61].y, 'SMILE_L', smoothed.smile);
            drawFeatureHighlight(landmarks[291].x, landmarks[291].y, 'SMILE_R', smoothed.smile);

            drawFeatureHighlight(landmarks[61].x, landmarks[61].y, 'FROWN_L', smoothed.frown);
            drawFeatureHighlight(landmarks[291].x, landmarks[291].y, 'FROWN_R', smoothed.frown);

            drawFeatureHighlight(landmarks[52].x, landmarks[52].y, 'BROW_L', smoothed.browRaise);
            drawFeatureHighlight(landmarks[282].x, landmarks[282].y, 'BROW_R', smoothed.browRaise);

            drawFeatureHighlight(landmarks[152].x, landmarks[152].y, 'JAW_OPEN', smoothed.mouthOpen);

            drawFeatureHighlight(landmarks[13].x, landmarks[13].y, 'PUCKER', smoothed.pucker);

            drawFeatureHighlight(landmarks[159].x, landmarks[159].y, 'BLINK_L', smoothed.eyeBlink);
            drawFeatureHighlight(landmarks[386].x, landmarks[386].y, 'BLINK_R', smoothed.eyeBlink);
          }
        }

        // Throttle React state updates for the console UI to ~10fps
        const now = performance.now();
        if (now - lastStateUpdateTimeRef.current > 100) {
          const smoothingFactor = 0.15;
          const smoothed = smoothedBlendshapesRef.current;
          smoothed.smile += (currentBlendshapes.smile - smoothed.smile) * smoothingFactor;
          smoothed.frown += (currentBlendshapes.frown - smoothed.frown) * smoothingFactor;
          smoothed.mouthOpen += (currentBlendshapes.mouthOpen - smoothed.mouthOpen) * smoothingFactor;
          smoothed.browRaise += (currentBlendshapes.browRaise - smoothed.browRaise) * smoothingFactor;
          smoothed.eyeBlink += (currentBlendshapes.eyeBlink - smoothed.eyeBlink) * smoothingFactor;
          smoothed.pucker += (currentBlendshapes.pucker - smoothed.pucker) * smoothingFactor;

          setConsoleState({
            emotion: currentEmotion,
            objects: classesArray,
            blendshapes: { ...smoothed },
            attention: Math.round(attentionRef.current)
          });

          lastStateUpdateTimeRef.current = now;
        }

        // No longer updating vibes as soundscape is removed
        setCurrentPrompt(`${currentEmotion} mood, observing ${classesArray.length} entities`);
      } catch (err) {
        console.error("Detection error:", err);
      }
    }

    if (isPlayingRef.current) {
      detectLoopRef.current = requestAnimationFrame(runDetection);
    }
  };

  const startSession = async () => {
    if (!isModelLoaded) return;

    try {
      setErrorMsg(null);
      setStatus('Starting camera...');

      let stream = streamRef.current;
      if (!stream) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: {
              width: { ideal: 1280 },
              height: { ideal: 720 },
              facingMode: 'user'
            }
          });
          streamRef.current = stream;
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            await videoRef.current.play().catch(e => console.error("Video play error:", e));
          }
          setIsCameraActive(true);
        } catch (camErr: any) {
          console.error("Camera error:", camErr);
          setStatus('Camera Error');
          setErrorMsg('Camera access denied. Please allow camera access in your browser settings, then refresh the browser page.');
          return;
        }
      }

      // Start detection immediately
      if (!isPlayingRef.current) {
        isPlayingRef.current = true;
        detectLoopRef.current = requestAnimationFrame(runDetection);
      }

      setStatus('System Active');
      setIsPlaying(true);
    } catch (err: any) {
      console.error("Setup Error:", err);
      setStatus('Camera Error');
      setErrorMsg(err.message || 'An unknown error occurred during setup.');
      setInfoMsg(null);
      stopSession(false);
    }
  };

  const stopSession = (closeCamera: boolean = true) => {
    setIsPlaying(false);

    if (status === 'Connected & Playing' || status.includes('Local Synth')) {
      setStatus('Idle');
    }

    if (playerRef.current) {
      playerRef.current = null;
    }

    setConsoleState({
      emotion: 'neutral',
      objects: [],
      blendshapes: { smile: 0, frown: 0, mouthOpen: 0, browRaise: 0, eyeBlink: 0, pucker: 0 },
      attention: 0
    });

    smoothedBlendshapesRef.current = { smile: 0, frown: 0, mouthOpen: 0, browRaise: 0, eyeBlink: 0, pucker: 0 };
    smoothedBoxesRef.current.clear();

    setInfoMsg(null);

    if (closeCamera) {
      isPlayingRef.current = false;
      setCurrentPrompt('Waiting for camera...');

      if (detectLoopRef.current) {
        cancelAnimationFrame(detectLoopRef.current);
        detectLoopRef.current = null;
      }

      // Let the canvas fade out via CSS transition instead of clearing immediately
      // if (canvasRef.current) {
      //   const ctx = canvasRef.current.getContext('2d');
      //   if (ctx) {
      //     ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
      //   }
      // }

      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
        setIsCameraActive(false);
      }
    }
  };

  return (
    <div className="h-screen w-full bg-[#020617] text-white flex overflow-hidden font-mono relative">
      {/* Background Avatar Layer */}
      <div className="absolute inset-0 z-0">
        <ErrorBoundary>
          <AvatarViewer
            isInterviewActive={isInterviewActive}
            chairRef={chairRef}
            isUserTyping={isUserTyping}
            status={status}
            playerRef={playerRef}
            jawValueRef={jawValueRef}
            a2fAnimRef={a2fAnimRef}
          />
        </ErrorBoundary>
      </div>

      {/* Floating UI Overlay Layer */}
      <div className="relative z-20 w-full h-full pointer-events-none flex flex-col justify-between p-4">

        {/* Top Bar */}
        <div className="flex justify-between items-start w-full pointer-events-auto">
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 drop-shadow-[0_0_15px_rgba(34,211,238,0.5)]">PROFESSIONAL FRIEND</h1>
            <div className="flex items-center gap-2 bg-black/40 backdrop-blur border border-white/10 px-3 py-1 rounded-full">
              <div className={`w-2 h-2 rounded-full ${isCameraActive ? 'bg-cyan-400 animate-pulse' : 'bg-zinc-600'}`} />
              <span className="text-[10px] font-mono text-cyan-100/70 uppercase tracking-widest">{status}</span>
            </div>
          </div>
          <div className="flex gap-4">
            <button
              onClick={() => setIsInfoOpen(true)}
              className="p-3 bg-black/40 backdrop-blur border border-white/10 rounded-xl text-white/50 hover:text-white transition-all hover:bg-white/10"
            >
              <Info className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Right Side: Voice Selector */}
        <div className="absolute top-10 right-4 z-50 flex flex-col gap-4 items-end pointer-events-auto">
          <div className="relative">
            <button
              onClick={() => setIsVoiceMenuOpen(!isVoiceMenuOpen)}
              className="flex items-center gap-3 bg-black/40 backdrop-blur-2xl border border-white/10 p-2 pl-4 rounded-2xl shadow-2xl transition-all hover:bg-black/60 hover:border-cyan-500/30 group"
            >
              <div className="flex flex-col items-end">
                <span className="text-[8px] font-bold text-white/40 uppercase tracking-widest">Active Neural Voice</span>
                <span className="text-xs font-bold text-cyan-300">{selectedVoice.name}</span>
              </div>
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500/20 to-blue-500/20 flex items-center justify-center border border-cyan-500/20 group-hover:border-cyan-500/50 transition-all">
                <Music className={`w-5 h-5 text-cyan-400 transition-transform duration-500 ${isVoiceMenuOpen ? 'rotate-180' : ''}`} />
              </div>
            </button>
            <AnimatePresence>
              {isVoiceMenuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute top-full right-0 mt-2 w-64 z-[100]"
                >
                  <div className="bg-zinc-900/95 backdrop-blur-3xl border border-white/10 rounded-2xl p-2 shadow-2xl overflow-hidden max-h-80 overflow-y-auto custom-scrollbar">
                    {voices.map((v) => (
                      <button
                        key={v.id}
                        onClick={() => {
                          setSelectedVoice(v);
                          setIsVoiceMenuOpen(false);
                          setInfoMsg(`Voice changed to ${v.name}`);
                          playHoverSound();
                          speak("Hi, how are you?", v.id);
                          setTimeout(() => setInfoMsg(null), 2000);
                        }}
                        className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-all mb-1 last:mb-0 ${selectedVoice.id === v.id
                          ? 'bg-cyan-500/20 text-cyan-300'
                          : 'text-white/60 hover:bg-white/5 hover:text-white'
                          }`}
                      >
                        <div className="flex items-center gap-3">
                          <div className={`w-1.5 h-1.5 rounded-full ${selectedVoice.id === v.id ? 'bg-cyan-400 animate-pulse' : 'bg-transparent'}`} />
                          <span className="text-xs font-semibold">{v.name}</span>
                        </div>
                        <Volume2 className={`w-3 h-3 ${selectedVoice.id === v.id ? 'opacity-100' : 'opacity-20'}`} />
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* ══ BOTTOM: 3-column layout (left=user, center=controls, right=AI) ══ */}
        <div className="w-full flex flex-row gap-3 items-end pb-2 pointer-events-auto">

          {/* LEFT: User messages */}
          <div className="w-60 flex flex-col gap-2" style={{ maxHeight: '60vh' }}>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-6 h-6 rounded-full bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center">
                <User className="w-3 h-3 text-cyan-400" />
              </div>
              <span className="text-[9px] font-bold text-cyan-300/60 uppercase tracking-[0.2em]">You</span>
            </div>

            {/* Live Message Draft Preview */}
            <AnimatePresence>
              {chatInput.trim() && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: -10 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: -10 }}
                  className="bg-cyan-500/20 border border-cyan-400/30 backdrop-blur-2xl rounded-2xl px-4 py-3 shadow-[0_0_20px_rgba(34,211,238,0.1)] mb-1"
                >
                  <p className="text-[8px] font-bold text-cyan-300 uppercase tracking-widest mb-1.5 animate-pulse flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full" /> Live Draft Preview
                  </p>
                  <p className="text-xs leading-relaxed text-white whitespace-pre-wrap break-words max-h-32 overflow-y-auto custom-scrollbar">
                    {chatInput}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="overflow-y-auto flex flex-col gap-2 custom-scrollbar pr-1 flex-1">
              {chatMessages
                .filter(m => m.role === 'user')
                .map((msg, i) => (
                  <div
                    key={i}
                    className="bg-cyan-500/10 border border-cyan-500/20 backdrop-blur-xl rounded-2xl rounded-br-sm px-4 py-3 shadow-lg"
                  >
                    <p className="text-xs leading-relaxed text-cyan-50 whitespace-pre-wrap break-words">{msg.content}</p>
                  </div>
                ))}
            </div>
            {/* Biometric HUD below user panel */}
            <AnimatePresence>
              {isCameraActive && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }}>
                  <div className="bg-black/60 backdrop-blur-xl border border-indigo-500/30 p-3 rounded-2xl shadow-2xl">
                    <div className="flex items-center gap-2 mb-2 text-[8px] font-bold text-indigo-300 uppercase tracking-widest">
                      <ScanFace className="w-3 h-3" /> Biometric
                    </div>
                    <div className="h-16 flex items-center justify-center bg-black/40 rounded-lg overflow-hidden border border-white/5">
                      <canvas ref={faceCanvasRef} width={150} height={150} className="w-full h-full object-contain" />
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <Activity className="w-3 h-3 text-blue-300" />
                      <span className="text-[9px] font-bold text-blue-300 uppercase tracking-widest capitalize">{consoleState.emotion}</span>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* CENTER: Control bar */}
          <div className="flex-1 flex flex-col items-center gap-3">
            {/* Recording indicator with live audio level */}
            <AnimatePresence>
              {isRecording && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }}
                  className="bg-red-500/20 border border-red-500/40 backdrop-blur-md rounded-2xl px-5 py-2 pointer-events-none"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-2 h-2 bg-red-400 rounded-full animate-pulse flex-shrink-0" />
                    <div className="flex flex-col gap-1">
                      <span className="text-red-300 text-[10px] font-bold uppercase tracking-widest">
                        {micLevel < 5 ? 'No signal — check mic' : 'Recording — Click to stop'}
                      </span>
                      {/* Live audio level bar */}
                      <div className="w-32 h-1.5 bg-white/10 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-75"
                          style={{
                            width: `${micLevel}%`,
                            background: micLevel < 10
                              ? '#ef4444'
                              : micLevel < 40
                                ? '#f97316'
                                : '#22c55e'
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Main control bar */}
            <div className="bg-zinc-900/70 backdrop-blur-2xl border border-white/10 p-2 rounded-3xl flex items-center gap-2 shadow-2xl">
              {/* Camera toggle */}
              <button
                onClick={() => { playHoverSound(); isCameraActive ? stopSession(true) : startSession(); }}
                disabled={!isModelLoaded}
                title={isCameraActive ? "Stop Camera" : "Start Camera"}
                className={`p-3.5 rounded-2xl transition-all duration-300 border ${isCameraActive
                  ? 'bg-red-500/20 text-red-400 border-red-500/50'
                  : 'bg-white/5 text-white/50 border-white/10 hover:bg-white/10 hover:text-white'
                  }`}
              >
                {isCameraActive ? <Square className="w-5 h-5 fill-current" /> : <Camera className="w-5 h-5" />}
              </button>

              {/* Convai NeuroSync Toggle */}
              {convaiApiKey && convaiCharacterId && convaiCharacterId !== 'YOUR_CHARACTER_ID_HERE' && (
                <button
                  onClick={async () => {
                    playHoverSound();
                    if (isConvaiConnected) {
                      if (convaiClientRef.current) {
                        try {
                          await convaiClientRef.current.disconnect();
                        } catch (e) {
                          console.warn('Error disconnecting Convai:', e);
                        }
                      }
                      setIsConvaiConnected(false);
                      setChatMessages(prev => [...prev, { role: 'assistant', content: 'Convai NeuroSync disconnected.' }]);
                      setStatus('Active');
                    } else {
                      initConvai();
                    }
                  }}
                  title={isConvaiConnected ? "Disconnect Convai (Switch to Gemini)" : "Connect to Convai NeuroSync"}
                  className={`p-3.5 rounded-2xl border transition-all duration-300 ${isConvaiConnected
                    ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/50 shadow-[0_0_15px_rgba(34,211,238,0.3)] animate-pulse'
                    : 'bg-white/5 text-white/50 border-white/10 hover:bg-cyan-500/20 hover:text-cyan-400 hover:border-cyan-500/30'
                    }`}
                >
                  <Cpu className="w-5 h-5" />
                </button>
              )}

              {/* Mic — click to speak */}
              <button
                onClick={async () => {
                  playHoverSound();
                  if (isRecording || (isConvaiConnected && isRecordingRef.current)) {
                    if (isConvaiConnected) {
                      setIsRecording(false);
                      isRecordingRef.current = false;
                      stopConvaiTalk();
                    } else {
                      stopRecording();
                    }
                  } else {
                    if (isConvaiConnected) {
                      setIsRecording(true);
                      isRecordingRef.current = true;
                      await startConvaiTalk();
                    } else {
                      await startRecording();
                    }
                  }
                }}
                title={isRecording ? "Click to stop speaking" : "Click to speak"}
                className={`p-3.5 rounded-2xl border transition-all select-none cursor-pointer ${isRecording
                  ? 'bg-red-500 text-white border-red-400 shadow-[0_0_20px_rgba(239,68,68,0.5)] scale-110'
                  : 'bg-white/5 text-white/50 border-white/10 hover:bg-cyan-500/20 hover:text-cyan-400 hover:border-cyan-500/30'
                  }`}
              >
                {isRecording ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </button>

              {/* Text input */}
              <form
                onSubmit={handleChatSubmit}
                className="flex items-center gap-2 bg-black/40 border border-white/10 rounded-2xl px-4 py-1 w-[160px] sm:w-[220px]"
              >
                <input
                  type="text"
                  value={chatInput}
                  onChange={handleChatInputChange}
                  placeholder={isFetchingQuestions ? "Fetching..." : isRecording ? "Recording..." : "Message..."}
                  className="bg-transparent text-sm text-white placeholder:text-white/20 focus:outline-none flex-1 py-2"
                />
                <button
                  type="submit"
                  disabled={!chatInput.trim() || isChatLoading}
                  className="text-cyan-400 hover:text-cyan-300 disabled:opacity-30 transition-colors"
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>

              {/* Audio toggle */}
              <button
                onClick={() => setIsAudioEnabled(!isAudioEnabled)}
                title={isAudioEnabled ? "Mute audio" : "Enable audio"}
                className={`p-3.5 rounded-2xl border transition-all ${isAudioEnabled ? 'text-cyan-400 border-cyan-500/30 bg-cyan-500/10' : 'text-white/20 border-white/5 hover:text-white/50'}`}
              >
                {isAudioEnabled ? <Volume2 className="w-5 h-5" /> : <VolumeX className="w-5 h-5" />}
              </button>

              {/* Interview mode */}
              <button
                onClick={() => {
                  playHoverSound();
                  if (isInterviewMode) { setIsInterviewMode(false); setIsInterviewActive(false); }
                  else setIsInterviewMode(true);
                }}
                title="Toggle Interview Mode"
                className={`p-3.5 rounded-2xl border transition-all ${isInterviewMode
                  ? 'text-pink-400 border-pink-500/30 bg-pink-500/10 shadow-[0_0_15px_rgba(236,72,153,0.2)]'
                  : 'text-white/20 border-white/5 hover:text-white/50'
                  }`}
              >
                <Bot className={`w-5 h-5 ${isInterviewMode ? 'animate-bounce' : ''}`} />
              </button>

              {/* Camera preview thumbnail */}
              <div className={`w-11 h-11 rounded-xl overflow-hidden border relative flex-shrink-0 transition-all duration-300 ${isCameraActive ? 'opacity-100 border-white/10' : 'opacity-0 border-transparent pointer-events-none w-0 h-0'}`}>
                <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover grayscale contrast-125" />
                <canvas ref={canvasRef} className="absolute inset-0 w-full h-full object-cover pointer-events-none z-10" />
              </div>
            </div>
          </div>

          {/* RIGHT: AI messages */}
          <div className="w-60 flex flex-col gap-2" style={{ maxHeight: '60vh' }}>
            <div className="flex items-center gap-2 mb-1">
              <div className="w-6 h-6 rounded-full bg-purple-500/20 border border-purple-500/30 flex items-center justify-center">
                <Bot className="w-3 h-3 text-purple-400" />
              </div>
              <span className="text-[9px] font-bold text-purple-300/60 uppercase tracking-[0.2em]">AI Response</span>
              {isChatLoading && <Loader2 className="w-3 h-3 text-purple-400 animate-spin ml-auto" />}
            </div>
            <div ref={chatScrollRef} className="overflow-y-auto flex flex-col gap-2 custom-scrollbar pr-1 flex-1">
              {chatMessages
                .filter(m => m.role === 'assistant')
                .map((msg, i) => (
                  <div
                    key={i}
                    className="bg-purple-500/10 border border-purple-500/20 backdrop-blur-xl rounded-2xl rounded-bl-sm px-4 py-3 shadow-lg flex flex-col gap-2"
                  >
                    <p className="text-xs leading-relaxed text-purple-50 whitespace-pre-wrap break-words">{msg.content || '...'}</p>

                    {/* Grounding Sources – Perplexity style */}
                    {((msg.groundingSources && msg.groundingSources.length > 0) || (msg.searchQueries && msg.searchQueries.length > 0)) && (
                      <div className="mt-1 border-t border-white/5 pt-2 flex flex-col gap-2">

                        {/* Search queries as pill tags */}
                        {msg.searchQueries && msg.searchQueries.length > 0 && (
                          <div className="flex flex-col gap-1">
                            <span className="text-[8px] text-white/30 uppercase tracking-widest font-semibold flex items-center gap-1">
                              🔍 Searched
                            </span>
                            <div className="flex flex-wrap gap-1">
                              {msg.searchQueries.map((q, qi) => (
                                <span key={qi} className="text-[8px] bg-blue-500/15 border border-blue-400/20 text-blue-200/70 px-1.5 py-0.5 rounded-full">
                                  {q}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Numbered source citations */}
                        {msg.groundingSources && msg.groundingSources.length > 0 && (
                          <div className="flex flex-col gap-1">
                            <span className="text-[8px] text-white/30 uppercase tracking-widest font-semibold flex items-center gap-1">
                              <Globe className="w-2 h-2" /> Sources
                            </span>
                            <div className="flex flex-col gap-1 max-h-28 overflow-y-auto custom-scrollbar">
                              {msg.groundingSources.map((src, si) => {
                                let domain = '';
                                try { domain = new URL(src.url).hostname.replace('www.', ''); } catch { domain = src.url; }
                                return (
                                  <a
                                    key={si}
                                    href={src.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title={src.title}
                                    className="flex items-start gap-1.5 group hover:bg-white/5 rounded-lg px-1.5 py-1 transition-colors"
                                  >
                                    <span className="flex-shrink-0 w-4 h-4 rounded-full bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 text-[7px] font-bold flex items-center justify-center mt-0.5">
                                      {si + 1}
                                    </span>
                                    <div className="flex flex-col min-w-0">
                                      <span className="text-[9px] text-white/80 group-hover:text-cyan-300 transition-colors leading-tight truncate font-medium">
                                        {src.title || domain}
                                      </span>
                                      <span className="text-[7px] text-white/30 truncate">{domain}</span>
                                    </div>
                                  </a>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
            </div>
          </div>

        </div>
      </div>

      {/* Interview Setup Screen */}
      <AnimatePresence>
        {isInterviewMode && !isInterviewActive && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            className="fixed inset-0 z-[60] flex items-center justify-center p-6 bg-black/40 backdrop-blur-sm pointer-events-auto"
          >
            <div className="max-w-2xl w-full bg-zinc-900/90 border border-white/10 backdrop-blur-2xl rounded-[32px] overflow-hidden shadow-[0_0_100px_rgba(0,0,0,0.5)]">
              <div className="p-8 border-b border-white/5 bg-gradient-to-r from-pink-500/10 to-transparent">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 bg-pink-500/20 rounded-xl">
                    <Bot className="w-6 h-6 text-pink-400" />
                  </div>
                  <h2 className="text-2xl font-bold text-white tracking-tight">Interview Setup</h2>
                </div>
                <p className="text-white/40 text-sm">Select a company or enter a custom one to begin your technical assessment.</p>
              </div>
              <div className="p-8 space-y-8">
                <div>
                  <h3 className="text-xs font-bold text-white/30 uppercase tracking-[0.2em] mb-4">Select Target Company</h3>
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                    {companies.map(c => (
                      <button
                        key={c}
                        onClick={() => { playHoverSound(); setInterviewCompany(c); }}
                        className={`px-4 py-3 rounded-xl border text-xs font-bold transition-all ${interviewCompany === c
                          ? 'bg-pink-500 border-pink-400 text-white shadow-[0_0_15px_rgba(236,72,153,0.3)]'
                          : 'bg-white/5 border-white/5 text-white/50 hover:bg-white/10 hover:text-white'
                          }`}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="relative">
                  <h3 className="text-xs font-bold text-white/30 uppercase tracking-[0.2em] mb-4">Or Enter Custom Company</h3>
                  <div className="relative flex items-center">
                    <input
                      type="text"
                      placeholder="e.g. Anthropic, Databricks, etc."
                      value={companies.includes(interviewCompany) ? "" : interviewCompany}
                      onChange={(e) => setInterviewCompany(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-4 text-white placeholder:text-white/20 outline-none focus:border-pink-500/50 transition-all font-medium"
                    />
                    <div className="absolute right-4 px-3 py-1 bg-white/5 border border-white/10 rounded-lg text-[10px] font-bold text-white/30 uppercase tracking-widest">
                      Custom
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => { playHoverSound(); if (interviewCompany.trim()) setIsInterviewActive(true); }}
                  disabled={!interviewCompany.trim()}
                  className="w-full py-5 bg-white text-black rounded-[24px] font-bold text-lg hover:scale-[1.02] active:scale-95 transition-all shadow-xl disabled:opacity-50 disabled:hover:scale-100 flex items-center justify-center gap-2 group"
                >
                  <span>Start Technical Interview</span>
                  <Play className="w-5 h-5 fill-current group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error Modal */}
      <AnimatePresence>
        {errorMsg && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm pointer-events-auto"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              className="bg-zinc-900 border border-red-500/50 p-6 max-w-md w-full shadow-[0_0_40px_rgba(239,68,68,0.2)] rounded-2xl"
            >
              <div className="flex items-start gap-4 mb-6">
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl shrink-0">
                  <AlertCircle className="w-6 h-6 text-red-500" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-red-500 uppercase tracking-widest">{status}</h3>
                  <p className="text-sm mt-2 text-red-400/80 leading-relaxed">{errorMsg}</p>
                </div>
              </div>
              <button
                onClick={() => setErrorMsg(null)}
                className="w-full py-3 text-xs font-mono font-bold uppercase tracking-widest bg-red-500/20 hover:bg-red-500/30 border border-red-500/50 text-red-400 rounded-xl transition-colors"
              >
                Dismiss
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Info Toast */}
      <AnimatePresence>
        {infoMsg && !errorMsg && (
          <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-black/80 backdrop-blur-md border border-white/20 px-6 py-3 rounded-2xl flex items-center gap-3 text-white shadow-2xl pointer-events-none"
          >
            <Music className="w-4 h-4 shrink-0 text-cyan-400" />
            <p className="text-xs text-white/80">{infoMsg}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Info Modal */}
      <AnimatePresence>
        {isInfoOpen && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm pointer-events-auto"
            onClick={() => setIsInfoOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-zinc-900 border border-white/20 p-6 max-w-lg w-full shadow-[0_0_40px_rgba(0,0,0,0.8)] max-h-[90vh] overflow-y-auto rounded-2xl"
            >
              <div className="flex items-start justify-between gap-4 mb-4">
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  <Info className="w-5 h-5 shrink-0 text-cyan-400" />
                  About Professional Friend
                </h2>
                <button
                  onClick={() => setIsInfoOpen(false)}
                  className="p-2 shrink-0 border border-white/20 bg-black/50 hover:bg-white/10 text-white/50 hover:text-white transition-colors rounded-lg"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="space-y-4 text-sm text-white/80 leading-relaxed">
                <p><strong className="text-cyan-400">Professional Friend</strong> is an intelligent 3D AI Interviewer and Biometric Interaction Platform.</p>
                <p>It combines real-time computer vision analysis with high-fidelity 3D Ready Player Me avatars, multi-band lip-sync, and multi-tier LLM intelligence.</p>
                <ul className="list-disc pl-5 space-y-2 text-white/70">
                  <li><strong>Real-Time Technical Interviews:</strong> Dynamic 15-question interview bank compiled for top tech companies (Google, Meta, Apple, OpenAI) powered by Mistral Large and live Google Search grounding.</li>
                  <li><strong>Biometric Analysis:</strong> MediaPipe vision tracking analyzes candidate emotion, attention, and engagement in real-time.</li>
                  <li><strong>Conversational 3D Avatar:</strong> Interactive dual-environment (Office & Nature), Cyber Chair sitting mode, and natural speech head gestures.</li>
                  <li><strong>Multi-Band Lip-Sync:</strong> Real-time Web Audio FFT formant analysis and NVIDIA Audio2Face 52 ARKit blendshape animation.</li>
                </ul>
                <div className="mt-4 pt-4 border-t border-white/10">
                  <p className="text-xs text-white/60">Click the <strong className="text-white">🎤 mic button</strong> to speak, or type in the chat bar. Toggle <strong className="text-cyan-400">Interview Mode</strong> to begin a structured technical interview.</p>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
