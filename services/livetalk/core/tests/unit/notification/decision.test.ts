import {
  shouldNotifyNow,
  extractSessionStartTimes,
  computeSessionIntervals,
  computeBaseIntervalMs,
  resolveToneBucket,
  countTodayNotifications,
  median,
  type NotifyDecisionInput,
} from '../../../src/notification/decision.js';
import type { LifecycleEntity } from '../../../src/entities/lifecycle.entity.js';
import type { NotificationEventEntity } from '../../../src/entities/notification-event.entity.js';
import type { MessageEntity } from '../../../src/entities/message.entity.js';

// UTC 12:00 固定 (getHours()=12, nowMinutes=720)
const NOW_UTC_MS = Date.UTC(2026, 0, 1, 12, 0, 0);
const NOW_DATE = new Date(NOW_UTC_MS);

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

// UTC 12:00 で awake になるライフサイクル（睡眠帯: 23:00–09:00、夜明けに起きる）
// bed=1380, wake=540, bed>=wake: sleeping = m>=1380 || m<540 → 720>=1380=false || 720<540=false → awake
const AWAKE_LIFECYCLE: LifecycleEntity = {
  UserID: 'u1',
  CharacterID: 'hiyori',
  Bedtime: '23:00',
  WakeUpTime: '09:00',
  CreatedAt: 0,
  UpdatedAt: 0,
};

// UTC 12:00 で sleeping になるライフサイクル（睡眠帯: 11:00–13:00）
// bed=660, wake=780, bed<wake: sleeping = m>=660 && m<780 → 720>=660=true && 720<780=true → sleeping
const SLEEPING_LIFECYCLE: LifecycleEntity = {
  UserID: 'u1',
  CharacterID: 'hiyori',
  Bedtime: '11:00',
  WakeUpTime: '13:00',
  CreatedAt: 0,
  UpdatedAt: 0,
};

function makeMsg(createdAt: number): Pick<MessageEntity, 'CreatedAt'> {
  return { CreatedAt: createdAt };
}

function makeNotifEvent(
  kind: 'normal' | 'critical',
  createdAt: number,
  overrides: Partial<NotificationEventEntity> = {}
): NotificationEventEntity {
  return {
    UserID: 'u1',
    NotifID: `notif-${createdAt}`,
    Kind: kind,
    Title: 'test',
    Body: 'test',
    CreatedAt: createdAt,
    Ttl: Math.floor(createdAt / 1000) + 86400,
    ...overrides,
  };
}

