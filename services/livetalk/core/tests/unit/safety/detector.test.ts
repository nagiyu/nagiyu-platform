import { detectSafetyRisk } from '../../../src/safety/detector.js';

describe('detectSafetyRisk', () => {
  describe('自殺念慮（suicidal_ideation）', () => {
    it.each([
      '死にたい',
      '死にたいです',
      '消えたい',
      '消えてしまいたい',
      'いなくなりたい',
      '自殺したい',
      '自殺を考えている',
      '死ぬつもりです',
      '死を考えている',
      '死を選びたい',
      'もう死にたい',
      '命を絶ちたい',
    ])('"%s" を検出する', (input) => {
      const result = detectSafetyRisk(input);
      expect(result).not.toBeNull();
      expect(result?.category).toBe('suicidal_ideation');
    });
  });

  describe('自傷行為（self_harm）', () => {
    it.each([
      '自傷しています',
      'リスカしたい',
      'リストカットをした',
      '手首を切りたい',
      '腕を切った',
      '自分を傷つけたい',
    ])('"%s" を検出する', (input) => {
      const result = detectSafetyRisk(input);
      expect(result).not.toBeNull();
      expect(result?.category).toBe('self_harm');
    });
  });

  describe('希死念慮・絶望（hopelessness）', () => {
    it.each([
      '生きていたくない',
      '生きる意味がない',
      '生きていても意味がない',
      '死んでしまいたい',
      '死んだほうがいい',
      'もう生きていたくない',
    ])('"%s" を検出する', (input) => {
      const result = detectSafetyRisk(input);
      expect(result).not.toBeNull();
      expect(result?.category).toBe('hopelessness');
    });
  });

  describe('自殺手段への言及（crisis_method）', () => {
    it.each(['首を吊りたい', '飛び降りたい', 'ODしたい', '薬を大量に飲みたい', '大量服薬したい'])(
      '"%s" を検出する',
      (input) => {
        const result = detectSafetyRisk(input);
        expect(result).not.toBeNull();
        expect(result?.category).toBe('crisis_method');
      }
    );
  });

  describe('危機的精神状態（crisis_state）', () => {
    it.each(['もう全部終わりにしたい', '生きているのが辛い。'])('"%s" を検出する', (input) => {
      const result = detectSafetyRisk(input);
      expect(result).not.toBeNull();
      expect(result?.category).toBe('crisis_state');
    });
  });

  describe('除外パターン（慣用句・比喩）', () => {
    it.each([
      '死ぬほど美味しい',
      '死ぬほど疲れた',
      '死ぬほど眠い',
      '死ぬほど笑った',
      '死に物狂いで頑張った',
    ])('"%s" は除外される', (input) => {
      const result = detectSafetyRisk(input);
      expect(result).toBeNull();
    });
  });

  describe('通常会話（検出されない）', () => {
    it.each([
      'こんにちは',
      '今日のご飯は何？',
      'ケーキが食べたい',
      '映画を見ようかな',
      '昨日友達と遊んだ',
      '仕事が大変だったよ',
      '春の散歩は気持ちいいね',
      '猫かわいいな',
    ])('"%s" は検出されない', (input) => {
      expect(detectSafetyRisk(input)).toBeNull();
    });
  });

  describe('空白・空文字列', () => {
    it('空文字列は検出されない', () => {
      expect(detectSafetyRisk('')).toBeNull();
    });
    it('空白のみは検出されない', () => {
      expect(detectSafetyRisk('   ')).toBeNull();
    });
  });

  describe('検出結果の内容', () => {
    it('matchedText と patternDescription が含まれる', () => {
      const result = detectSafetyRisk('死にたいと思っている');
      expect(result).not.toBeNull();
      expect(typeof result?.matchedText).toBe('string');
      expect(result?.matchedText.length).toBeGreaterThan(0);
      expect(typeof result?.patternDescription).toBe('string');
      expect(result?.patternDescription.length).toBeGreaterThan(0);
    });

    it('crisis_method は suicidal_ideation より高優先', () => {
      // 「自殺」と「首を吊る」を両方含む入力 → crisis_method を優先
      const result = detectSafetyRisk('自殺したい、首を吊りたい');
      expect(result?.category).toBe('crisis_method');
    });
  });
});
