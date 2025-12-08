/// <reference lib="webworker" />

// Declare globals from the scripts we will import
declare const vad: any;
declare const ort: any;

let myVad: any = null;

self.onmessage = async (e: MessageEvent) => {
  const msg = e.data;

  try {
    if (msg.command === 'init') {
      // Load libraries using the base URL passed from main thread
      const base = msg.base || '/';

      try {
        const ortUrl = new URL('ort.min.js', base).href;
        const vadUrl = new URL('vad.bundle.min.js', base).href;

        console.log('[VAD Worker] Loading scripts from:', { ortUrl, vadUrl, base });
        importScripts(ortUrl, vadUrl);
        console.log('[VAD Worker] Scripts loaded successfully');
      } catch (e: any) {
        const errorMsg = `Failed to load scripts from base '${base}': ${e.message || e}`;
        console.error('[VAD Worker]', errorMsg, e);
        throw new Error(errorMsg);
      }

      if (typeof vad === 'undefined' || typeof ort === 'undefined') {
        const errorMsg = `Failed to load VAD libraries via importScripts. vad=${typeof vad}, ort=${typeof ort}`;
        console.error('[VAD Worker]', errorMsg);
        throw new Error(errorMsg);
      }

      console.debug('[VAD Worker] [Debug] Libraries loaded, configuring ORT...');
      // Configure ORT
      ort.env.wasm.wasmPaths = base;
      // ort.env.logLevel = "error";

      console.debug(
        '[VAD Worker] [Debug] Initializing VAD with options:',
        JSON.stringify(msg.options, null, 2)
      );
      // Initialize VAD with options
      myVad = await vad.NonRealTimeVAD.new(msg.options);

      console.debug('[VAD Worker] [Debug] VAD initialized successfully');
      self.postMessage({ type: 'ready' });
    } else if (msg.command === 'process') {
      if (!myVad) {
        throw new Error('VAD not initialized');
      }

      const { audioData, sampleRate } = msg;
      const segments: { start: number; end: number }[] = [];
      let segmentCount = 0;

      // Run VAD
      for await (const { start, end } of myVad.run(audioData, sampleRate)) {
        const startSec = start / 1000;
        const endSec = end / 1000;
        segments.push({ start: startSec, end: endSec });

        segmentCount++;
        if (segmentCount % 50 === 0) {
          self.postMessage({
            type: 'progress',
            processed: segmentCount,
            latestTime: startSec,
          });
        }
      }

      self.postMessage({ type: 'result', segments });
    }
  } catch (error: any) {
    const errorMessage = error.message || String(error);
    const errorStack = error.stack || '';
    console.error('[VAD Worker] Error:', errorMessage, errorStack);
    self.postMessage({
      type: 'error',
      message: errorMessage,
      stack: errorStack,
      details: error,
    });
  }
};
