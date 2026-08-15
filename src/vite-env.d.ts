/// <reference types="vite/client" />

declare module '@convai/web-sdk' {
  export class ConvaiClient {
    constructor(options: any);
    onResponse(callback: (response: any) => void): void;
    onAudio(callback: (audio: any) => void): void;
    onError(callback: (error: any) => void): void;
    sendTextChunk(text: string): void;
    startAudioChunk(): void;
    endAudioChunk(): void;
    reset(): void;
    [key: string]: any;
  }
}
