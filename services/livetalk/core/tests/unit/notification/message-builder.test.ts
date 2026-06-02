import {
  buildNotificationMessage,
  buildCriticalNotificationMessage,
} from '../../../src/notification/message-builder.js';

describe('buildNotificationMessage', () => {
  describe('veryLong', () => {
    it('veryLong → VERY_LONG_MESSAGES からピックする', () => {
      const msg = buildNotificationMessage({ toneBucket: 'veryLong' }, 0);
      expect(msg.title).toContain('ひより');
      expect(msg.body.length).toBeGreaterThan(0);
    });

    it('seed が変わっても title/body の形式は維持される', () => {
      const msg0 = buildNotificationMessage({ toneBucket: 'veryLong' }, 0);
      const msg1 = buildNotificationMessage({ toneBucket: 'veryLong' }, 1);
      expect(msg0.title).toContain('ひより');
      expect(msg1.title).toContain('ひより');
    });

    it('knowledgeTopic がある場合も veryLong テンプレートを使う', () => {
      const msg = buildNotificationMessage(
        { toneBucket: 'veryLong', knowledgeTopic: 'TypeScript' },
        0
      );
      // veryLong は topic なし固定テンプレートを使う
      expect(msg.body).not.toContain('TypeScript');
    });
  });

  describe('long', () => {
    it('long・topic なし → LONG_MESSAGES からピックする', () => {
      const msg = buildNotificationMessage({ toneBucket: 'long' }, 0);
      expect(msg.title).toContain('ひより');
      expect(msg.body).toMatch(/久しぶり/);
    });

    it('long・topic あり → LONG_WITH_TOPIC を使う', () => {
      const msg = buildNotificationMessage({ toneBucket: 'long', knowledgeTopic: 'React' }, 0);
      expect(msg.body).toContain('React');
    });
  });

  describe('normal', () => {
    it('normal・topic なし → NORMAL_MESSAGES_WITHOUT_TOPIC からピックする', () => {
      const msg = buildNotificationMessage({ toneBucket: 'normal' }, 0);
      expect(msg.title).toContain('ひより');
      expect(msg.body.length).toBeGreaterThan(0);
      // topic なし固定テンプレートは topic 文字列を含まない
      expect(msg.body).not.toMatch(/について/);
    });

    it('normal・topic あり → NORMAL_MESSAGES_WITH_TOPIC を使う', () => {
      const msg = buildNotificationMessage({ toneBucket: 'normal', knowledgeTopic: 'Python' }, 0);
      expect(msg.body).toContain('Python');
    });

    it('seed が異なると異なるテンプレートが選ばれる可能性がある', () => {
      // 少なくとも同じ toneBucket で同じ seed は同じメッセージ
      const a = buildNotificationMessage({ toneBucket: 'normal' }, 42);
      const b = buildNotificationMessage({ toneBucket: 'normal' }, 42);
      expect(a.body).toBe(b.body);
    });
  });

  describe('seed のデフォルト値', () => {
    it('seed 省略時も呼び出せる（Date.now() が使われる）', () => {
      const msg = buildNotificationMessage({ toneBucket: 'normal' });
      expect(msg.title).toBeDefined();
      expect(msg.body).toBeDefined();
    });
  });
});

describe('buildCriticalNotificationMessage', () => {
  it('タイトルに「重要」を含む', () => {
    const msg = buildCriticalNotificationMessage('パスワード変更');
    expect(msg.title).toContain('重要');
    expect(msg.title).toContain('ひより');
  });

  it('本文にトピックを含む', () => {
    const msg = buildCriticalNotificationMessage('健康診断');
    expect(msg.body).toContain('健康診断');
  });

  it('末尾に句点がある Topic は正規化される', () => {
    const msg = buildCriticalNotificationMessage('飲み物の新作。');
    expect(msg.body).toContain('飲み物の新作');
    expect(msg.body).not.toMatch(/。について/);
  });

  it('長い説明文 Topic でも文が崩壊しない', () => {
    const longTopic =
      '日本の食べ物（特にスイーツ・コンビニ新商品）の最新トレンドを検索しました。メーカーの新作、コラボ商品、新食感菓子など、春〜初夏にかけての動きを中心に調べたよ。';
    const msg = buildCriticalNotificationMessage(longTopic);
    // 末尾句点が除去されて「〜調べたよ」で終わる文字列が Topic として埋め込まれる
    expect(msg.body).not.toMatch(/。について/);
  });
});

describe('normalizeKnowledgeTopic（通知テンプレート堅牢化）', () => {
  it('normal・topic 末尾句点が除去される', () => {
    const msg = buildNotificationMessage(
      { toneBucket: 'normal', knowledgeTopic: 'コーヒーの新作。' },
      0
    );
    expect(msg.body).not.toMatch(/。について|。のこと/);
    expect(msg.body).toContain('コーヒーの新作');
  });

  it('long・topic 末尾句点が除去される', () => {
    const msg = buildNotificationMessage({ toneBucket: 'long', knowledgeTopic: 'カフェラテ。' }, 0);
    expect(msg.body).toContain('カフェラテ');
    expect(msg.body).not.toMatch(/。のこと/);
  });
});
