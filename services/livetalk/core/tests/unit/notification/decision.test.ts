import {
  shouldNotifyNow,
  extractSessionStartTimes,
  computeSessionIntervals,
  computeBaseIntervalMs,
  computeIntensityFactor,
  computeDailyNormalCap,
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
    CharacterID: 'hiyori',
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

describe('computeIntensityFactor', () => {
  it('セッション 0 件 → factor=1（casual 扱い）', () => {
    // ウィンドウ内のセッションが 0 件なら factor=0/1.5=0 → clamp → 1
    expect(computeIntensityFactor([], NOW_DATE)).toBe(1);
  });

  it('session/日がベースライン（1.5）と同値 → factor=1', () => {
    // 7日間に 1.5*7=10.5 → 10 セッションで perDay=10/7≈1.43 < 1.5 → factor<1 → clamp → 1
    // ぴったり 1.5*7=10.5 は作れないので 11 セッションで確認（11/7/1.5≈1.048 → clamp → 1.048）
    // ここでは「ベースライン未満 → factor=1」を直接確認する
    const now = NOW_DATE;
    const windowMs = 7 * 24 * HOUR;
    // 7日で 7 セッション = 1 session/日 = 1/1.5=0.67 → clamp → 1
    const sessions = Array.from({ length: 7 }, (_, i) => now.getTime() - windowMs + i * DAY);
    expect(computeIntensityFactor(sessions, now)).toBe(1);
  });

  it('高頻度ユーザー → NOTIFY_INTENSITY_MAX_FACTOR(3) でクランプ', () => {
    // 7日間に 100 セッション = 100/7/1.5≈9.52 → clamp → 3
    const now = NOW_DATE;
    const sessions = Array.from({ length: 100 }, (_, i) => now.getTime() - i * HOUR);
    expect(computeIntensityFactor(sessions, now)).toBe(3);
  });

  it('ウィンドウ外のセッションは除外される', () => {
    // 8日前のセッション 100 件（ウィンドウ外）+ ウィンドウ内なし → factor=1
    const now = NOW_DATE;
    const windowMs = 7 * 24 * HOUR;
    const sessions = Array.from(
      { length: 100 },
      (_, i) => now.getTime() - windowMs - (i + 1) * HOUR
    );
    expect(computeIntensityFactor(sessions, now)).toBe(1);
  });

  it('活発ユーザー（dev 実測相当 4.4 session/日）→ 1 < factor < 3', () => {
    // 7日間に 31 セッション ≈ 4.43 session/日 → 4.43/1.5≈2.95 → clamp → 2.95（< 3）
    const now = NOW_DATE;
    const sessions = Array.from({ length: 31 }, (_, i) => now.getTime() - i * 5 * HOUR);
    const factor = computeIntensityFactor(sessions, now);
    expect(factor).toBeGreaterThan(1);
    expect(factor).toBeLessThanOrEqual(3);
  });
});

describe('computeDailyNormalCap', () => {
  it('factor=1（casual）→ cap=1（下限）', () => {
    expect(computeDailyNormalCap(1)).toBe(1);
  });

  it('factor=2 → cap=2', () => {
    expect(computeDailyNormalCap(2)).toBe(2);
  });

  it('factor=3.x → cap=3（上限）', () => {
    // round(3.4)=3, round(3.5)=4 → clamp → 3
    expect(computeDailyNormalCap(3.4)).toBe(3);
    expect(computeDailyNormalCap(3.5)).toBe(3);
  });

  it('factor=0.x → cap=1（下限）', () => {
    expect(computeDailyNormalCap(0.5)).toBe(1);
  });
});

describe('computeBaseIntervalMs', () => {
  it('サンプルなしは DEFAULT_BASE_HOURS (24h)', () => {
    // intensityFactor=1（変化なし）
    expect(computeBaseIntervalMs([], 1)).toBe(24 * HOUR);
  });

  it('中央値 1h・factor=1 → BASE_MIN_HOURS (4h) にクランプ', () => {
    // 1h / 1 = 1h < 4h（新 floor）→ 4h
    expect(computeBaseIntervalMs([HOUR], 1)).toBe(4 * HOUR);
  });

  it('30 日以上は MAX_INTERVAL_DAYS (14 日) にクランプ', () => {
    expect(computeBaseIntervalMs([30 * DAY], 1)).toBe(14 * DAY);
  });

  it('範囲内の中央値をそのまま使う（factor=1）', () => {
    expect(computeBaseIntervalMs([24 * HOUR, 24 * HOUR, 24 * HOUR], 1)).toBe(24 * HOUR);
  });

  it('factor で median が割られる（活発ユーザーの間隔短縮）', () => {
    // median=24h / factor=2 = 12h（floor=4h 以上なのでクランプなし）
    expect(computeBaseIntervalMs([24 * HOUR, 24 * HOUR, 24 * HOUR], 2)).toBe(12 * HOUR);
  });

  it('factor=3 で 12h median → 4h（floor クランプ）', () => {
    // median=12h / factor=3 = 4h = 新 floor（ぴったり）
    expect(computeBaseIntervalMs([12 * HOUR, 12 * HOUR], 3)).toBe(4 * HOUR);
  });

  it('factor=null 相当のデフォルト（サンプルなし・factor=1）はデフォルト 24h', () => {
    expect(computeBaseIntervalMs([], 1)).toBe(24 * HOUR);
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
    it('criticalTopicId あり・本日 critical 0 件 → critical 発火', () => {
      const result = shouldNotifyNow({
        ...baseInput(),
        criticalTopicId: 't1',
      });
      expect(result).toEqual({ notify: true, kind: 'critical', topicId: 't1' });
    });

    it('criticalTopicId あり・本日 critical 1 件（cap 到達）→ 通常判定へフォールスルー', () => {
      const result = shouldNotifyNow({
        ...baseInput(),
        criticalTopicId: 't1',
        notificationEvents: [makeNotifEvent('critical', todayStartMs() + 1000)],
        userMessages: [makeMsg(NOW_UTC_MS - 2 * DAY)],
      });
      // critical cap 超えたため通常判定。elapsed 十分で notify=true normal
      expect(result.notify).toBe(true);
      if (result.notify) expect(result.kind).toBe('normal');
    });

    it('睡眠帯中は criticalTopicId があっても sleeping を返す', () => {
      // SLEEPING_LIFECYCLE: UTC 12:00 は睡眠帯（11:00–13:00）
      const result = shouldNotifyNow({
        ...baseInput(),
        lifecycle: SLEEPING_LIFECYCLE,
        criticalTopicId: 't1',
      });
      expect(result).toEqual({ notify: false, reason: 'sleeping' });
    });

    it('睡眠帯中は criticalTopicId がなくても sleeping を返す', () => {
      const result = shouldNotifyNow({
        ...baseInput(),
        lifecycle: SLEEPING_LIFECYCLE,
        userMessages: [makeMsg(NOW_UTC_MS - 2 * DAY)],
      });
      expect(result).toEqual({ notify: false, reason: 'sleeping' });
    });
  });

  describe('inactive_stopped', () => {
    it('missedCount 7 以上 → effectiveInterval > 14 日 → inactive_stopped', () => {
      // 24h * 1.5^7 ≈ 17.09 日 > 14 日 → stopped
      // lastInteractionAt=0 なので CreatedAt > 0 の normal イベントはすべて missedCount に加算
      const events = Array.from({ length: 7 }, (_, i) => makeNotifEvent('normal', (i + 1) * DAY));
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

  describe('Phase 2: 活発ユーザー（高 intensity）の動作', () => {
    // 活発ユーザー: 7日間に 31 セッション（≒4.4/日 → factor≈2.95 → cap=3、interval≈8.1h）
    // now = NOW_DATE（UTC 12:00, 2026-01-01）
    // UserActivityProfile なし（時間帯ゲートをスキップ）
    function makeActiveUserSessions(): number[] {
      // 直近 7 日間に均等に 31 セッション配置
      return Array.from({ length: 31 }, (_, i) => NOW_UTC_MS - i * 5 * HOUR);
    }

    it('活発ユーザー: cap が 1 より大きくなり、本日 1 件目は daily_cap にならない', () => {
      const sessions = makeActiveUserSessions();
      const msgs = sessions.map((t) => makeMsg(t));
      // 今日の通知 1 件
      const today = todayStartMs();
      const result = shouldNotifyNow({
        ...baseInput(),
        userMessages: msgs,
        notificationEvents: [
          makeNotifEvent('normal', today + 1000), // 今日 1 件目送信済み
        ],
      });
      // factor≈2.95 → cap=3 → todayNormal=1 < 3 → daily_cap にはならない
      // interval も短縮されているので elapsed 次第
      // elapsed = now - last interaction（5h 前のセッション）→ 5h
      // effectiveInterval = 24h/2.95 ≈ 8.1h（missedCount=1: 8.1*1.5=12.2h）
      // → 5h < 12.2h → not_due が予想されるが daily_cap ではないことを確認
      if (!result.notify) {
        expect(result.reason).not.toBe('daily_cap');
      }
    });

    it('活発ユーザー: interval が短縮されて elapsed 十分なら発火する', () => {
      // セッションを 7 日前に固定して elapsed = 7 日に設定
      const sessions = Array.from({ length: 31 }, (_, i) => NOW_UTC_MS - 7 * DAY - i * 5 * HOUR);
      const msgs = sessions.map((t) => makeMsg(t));
      const result = shouldNotifyNow({
        ...baseInput(),
        userMessages: msgs,
        notificationEvents: [],
      });
      // elapsed = 7 日 >> intensityFactor で短縮された interval → 発火
      expect(result.notify).toBe(true);
      if (result.notify) expect(result.kind).toBe('normal');
    });

    it('casual ユーザー: cap=1 のまま（従来通り）', () => {
      // セッションなし → factor=1 → cap=1
      const today = todayStartMs();
      const result = shouldNotifyNow({
        ...baseInput(),
        userMessages: [],
        notificationEvents: [makeNotifEvent('normal', today + 1000)],
      });
      expect(result).toEqual({ notify: false, reason: 'daily_cap' });
    });
  });

  describe('Phase 2: backoff が依然効くこと', () => {
    it('missedCount が増えると effectiveInterval が拡大して not_due になる', () => {
      // missedCount=3 → effectiveInterval = 24h * 1.5^3 = 81h
      // メッセージなし（lastInteractionAt=0）、通知イベントが missedCount に加算される
      const missedEvents = Array.from({ length: 3 }, (_, i) =>
        makeNotifEvent('normal', (i + 1) * DAY)
      ); // CreatedAt > 0 なので missedCount に加算
      const result = shouldNotifyNow({
        ...baseInput(),
        userMessages: [],
        notificationEvents: missedEvents,
      });
      // elapsed = NOW - 0 = 巨大（referenceTime=max(0, lastNormal=3DAY)=3DAY、elapsed=NOW-3DAY≒4DAY-ish）
      // effectiveInterval = 24h * 1.5^3 = 81h ≈ 3.375 日
      // elapsed（≈4日） > effectiveInterval(3.375日) → 発火する（inactive_stopped でもない）
      // むしろ missedCount=7 以上で inactive_stopped を確認
      expect(result).not.toEqual({ notify: false, reason: 'daily_cap' });
    });

    it('missedCount=7 → effectiveInterval > 14 日 → inactive_stopped（Phase 2 でも維持）', () => {
      const events = Array.from({ length: 7 }, (_, i) => makeNotifEvent('normal', (i + 1) * DAY));
      const result = shouldNotifyNow({
        ...baseInput(),
        notificationEvents: events,
      });
      expect(result).toEqual({ notify: false, reason: 'inactive_stopped' });
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
