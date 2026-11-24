import { pcm16ToWav } from '../../../src/openai-voice/wav.js';

describe('pcm16ToWav', () => {
  const pcm = new Uint8Array([1, 2, 3, 4, 5, 6]);

  it('44 バイトのヘッダ + PCM 本体の長さになる', () => {
    expect(pcm16ToWav(pcm, 24000, 1).byteLength).toBe(44 + 6);
  });

  it('RIFF/WAVE/fmt/data のチャンク ID とサイズが正しい', () => {
    const view = new DataView(pcm16ToWav(pcm, 24000, 1));
    const ascii = (offset: number): string =>
      String.fromCharCode(...[0, 1, 2, 3].map((i) => view.getUint8(offset + i)));

    expect(ascii(0)).toBe('RIFF');
    expect(view.getUint32(4, true)).toBe(36 + 6);
    expect(ascii(8)).toBe('WAVE');
    expect(ascii(12)).toBe('fmt ');
    expect(view.getUint32(16, true)).toBe(16);
    expect(ascii(36)).toBe('data');
    expect(view.getUint32(40, true)).toBe(6);
  });

  it('PCM 形式・チャンネル数・サンプルレート・ビット深度が反映される', () => {
    const view = new DataView(pcm16ToWav(pcm, 24000, 1));

    expect(view.getUint16(20, true)).toBe(1);
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(24000);
    expect(view.getUint32(28, true)).toBe(48000);
    expect(view.getUint16(32, true)).toBe(2);
    expect(view.getUint16(34, true)).toBe(16);
  });

  it('ステレオではブロックサイズとバイトレートが倍になる', () => {
    const view = new DataView(pcm16ToWav(pcm, 24000, 2));

    expect(view.getUint16(32, true)).toBe(4);
    expect(view.getUint32(28, true)).toBe(96000);
  });

  it('PCM 本体がヘッダの直後にそのまま入る', () => {
    const bytes = new Uint8Array(pcm16ToWav(pcm, 24000, 1));

    expect(Array.from(bytes.slice(44))).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('空の PCM でもヘッダだけの WAV を返す', () => {
    expect(pcm16ToWav(new Uint8Array(0), 24000, 1).byteLength).toBe(44);
  });
});
