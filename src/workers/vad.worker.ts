/// <reference lib="webworker" />

// Declare globals from the scripts we will import
declare const vad: any;
declare const ort: any;

let myVad: any = null;

self.onmessage = async (e: MessageEvent) => {
    const msg = e.data;

    try {
        if (msg.command === 'init') {
            // Load libraries
            // We assume these are served at the root
            try {
                importScripts('/ort.min.js', '/vad.bundle.min.js');
            } catch (e) {
                throw new Error(`Failed to load scripts: ${e}`);
            }

            if (typeof vad === 'undefined' || typeof ort === 'undefined') {
                throw new Error("Failed to load VAD libraries via importScripts");
            }

            // Configure ORT
            ort.env.wasm.wasmPaths = "/";
            // ort.env.logLevel = "error"; 

            // Initialize VAD with options
            myVad = await vad.NonRealTimeVAD.new(msg.options);

            self.postMessage({ type: 'ready' });

        } else if (msg.command === 'process') {
            if (!myVad) {
                throw new Error("VAD not initialized");
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
                        latestTime: startSec
                    });
                }
            }

            self.postMessage({ type: 'result', segments });
        }
    } catch (error: any) {
        self.postMessage({ type: 'error', message: error.message || String(error) });
    }
};
