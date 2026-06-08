import { SKILLS, TIMELINE_EVENTS, TARGET_READERS, POLICY_ITEMS, ERROR_MESSAGES } from '@/lib/about';

describe('about', () => {
  describe('ERROR_MESSAGES', () => {
    it('エラーメッセージ定数が定義されている', () => {
      expect(ERROR_MESSAGES.ABOUT_DATA_NOT_FOUND).toBe('Aboutページのデータが見つかりません');
    });
  });

  describe('SKILLS', () => {
    it('スキル一覧が空でない', () => {
      expect(SKILLS.length).toBeGreaterThan(0);
    });

    it('各スキルに label と category が含まれる', () => {
      SKILLS.forEach((skill) => {
        expect(typeof skill.label).toBe('string');
        expect(skill.label.length).toBeGreaterThan(0);
        expect(['フロントエンド', 'バックエンド', 'インフラ', 'ツール・その他']).toContain(
          skill.category
        );
      });
    });

    it('Next.js が含まれる', () => {
      const labels = SKILLS.map((s) => s.label);
      expect(labels).toContain('Next.js');
    });

    it('TypeScript が含まれる', () => {
      const labels = SKILLS.map((s) => s.label);
      expect(labels).toContain('TypeScript');
    });

    it('AWS CDK が含まれる', () => {
      const labels = SKILLS.map((s) => s.label);
      expect(labels).toContain('AWS CDK');
    });

    it('フロントエンドカテゴリのスキルが存在する', () => {
      const frontendSkills = SKILLS.filter((s) => s.category === 'フロントエンド');
      expect(frontendSkills.length).toBeGreaterThan(0);
    });

    it('インフラカテゴリのスキルが存在する', () => {
      const infraSkills = SKILLS.filter((s) => s.category === 'インフラ');
      expect(infraSkills.length).toBeGreaterThan(0);
    });
  });

  describe('TIMELINE_EVENTS', () => {
    it('タイムラインイベントが空でない', () => {
      expect(TIMELINE_EVENTS.length).toBeGreaterThan(0);
    });

    it('各イベントに period と title が含まれる', () => {
      TIMELINE_EVENTS.forEach((event) => {
        expect(typeof event.period).toBe('string');
        expect(event.period.length).toBeGreaterThan(0);
        expect(typeof event.title).toBe('string');
        expect(event.title.length).toBeGreaterThan(0);
      });
    });

    it('description は存在する場合は文字列である', () => {
      TIMELINE_EVENTS.forEach((event) => {
        if (event.description !== undefined) {
          expect(typeof event.description).toBe('string');
          expect(event.description.length).toBeGreaterThan(0);
        }
      });
    });

    it('最初のイベントが 2026 年初頭を起点とする', () => {
      expect(TIMELINE_EVENTS[0].period).toContain('2026年');
    });

    it('初コミット（nagiyu-platform 開発開始）が含まれる', () => {
      const hasStart = TIMELINE_EVENTS.some((e) => e.title.includes('nagiyu-platform'));
      expect(hasStart).toBe(true);
    });
  });

  describe('TARGET_READERS', () => {
    it('対象読者リストが空でない', () => {
      expect(TARGET_READERS.length).toBeGreaterThan(0);
    });

    it('各対象読者が文字列である', () => {
      TARGET_READERS.forEach((reader) => {
        expect(typeof reader).toBe('string');
        expect(reader.length).toBeGreaterThan(0);
      });
    });

    it('エンジニア向けの説明が含まれる', () => {
      const hasEngineer = TARGET_READERS.some((r) => r.includes('エンジニア'));
      expect(hasEngineer).toBe(true);
    });
  });

  describe('POLICY_ITEMS', () => {
    it('方針項目が空でない', () => {
      expect(POLICY_ITEMS.length).toBeGreaterThan(0);
    });

    it('各方針項目に title と description が含まれる', () => {
      POLICY_ITEMS.forEach((item) => {
        expect(typeof item.title).toBe('string');
        expect(item.title.length).toBeGreaterThan(0);
        expect(typeof item.description).toBe('string');
        expect(item.description.length).toBeGreaterThan(0);
      });
    });

    it('一次情報に関する方針が含まれる', () => {
      const hasFirsthand = POLICY_ITEMS.some((p) => p.title.includes('一次情報'));
      expect(hasFirsthand).toBe(true);
    });

    it('継続的な更新に関する方針が含まれる', () => {
      const hasContinuousUpdate = POLICY_ITEMS.some((p) => p.title.includes('継続的'));
      expect(hasContinuousUpdate).toBe(true);
    });

    it('広告と編集の分離に関する方針が含まれる', () => {
      const hasAdSeparation = POLICY_ITEMS.some((p) => p.title.includes('広告'));
      expect(hasAdSeparation).toBe(true);
    });
  });
});
