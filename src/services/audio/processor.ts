/**
 * Slice audio buffer to a specific time range and convert to WAV
 */
export const sliceAudioBuffer = async (originalBuffer: AudioBuffer, start: number, end: number): Promise<Blob> => {
    const duration = originalBuffer.duration;
    const safeStart = Math.max(0, start);
    const safeEnd = Math.min(duration, end);
    const length = safeEnd - safeStart;

    if (length <= 0) throw new Error("Invalid slice duration");

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
            const int16 = s < 0 ? s * 0x8000 : s * 0x7FFF;
            view.setInt16(offset, int16, true);
            offset += 2;
        }
    }
    return new Blob([arrayBuffer], { type: 'audio/wav' });
}