function todayStartMs(): number {
  const d = new Date(NOW_DATE);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

describe('median', () => {
  it('空配列は null を返す', () => {
    expect(median([])).toBeNull();
  });

  it('奇数個の中央値を返す', () => {
    expect(median([3, 1, 2])).toBe(2);
  });

  it('偶数個は中央 2 値の平均を返す', () => {
    expect(median([1, 3])).toBe(2);
    expect(median([2, 4, 6, 8])).toBe(5);
  });

  it('ソート済みでなくても正しい値を返す', () => {
    expect(median([5, 1, 3])).toBe(3);
  });
});

describe('extractSessionStartTimes', () => {
  const GAP = HOUR;

  it('メッセージなしは空配列', () => {
    expect(extractSessionStartTimes([], GAP)).toEqual([]);
  });

  it('1 件のみは 1 セッション', () => {
    expect(extractSessionStartTimes([makeMsg(1000)], GAP)).toEqual([1000]);
  });

  it('gap 未満の間隔は同一セッション', () => {
    const msgs = [makeMsg(0), makeMsg(HOUR - 1)];
    expect(extractSessionStartTimes(msgs, GAP)).toEqual([0]);
  });

  it('gap 以上の間隔は新セッション', () => {
    const msgs = [makeMsg(0), makeMsg(HOUR)];
    expect(extractSessionStartTimes(msgs, GAP)).toEqual([0, HOUR]);
  });

  it('複数セッションを正しく分割する', () => {
    const msgs = [makeMsg(0), makeMsg(HOUR + 1), makeMsg(2 * HOUR + 2)];
    expect(extractSessionStartTimes(msgs, GAP)).toEqual([0, HOUR + 1, 2 * HOUR + 2]);
  });

  it('順序が乱れていてもソートして判定する', () => {
    // gap=3600000: (HOUR+1)-0 = 3600001 >= gap → 新セッション
    //              (2*HOUR+2)-(HOUR+1) = 3600001 >= gap → 新セッション
    const msgs = [makeMsg(2 * HOUR + 2), makeMsg(0), makeMsg(HOUR + 1)];
    expect(extractSessionStartTimes(msgs, GAP)).toEqual([0, HOUR + 1, 2 * HOUR + 2]);
  });
});

describe('computeSessionIntervals', () => {
  it('セッション 0 件は空配列', () => {
    expect(computeSessionIntervals([], 10)).toEqual([]);
  });

  it('セッション 1 件は空配列', () => {
    expect(computeSessionIntervals([1000], 10)).toEqual([]);
  });

  it('隣接差分を返す', () => {
    expect(computeSessionIntervals([0, DAY, 3 * DAY], 10)).toEqual([DAY, 2 * DAY]);
  });

  it('maxSamples で直近 N セッションのみを使う', () => {
    // 4 セッション、maxSamples=3 → 直近 3 [DAY, 2*DAY, 3*DAY] → intervals=[DAY, DAY]
    const result = computeSessionIntervals([0, DAY, 2 * DAY, 3 * DAY], 3);
    expect(result).toEqual([DAY, DAY]);
  });
});

describe('computeBaseIntervalMs', () => {
  it('サンプルなしは DEFAULT_BASE_HOURS (24h)', () => {
    expect(computeBaseIntervalMs([])).toBe(24 * HOUR);
  });

  it('1h 以下は BASE_MIN_HOURS (12h) にクランプ', () => {
    expect(computeBaseIntervalMs([HOUR])).toBe(12 * HOUR);
  });

  it('30 日以上は MAX_INTERVAL_DAYS (14 日) にクランプ', () => {
    expect(computeBaseIntervalMs([30 * DAY])).toBe(14 * DAY);
  });

  it('範囲内の中央値をそのまま使う', () => {
    expect(computeBaseIntervalMs([24 * HOUR, 24 * HOUR, 24 * HOUR])).toBe(24 * HOUR);
  });
});

describe('resolveToneBucket', () => {
  it('7 日未満は normal', () => {
    expect(resolveToneBucket(6 * DAY)).toBe('normal');
    expect(resolveToneBucket(DAY)).toBe('normal');
  });

  it('7 日以上 14 日未満は long', () => {
    expect(resolveToneBucket(7 * DAY)).toBe('long');
    expect(resolveToneBucket(13 * DAY)).toBe('long');
  });

  it('14 日以上は veryLong', () => {
    expect(resolveToneBucket(14 * DAY)).toBe('veryLong');
    expect(resolveToneBucket(30 * DAY)).toBe('veryLong');
  });
});

describe('countTodayNotifications', () => {
  it('今日の normal 件数のみカウントする', () => {
    const today = todayStartMs();
    const events = [
      makeNotifEvent('normal', today + 1000),
      makeNotifEvent('normal', today + 2000),
      makeNotifEvent('critical', today + 3000),
      makeNotifEvent('normal', today - 1000), // 昨日
    ];
    expect(countTodayNotifications(events, 'normal', NOW_DATE)).toBe(2);
  });

  it('今日の critical 件数のみカウントする', () => {
    const today = todayStartMs();
    const events = [
      makeNotifEvent('critical', today + 1000),
      makeNotifEvent('normal', today + 2000),
    ];
    expect(countTodayNotifications(events, 'critical', NOW_DATE)).toBe(1);
  });

  it('イベントなしは 0', () => {
    expect(countTodayNotifications([], 'normal', NOW_DATE)).toBe(0);
  });
});

describe('shouldNotifyNow', () => {
  function baseInput(): NotifyDecisionInput {
    return {
      userMessages: [],
      lifecycle: AWAKE_LIFECYCLE,
      notificationEvents: [],
      now: NOW_DATE,
    };
  }

  describe('クリティカル通知', () => {
    it('criticalKnowledgeId あり・本日 critical 0 件 → critical 発火', () => {
      const result = shouldNotifyNow({
        ...baseInput(),
        criticalKnowledgeId: 'k1',
      });
      expect(result).toEqual({ notify: true, kind: 'critical', knowledgeId: 'k1' });
    });

    it('criticalKnowledgeId あり・本日 critical 1 件（cap 到達）→ 通常判定へフォールスルー', () => {
      const result = shouldNotifyNow({
        ...baseInput(),
        criticalKnowledgeId: 'k1',
        notificationEvents: [makeNotifEvent('critical', todayStartMs() + 1000)],
        userMessages: [makeMsg(NOW_UTC_MS - 2 * DAY)],
      });
      // critical cap 超えたため通常判定。elapsed 十分で notify=true normal
      expect(result.notify).toBe(true);
      if (result.notify) expect(result.kind).toBe('normal');
    });
  });

  describe('inactive_stopped', () => {
    it('missedCount 7 以上 → effectiveInterval > 14 日 → inactive_stopped', () => {
      // 24h * 1.5^7 ≈ 17.09 日 > 14 日 → stopped
      // lastInteractionAt=0 なので CreatedAt > 0 の normal イベントはすべて missedCount に加算
      const events = Array.from({ length: 7 }, (_, i) =>
        makeNotifEvent('normal', (i + 1) * DAY)
      );
      const result = shouldNotifyNow({
        ...baseInput(),
        notificationEvents: events,
      });
      expect(result).toEqual({ notify: false, reason: 'inactive_stopped' });
    });
  });

  describe('daily_cap', () => {
    it('本日 normal 1 件以上 → daily_cap', () => {
      const result = shouldNotifyNow({
        ...baseInput(),
        notificationEvents: [makeNotifEvent('normal', todayStartMs() + 1000)],
        userMessages: [makeMsg(NOW_UTC_MS - 2 * DAY)],
      });
      expect(result).toEqual({ notify: false, reason: 'daily_cap' });
    });
  });

  describe('sleeping', () => {
    it('睡眠帯 → sleeping', () => {
      const result = shouldNotifyNow({
        ...baseInput(),
        lifecycle: SLEEPING_LIFECYCLE,
        userMessages: [makeMsg(NOW_UTC_MS - 2 * DAY)],
      });
      expect(result).toEqual({ notify: false, reason: 'sleeping' });
    });
  });

  describe('outside_window', () => {
    it('UserActivityProfile あり・時間帯外 → outside_window', () => {
      // UTC 12:00: nowMinutes=720
      // morningPeak='05:00'(300): diff=420 > 90 → outside
      // eveningPeak='20:00'(1200): diff=480 > 90 → outside
      const lifecycleWithProfile: LifecycleEntity = {
        ...AWAKE_LIFECYCLE,
        UserActivityProfile: {
          morningPeak: '05:00',
          eveningPeak: '20:00',
          sampleSize: 100,
          lastLearnedAt: '2026-01-01T00:00:00Z',
        },
      };
      const result = shouldNotifyNow({
        ...baseInput(),
        lifecycle: lifecycleWithProfile,
        userMessages: [makeMsg(NOW_UTC_MS - 2 * DAY)],
      });
      expect(result).toEqual({ notify: false, reason: 'outside_window' });
    });

    it('UserActivityProfile あり・eveningPeak が now と一致 → 通過', () => {
      // eveningPeak='12:00'(720): |720-720|=0 ≤ 90 → inWindow
      const lifecycleWithProfile: LifecycleEntity = {
        ...AWAKE_LIFECYCLE,
        UserActivityProfile: {
          morningPeak: '05:00',
          eveningPeak: '12:00',
          sampleSize: 100,
          lastLearnedAt: '2026-01-01T00:00:00Z',
        },
      };
      const result = shouldNotifyNow({
        ...baseInput(),
        lifecycle: lifecycleWithProfile,
        userMessages: [makeMsg(NOW_UTC_MS - 2 * DAY)],
      });
      expect(result.notify).toBe(true);
    });

    it('UserActivityProfile なし → 時間帯ゲートをスキップ', () => {
      // AWAKE_LIFECYCLE は UserActivityProfile なし
      const result = shouldNotifyNow({
        ...baseInput(),
        userMessages: [makeMsg(NOW_UTC_MS - 2 * DAY)],
      });
      expect(result.notify).toBe(true);
    });
  });

  describe('not_due', () => {
    it('経過時間が effectiveInterval 未満 → not_due', () => {
      // lastInteractionAt = NOW - 1h, effectiveInterval = 24h → not_due
      const result = shouldNotifyNow({
        ...baseInput(),
        userMessages: [makeMsg(NOW_UTC_MS - HOUR)],
      });
      expect(result).toEqual({ notify: false, reason: 'not_due' });
    });
  });

  describe('通常発火', () => {
    it('全条件通過 → notify=true kind=normal toneBucket=normal', () => {
      // elapsed=2日 ≥ 24h、toneBucket=normal (2日 < 7日)
      const result = shouldNotifyNow({
        ...baseInput(),
        userMessages: [makeMsg(NOW_UTC_MS - 2 * DAY)],
      });
      expect(result.notify).toBe(true);
      if (result.notify && result.kind === 'normal') {
        expect(result.toneBucket).toBe('normal');
        expect(result.elapsedMs).toBe(2 * DAY);
      }
    });

    it('elapsed 7 日以上 14 日未満 → toneBucket=long', () => {
      const result = shouldNotifyNow({
        ...baseInput(),
        userMessages: [makeMsg(NOW_UTC_MS - 8 * DAY)],
      });
      if (result.notify && result.kind === 'normal') {
        expect(result.toneBucket).toBe('long');
      }
    });

    it('メッセージなし（初回起動）→ referenceTime=0 → notify=true veryLong', () => {
      // elapsed = NOW_UTC_MS (巨大) >> 14 日 → veryLong
      const result = shouldNotifyNow({ ...baseInput() });
      expect(result.notify).toBe(true);
      if (result.notify && result.kind === 'normal') {
        expect(result.toneBucket).toBe('veryLong');
      }
    });

    it('最終通知後に会話があった場合は missedCount=0 でバックオフなし', () => {
      // 直近の normal 通知より後にメッセージがある → missedCount=0
      const notifAt = NOW_UTC_MS - 2 * DAY;
      const msgAt = NOW_UTC_MS - DAY; // 通知後に会話
      const result = shouldNotifyNow({
        ...baseInput(),
        userMessages: [makeMsg(msgAt)],
        notificationEvents: [makeNotifEvent('normal', notifAt)],
      });
      expect(result.notify).toBe(true);
    });
  });
});
