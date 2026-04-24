/// <reference lib="webworker" />

// Kokoro TTS Web Worker — runs inference off the main thread so the UI stays responsive.

import { KokoroTTS } from 'kokoro-js';

type InMsg =
  | { type: 'INIT' }
  | { type: 'SYNTHESIZE'; text: string; id: string };

type OutMsg =
  | { type: 'INIT_PROGRESS'; progress: number }
  | { type: 'INIT_DONE' }
  | { type: 'INIT_ERROR'; error: string }
  | { type: 'SYNTHESIS_DONE'; audio: ArrayBuffer; sampleRate: number; id: string }
  | { type: 'SYNTHESIS_ERROR'; error: string; id: string };

let tts: KokoroTTS | null = null;

self.onmessage = async (e: MessageEvent<InMsg>) => {
  const msg = e.data;

  try {
    if (msg.type === 'INIT') {
      // q4 quantization: ~90 MB download, cached by browser after first fetch
      tts = await KokoroTTS.from_pretrained('onnx-community/Kokoro-82M-ONNX', {
        dtype: 'q4',
        progress_callback: (info: { status?: string; progress?: number }) => {
          if (info.status === 'progress') {
            const pct = Math.round(info.progress ?? 0);
            self.postMessage({ type: 'INIT_PROGRESS', progress: pct } satisfies OutMsg);
          }
        },
      });
      self.postMessage({ type: 'INIT_DONE' } satisfies OutMsg);

    } else if (msg.type === 'SYNTHESIZE') {
      if (!tts) {
        self.postMessage({
          type: 'SYNTHESIS_ERROR', error: 'Model not initialized', id: msg.id,
        } satisfies OutMsg);
        return;
      }
      // af_bella: warm, natural American-English female voice
      const result = await tts.generate(msg.text, { voice: 'af_bella' });
      // Slice so the ArrayBuffer is detached from any internal typed array before transfer
      const audioBuffer = result.audio.buffer.slice(0) as ArrayBuffer;
      self.postMessage(
        { type: 'SYNTHESIS_DONE', audio: audioBuffer, sampleRate: result.sampling_rate, id: msg.id } satisfies OutMsg,
        [audioBuffer],
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (msg.type === 'SYNTHESIZE') {
      self.postMessage({ type: 'SYNTHESIS_ERROR', error: message, id: msg.id } satisfies OutMsg);
    } else {
      self.postMessage({ type: 'INIT_ERROR', error: message } satisfies OutMsg);
    }
  }
};
