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
