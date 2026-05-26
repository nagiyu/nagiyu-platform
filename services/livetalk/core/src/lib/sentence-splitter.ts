/**
 * 文単位 VOICEVOX パイプライン用のセンテンスバッファ（Phase 2c / Issue #3249）。
 *
 * LLM ストリームのテキスト delta を受け取り、文区切り（。！？!?）で分割する。
 * 区切り文字の後に続くテキストは次の文のバッファとして保持する。
 *
 * 使い方:
 *   const buf = new SentenceBuffer();
 *   for await (const delta of llmStream) {
 *     const sentences = buf.push(delta);  // 完成した文の配列
 *     for (const s of sentences) { ... }
 *   }
 *   const remaining = buf.flush();         // ストリーム終了後の残余
 */
export class SentenceBuffer {
  private buffer = '';

  push(delta: string): string[] {
    this.buffer += delta;
    return this.extractSentences();
  }

  flush(): string {
    const remaining = this.buffer.trim();
    this.buffer = '';
    return remaining;
  }

  private extractSentences(): string[] {
    const sentences: string[] = [];

    while (true) {
      const idx = this.findTerminatorIndex();
      if (idx === -1) break;

      const sentence = this.buffer.slice(0, idx + 1).trim();
      this.buffer = this.buffer.slice(idx + 1);

      // 句点・感嘆符・疑問符だけの文はスキップ（VOICEVOX に送っても意味がない）
      const contentWithoutTerminators = sentence.replace(/[。！？!?]/g, '').trim();
      if (contentWithoutTerminators) {
        sentences.push(sentence);
      }
    }

    return sentences;
  }

  private findTerminatorIndex(): number {
    for (let i = 0; i < this.buffer.length; i++) {
      const ch = this.buffer[i];
      if (ch === '。' || ch === '！' || ch === '？' || ch === '!' || ch === '?') {
        return i;
      }
    }
    return -1;
  }
}
