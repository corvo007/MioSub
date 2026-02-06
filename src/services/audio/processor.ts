/**
 * Slice audio buffer to a specific time range and convert to WAV
 */
export const sliceAudioBuffer = async (
  originalBuffer: AudioBuffer,
  start: number,
  end: number
): Promise<Blob> => {
  const duration = originalBuffer.duration;
  const safeStart = Math.max(0, start);
  const safeEnd = Math.min(duration, end);
  const length = safeEnd - safeStart;

  if (length <= 0) throw new Error('Invalid slice duration');

  // 16kHz mono is standard for Whisper
  const targetRate = 16000;
  const offlineCtx = new OfflineAudioContext(1, length * targetRate, targetRate);

  const source = offlineCtx.createBufferSource();
  source.buffer = originalBuffer;
  source.connect(offlineCtx.destination);

  // Start playing the original buffer at the negative offset of our start time
  // This effectively shifts the audio so that 'start' becomes 0 in the offline context
  source.start(0, safeStart, length);

  const resampled = await offlineCtx.startRendering();
  return audioBufferToWav(resampled);
};

export function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const dataByteCount = buffer.length * blockAlign;
  const bufferLength = 44 + dataByteCount;

  const arrayBuffer = new ArrayBuffer(bufferLength);
  const view = new DataView(arrayBuffer);

  const writeString = (view: DataView, offset: number, string: string) => {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  };

  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataByteCount, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataByteCount, true);

  let offset = 44;
  for (let i = 0; i < buffer.length; i++) {
    for (let channel = 0; channel < numChannels; channel++) {
      const sample = buffer.getChannelData(channel)[i];
      const s = Math.max(-1, Math.min(1, sample));
      const int16 = s < 0 ? s * 0x8000 : s * 0x7fff;
      view.setInt16(offset, int16, true);
      offset += 2;
    }
  }
  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

// Singleton context for creating buffers to avoid running out of AudioContexts
let sharedAudioContext: AudioContext | OfflineAudioContext | null = null;

function getAudioContext(sampleRate: number): AudioContext | OfflineAudioContext {
  if (!sharedAudioContext) {
    // Use OfflineAudioContext for better performance and no hardware limit issues
    // Arbitrary length/channels as we only use it for createBuffer
    sharedAudioContext = new OfflineAudioContext(1, 1, sampleRate);
  }
  return sharedAudioContext;
}

/**
 * Extracts a slice of an AudioBuffer as a new AudioBuffer (synchronous).
 */
export function extractBufferSlice(buffer: AudioBuffer, start: number, end: number): AudioBuffer {
  const sampleRate = buffer.sampleRate;
  const startOffset = Math.floor(start * sampleRate);
  const endOffset = Math.floor(end * sampleRate);
  const frameCount = endOffset - startOffset;

  const ctx = getAudioContext(sampleRate);

  if (frameCount <= 0) {
    return ctx.createBuffer(buffer.numberOfChannels, 1, sampleRate);
  }

  const newBuffer = ctx.createBuffer(buffer.numberOfChannels, frameCount, sampleRate);

  for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    const newChannelData = newBuffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      // Check bounds to avoid errors
      if (i + startOffset < channelData.length) {
        newChannelData[i] = channelData[i + startOffset];
      }
    }
  }

  return newBuffer;
}

/**
 * Parse WAV file ArrayBuffer directly into AudioBuffer.
 * This bypasses decodeAudioData() which has memory limits for large files.
 * Supports standard PCM WAV files (16-bit, mono/stereo).
 *
 * @param arrayBuffer WAV file data
 * @returns AudioBuffer with the decoded audio
 * @throws Error if WAV format is invalid or unsupported
 */
