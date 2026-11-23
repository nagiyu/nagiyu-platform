/** WAV ヘッダのバイト数 (PCM 形式の標準ヘッダ)。 */
const WAV_HEADER_BYTES = 44;

/**
 * 16 bit little endian の PCM に WAV ヘッダを付けて返す純粋関数。
 *
 * ブラウザは `decodeAudioData` で再生するため、生 PCM ではなくコンテナ付きで渡す必要がある。
 *
 * @param pcm - 16 bit little endian の PCM バイト列
 * @param sampleRate - サンプリングレート (Hz)
 * @param channels - チャンネル数
 */
export function pcm16ToWav(pcm: Uint8Array, sampleRate: number, channels: number): ArrayBuffer {
  const bytesPerSample = 2;
  const blockAlign = channels * bytesPerSample;
  const buffer = new ArrayBuffer(WAV_HEADER_BYTES + pcm.byteLength);
  const view = new DataView(buffer);

  const writeAscii = (offset: number, value: string): void => {
    for (let i = 0; i < value.length; i++) {
      view.setUint8(offset + i, value.charCodeAt(i));
    }
  };

  writeAscii(0, 'RIFF');
  view.setUint32(4, 36 + pcm.byteLength, true);
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bytesPerSample * 8, true);
  writeAscii(36, 'data');
  view.setUint32(40, pcm.byteLength, true);
  new Uint8Array(buffer, WAV_HEADER_BYTES).set(pcm);

  return buffer;
}
