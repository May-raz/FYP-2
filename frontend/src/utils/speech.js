export function encodeWavPcm16(samples, sampleRate) {
  const bytesPerSample = 2;
  const blockAlign = bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeString = (offset, value) => {
    for (let i = 0; i < value.length; i += 1) {
      view.setUint8(offset + i, value.charCodeAt(i));
    }
  };
  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);
  let offset = 44;
  for (let i = 0; i < samples.length; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += 2;
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

export async function preprocessAudioBlob(rawBlob) {
  if (!(rawBlob instanceof Blob) || rawBlob.size < 256) {
    throw new Error('Recorded audio is empty');
  }
  const arrayBuffer = await rawBlob.arrayBuffer();
  const audioContext = new (window.AudioContext || window.webkitAudioContext)();
  try {
    const decoded = await audioContext.decodeAudioData(arrayBuffer.slice(0));
    const channelCount = Math.max(1, decoded.numberOfChannels);
    const mono = new Float32Array(decoded.length);
    for (let c = 0; c < channelCount; c += 1) {
      const data = decoded.getChannelData(c);
      for (let i = 0; i < data.length; i += 1) {
        mono[i] += data[i] / channelCount;
      }
    }
    let peak = 0;
    for (let i = 0; i < mono.length; i += 1) {
      peak = Math.max(peak, Math.abs(mono[i]));
    }
    const gain = peak > 0 ? Math.min(6, 0.92 / peak) : 1;
    for (let i = 0; i < mono.length; i += 1) {
      mono[i] *= gain;
    }
    const silenceThreshold = 0.015;
    let start = 0;
    while (start < mono.length && Math.abs(mono[start]) < silenceThreshold) start += 1;
    let end = mono.length - 1;
    while (end > start && Math.abs(mono[end]) < silenceThreshold) end -= 1;
    const trimmed = mono.slice(start, end + 1);
    if (!trimmed.length) {
      throw new Error('No clear speech detected');
    }
    const targetRate = 16000;
    const offline = new OfflineAudioContext(1, Math.ceil((trimmed.length / decoded.sampleRate) * targetRate), targetRate);
    const buffer = offline.createBuffer(1, trimmed.length, decoded.sampleRate);
    buffer.copyToChannel(trimmed, 0);
    const source = offline.createBufferSource();
    source.buffer = buffer;
    source.connect(offline.destination);
    source.start(0);
    const rendered = await offline.startRendering();
    const normalized = rendered.getChannelData(0);
    return encodeWavPcm16(normalized, targetRate);
  } finally {
    await audioContext.close().catch(() => {});
  }
}