export function parseWavToAudioBuffer(arrayBuffer: ArrayBuffer): AudioBuffer {
  const view = new DataView(arrayBuffer);

  // Validate RIFF header
  const riff = String.fromCharCode(
    view.getUint8(0),
    view.getUint8(1),
    view.getUint8(2),
    view.getUint8(3)
  );
  if (riff !== 'RIFF') {
    throw new Error('Invalid WAV file: missing RIFF header');
  }

  const wave = String.fromCharCode(
    view.getUint8(8),
    view.getUint8(9),
    view.getUint8(10),
    view.getUint8(11)
  );
  if (wave !== 'WAVE') {
    throw new Error('Invalid WAV file: missing WAVE format');
  }

  // Find fmt chunk
  let offset = 12;
  let fmtFound = false;
  let audioFormat = 0;
  let numChannels = 0;
  let sampleRate = 0;
  let bitsPerSample = 0;

  while (offset < arrayBuffer.byteLength - 8) {
    const chunkId = String.fromCharCode(
      view.getUint8(offset),
      view.getUint8(offset + 1),
      view.getUint8(offset + 2),
      view.getUint8(offset + 3)
    );
    const chunkSize = view.getUint32(offset + 4, true);

    if (chunkId === 'fmt ') {
      audioFormat = view.getUint16(offset + 8, true);
      numChannels = view.getUint16(offset + 10, true);
      sampleRate = view.getUint32(offset + 12, true);
      bitsPerSample = view.getUint16(offset + 22, true);
      fmtFound = true;
    }

    if (chunkId === 'data') {
      if (!fmtFound) {
        throw new Error('Invalid WAV file: data chunk before fmt chunk');
      }

      // Only support PCM format (1) or IEEE float (3)
      if (audioFormat !== 1 && audioFormat !== 3) {
        throw new Error(
          `Unsupported WAV format: ${audioFormat} (only PCM and IEEE float supported)`
        );
      }

      const dataOffset = offset + 8;
      const dataSize = chunkSize;
      const bytesPerSample = bitsPerSample / 8;
      const numSamples = Math.floor(dataSize / (numChannels * bytesPerSample));

      // Create AudioBuffer
      const ctx = getAudioContext(sampleRate);
      const audioBuffer = ctx.createBuffer(numChannels, numSamples, sampleRate);

      // Parse samples based on format
      if (audioFormat === 1 && bitsPerSample === 16) {
        // 16-bit PCM
        for (let channel = 0; channel < numChannels; channel++) {
          const channelData = audioBuffer.getChannelData(channel);
          for (let i = 0; i < numSamples; i++) {
            const sampleOffset = dataOffset + (i * numChannels + channel) * 2;
            const sample = view.getInt16(sampleOffset, true);
            channelData[i] = sample / 32768; // Normalize to [-1, 1]
          }
        }
      } else if (audioFormat === 3 && bitsPerSample === 32) {
        // 32-bit IEEE float
        for (let channel = 0; channel < numChannels; channel++) {
          const channelData = audioBuffer.getChannelData(channel);
          for (let i = 0; i < numSamples; i++) {
            const sampleOffset = dataOffset + (i * numChannels + channel) * 4;
            channelData[i] = view.getFloat32(sampleOffset, true);
          }
        }
      } else {
        throw new Error(`Unsupported WAV bit depth: ${bitsPerSample}-bit (format: ${audioFormat})`);
      }

      return audioBuffer;
    }

    offset += 8 + chunkSize;
    // Align to even byte boundary
    if (chunkSize % 2 !== 0) offset++;
  }

  throw new Error('Invalid WAV file: no data chunk found');
}

/**
 * Merges multiple AudioBuffers into a single AudioBuffer.
 * Assumes all buffers have the same number of channels.
 * Resamples if necessary to match the target sample rate.
 */
export function mergeAudioBuffers(buffers: AudioBuffer[], sampleRate: number): AudioBuffer {
  const ctx = getAudioContext(sampleRate);

  if (buffers.length === 0) {
    return ctx.createBuffer(1, 1, sampleRate); // Minimum valid buffer
  }

  const numberOfChannels = buffers[0].numberOfChannels;
  const totalLength = buffers.reduce((acc, buf) => acc + buf.length, 0);

  // If totalLength is 0, create a minimum buffer
  if (totalLength === 0) {
    return ctx.createBuffer(numberOfChannels, 1, sampleRate);
  }

  const result = ctx.createBuffer(numberOfChannels, totalLength, sampleRate);

  let offset = 0;
  for (const buffer of buffers) {
    for (let channel = 0; channel < numberOfChannels; channel++) {
      const channelData = buffer.getChannelData(channel);
      result.copyToChannel(channelData, channel, offset);
    }
    offset += buffer.length;
  }

  return result;
}
