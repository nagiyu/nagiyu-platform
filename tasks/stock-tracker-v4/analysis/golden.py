"""Stock Tracker v4 Phase 3-1 ゴールデンテスト用フィクスチャ生成スクリプト。

固定シードの合成データ（JP4銘柄・US4銘柄 × 80営業日程度）を作り、参照実装（prep.py・wf.py・
decision.py の rolling_base・decision2.py の determine_band と順次寄与）で期待値を計算し、
JSON として core/tests/unit/forecast/fixtures/ に出力する。

参照実装のロジックは書き換えず、そのまま呼ぶ／コピーする（rolling_base・determine_band・
順次寄与は decision.py / decision2.py が実データを読み込む都合上コピーする）。

使い方: python3 golden.py
"""
import json
import os
import sys

import numpy as np
import pandas as pd
from scipy.stats import binomtest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import prep  # noqa: E402  (参照実装。main() をパスを差し替えて呼ぶ)
from wf import LR, logit, sigmoid  # noqa: E402  (参照実装。学習・ロジット変換に使う)

WORK_DIR = os.path.join(HERE, 'golden_work')
os.makedirs(WORK_DIR, exist_ok=True)
DATA_PATH = os.path.join(WORK_DIR, 'ds.parquet')
OUT_DIR = os.path.join(WORK_DIR, 'out')
os.makedirs(OUT_DIR, exist_ok=True)

FIXTURES_DIR = os.path.join(HERE, '..', '..', '..', 'services', 'stock-tracker', 'core', 'tests', 'unit', 'forecast', 'fixtures')
os.makedirs(FIXTURES_DIR, exist_ok=True)

RNG = np.random.default_rng(20260927)

PATTERNS = prep.BUY + prep.SELL  # 27 パターン ID（TS の PATTERN_REGISTRY.patternId と同じ文字列）
assert len(PATTERNS) == 27

N = 20
ALPHA = {'Q-DIR': 80, 'Q-VOL': 20, 'Q-MKT': 20}
MIN_TRAINING_DATES = 30  # design.md §1.6・constants.ts の MIN_TRAINING_DATES と同じ


def size(n):
    return [f'f_lpark{n}', f'f_lrng{n}', f'f_lvol{n}']


def msize(n):
    return [f'f_mlpark{n}', f'f_mlrng{n}', f'f_mlvol{n}']


PAT_COLS = None  # panel 読み込み後に決める
FEATS = None
YCOL = {'Q-DIR': 'y_dir', 'Q-VOL': f'y_vol{N}', 'Q-MKT': f'y_mkt{N}'}

# TS 側の軸 ID との対応（パターン軸は 'x:' を外すだけ。複合軸は名前が異なるので個別マップ）
AXIS_ID_MAP = {
    'x:buy_ge2': 'buy-count-ge2',
    'x:sell_ge2': 'sell-count-ge2',
    f'f_lpark{N}': 'parkinson-5d',
    f'f_lrng{N}': 'range-today',
    f'f_lvol{N}': 'volume-ratio',
    f'f_mlpark{N}': 'market-parkinson-5d',
    f'f_mlrng{N}': 'market-range-today',
    f'f_mlvol{N}': 'market-volume-ratio',
    f'f_mlR{N}': 'market-range-avg',
}


def to_axis_id(col: str) -> str:
    if col in AXIS_ID_MAP:
        return AXIS_ID_MAP[col]
    if col.startswith('x:'):
        return col[2:]
    return AXIS_ID_MAP[col]


# ------------------------------------------------------------------ 1. 合成データ生成
# 銘柄数・日数は、TS 側が D までの全期間を日次でリプレイして学習し直す構造になったこと
# （design.md §3.1）に合わせ、ゴールデンテストの実行時間を抑えるため必要最小限にしている
# （バーンイン 30 営業日 + 評価対象・中立帯の見直し(30日)を試せる程度）。
N_DAYS = 55
DATES = pd.bdate_range('2024-01-02', periods=N_DAYS).strftime('%Y-%m-%d').tolist()

TICKERS = [
    ('JT1', 'TSE'),
    ('JT2', 'TSE'),
    ('JT3', 'TSE'),
    ('UT1', 'NASDAQ'),
    ('UT2', 'NYSE'),
    ('UT3', 'AMEX'),
]

DROP_TICKER, DROP_DATE_INDEX = 'UT3', 32  # 1銘柄だけ1日欠落 -> 翌営業日不一致を作る
EXTREME_TICKER, EXTREME_DATE_INDEX = 'JT2', 40  # |リターン| > 20% を1件作る

created_base = int(pd.Timestamp('2024-01-02T00:00:00Z').timestamp() * 1000)

rows = []
for ticker, ex in TICKERS:
    price = 1000.0 if ex == 'TSE' else 100.0
    for i, d in enumerate(DATES):
        if ticker == DROP_TICKER and i == DROP_DATE_INDEX:
            continue
        ret = RNG.normal(0, 0.015)
        if ticker == EXTREME_TICKER and i == EXTREME_DATE_INDEX:
            ret = 0.35
        new_price = price * (1 + ret)
        open_ = price * (1 + RNG.normal(0, 0.002))
        close = new_price
        high = max(open_, close) * (1 + abs(RNG.normal(0, 0.006)))
        low = min(open_, close) * (1 - abs(RNG.normal(0, 0.006)))
        volume = float(RNG.lognormal(10, 0.3))
        if RNG.random() < 0.03:
            volume = np.nan  # 出来高欠損を少し
        row = {
            'ticker': ticker,
            'ex': ex,
            'date': d,
            'open': float(open_),
            'high': float(high),
            'low': float(low),
            'close': float(close),
            'volume': volume,
            'created': created_base + i * 86400000,
        }
        for pid in PATTERNS:
            u = RNG.random()
            row['p:' + pid] = 'MATCHED' if u < 0.15 else ('INSUFFICIENT_DATA' if u < 0.20 else 'NOT_MATCHED')
        rows.append(row)
        price = new_price

raw_df = pd.DataFrame(rows)
raw_df.to_parquet(DATA_PATH)

# ------------------------------------------------------------------ 2. 前処理（参照実装をそのまま呼ぶ）
prep.DATA = DATA_PATH
prep.OUT = OUT_DIR
prep.main()

panel = pd.read_parquet(os.path.join(OUT_DIR, 'panel.parquet'))
mk = pd.read_parquet(os.path.join(OUT_DIR, 'mkt.parquet'))

PAT_COLS = [c for c in panel.columns if c.startswith('x:') and 'cnt' not in c]
assert len(PAT_COLS) == 29  # 27 パターン + buy_ge2 + sell_ge2
FEATS = {'Q-DIR': PAT_COLS, 'Q-VOL': size(N) + msize(N), 'Q-MKT': msize(N) + [f'f_mlR{N}']}

CAL = {m: np.array(sorted(panel[panel.mkt == m].date.unique())) for m in ['JP', 'US']}


# ------------------------------------------------------------------ 3. 基準値（decision.py の rolling_base をそのまま写す）
def rolling_base(df, ycol, scope, window=60, minn=20):
    out = pd.Series(np.nan, index=df.index)
    lab = df.label_time.to_numpy()
    y = df[ycol].to_numpy(float)
    d = df.date.to_numpy()
    m = df.mkt.to_numpy()
    valid = ~np.isnan(y)
    for mm in ['JP', 'US']:
        rows_m = df[df.mkt == mm]
        pt = dict(zip(rows_m.date, rows_m.pred_time))
        for i, t in enumerate(CAL[mm]):
            if t not in pt:
                continue
            known = valid & (lab <= pt[t])
            if scope == 'mkt':
                known &= m == mm
            recent = known & (d >= CAL[mm][max(0, i - window)])
            b = y[recent].mean() if recent.sum() >= minn else (y[known].mean() if known.sum() > 0 else 0.5)
            out[rows_m.index[rows_m.date == t]] = b
    return out


for q in ['Q-DIR', 'Q-VOL', 'Q-MKT']:
    df_q = mk if q == 'Q-MKT' else panel
    baseline_raw = rolling_base(df_q, YCOL[q], 'pooled')
    df_q[f'baseline_{q}'] = baseline_raw
    df_q[f'baseline_{q}_clipped'] = baseline_raw.clip(0.02, 0.98)
    df_q[f'offset_{q}'] = logit(df_q[f'baseline_{q}_clipped'])


# ------------------------------------------------------------------ 4. 中立帯（decision2.py の determine_band をそのまま写す）
def determine_band(hist, step, minn, alpha=0.05, min_diff=0.0):
    b = np.floor(hist.d / step + 1e-9) * step
    g = hist.assign(b=b).groupby('b').agg(n=('y', 'size'), k=('y', 'sum'), base=('base', 'mean')).reset_index()
    g = g[g.n >= minn].copy()
    if len(g) == 0:
        return -np.inf, np.inf
    g['pv'] = [binomtest(int(k), int(n), float(p0)).pvalue for k, n, p0 in zip(g.k, g.n, g.base)]
    order = np.argsort(g.pv.values)
    m = len(g)
    adj = np.empty(m)
    for rank, i in enumerate(order):
        adj[i] = min(1, g.pv.values[i] * (m - rank))
    adj = np.maximum.accumulate(adj[order])[np.argsort(order)]
    g['sig'] = (adj < alpha) & ((g.k / g.n - g.base).abs() >= min_diff)
    g['dir'] = np.sign(g.k / g.n - g.base)
    hi = np.inf
    for bb in sorted(g.b[g.b >= 0]):
        r = g[g.b == bb].iloc[0]
        if r.sig and r.dir > 0:
            hi = bb
            break
    lo = -np.inf
    for bb in sorted(g.b[g.b < 0], reverse=True):
        r = g[g.b == bb].iloc[0]
        if r.sig and r.dir < 0:
            lo = bb + step
            break
    return lo, hi


STEP = {'Q-DIR': 0.05, 'Q-VOL': 0.05, 'Q-MKT': 0.10}
MINN = {'Q-DIR': 30, 'Q-VOL': 30, 'Q-MKT': 10}
SENTINEL_LOWER, SENTINEL_UPPER = -1.0, 1.0


def to_sentinel(lo, hi):
    lo2 = SENTINEL_LOWER if lo == -np.inf else lo
    hi2 = SENTINEL_UPPER if hi == np.inf else hi
    return lo2, hi2


# ------------------------------------------------------------------ 5. 名目引け時刻（TS の isSampleUsable と同じ規則）
def close_time(date, mkt):
    return pd.Timestamp(f'{date} {prep.CLOSE[mkt]}', tz=prep.TZ[mkt]).tz_convert('UTC')


def sample_usable(next_date, sample_mkt, pred_date, pred_mkt):
    return close_time(next_date, sample_mkt) <= close_time(pred_date, pred_mkt)


def next_calendar_date(mkt, date):
    cal = CAL[mkt]
    idx = np.searchsorted(cal, date)
    if idx >= len(cal) or cal[idx] != date:
        return None
    if idx + 1 >= len(cal):
        return None
    return cal[idx + 1]


# ------------------------------------------------------------------ 6. 評価対象（各市場の最終2営業日）
EVAL_DATES = {m: list(CAL[m][-2:]) for m in ['JP', 'US']}
TARGET_KEYS = {(m, d) for m, dates in EVAL_DATES.items() for d in dates}

QUESTIONS = ['Q-DIR', 'Q-VOL', 'Q-MKT']
Q_TO_KEY = {'Q-DIR': 'DIR', 'Q-VOL': 'VOL', 'Q-MKT': 'MKT'}
REVIEW_EVERY = 30  # design.md §1.5・decision2.py と同じ見直し間隔（両市場を合わせたカレンダーで数える）
ALL_DATES = sorted(set(CAL['JP']) | set(CAL['US']))  # 中立帯の見直し間隔用（両市場合算カレンダー）


_FIT_CACHE = {}


def fit_at(q, market, date):
    cache_key = (q, market, date)
    if cache_key in _FIT_CACHE:
        return _FIT_CACHE[cache_key]
    df_q = mk if q == 'Q-MKT' else panel
    cols = FEATS[q]
    off_col = f'offset_{q}'
    ycol = YCOL[q]
    need = df_q[cols + [ycol, off_col]].notna().all(axis=1)
    pt = df_q[(df_q.mkt == market) & (df_q.date == date)].pred_time.iloc[0]
    tr_mask = need & (df_q.label_time <= pt)
    xtr = df_q.loc[tr_mask, cols].to_numpy(float)
    ytr = df_q.loc[tr_mask, ycol].to_numpy(float)
    offtr = df_q.loc[tr_mask, off_col].to_numpy(float)
    model = LR(ALPHA[q], fit_intercept=False)
    if len(ytr) > 0:
        model.fit(xtr, ytr, np.ones(len(ytr)), cols, offset=offtr)
    else:
        model.beta = np.zeros(len(cols) + 1)
        model.mu = np.zeros(0)
        model.sd = np.ones(0)
        model.num = np.array([False] * len(cols))
    distinct_dates = int(df_q.loc[tr_mask, 'date'].nunique())
    result = (model, distinct_dates, int(tr_mask.sum()))
    _FIT_CACHE[cache_key] = result
    return result


def known_history(q, market, date):
    """determine_band / calib_table に渡す既知サンプル (d, y, base) を、時刻の規則でフィルタして作る。

    指摘 C-3: 値がない軸を含む銘柄・市場も（学習からは除外されるが）予測は出す設計
    （design.md §1「予測時は標準化後0」）に合わせ、ここでは cols（判断軸）の完全性は要求しない
    （standardize_row が欠損を 0 として扱う）。要求するのは「採点済み（ycol）」であることと、
    Q-VOL のみ「平常（nrng{N}）がある」こと（design.md §1.6 のバーンイン: 平常が無い銘柄は
    VOL を出さない）。"""
    df_q = mk if q == 'Q-MKT' else panel
    cols = FEATS[q]
    off_col = f'offset_{q}'
    ycol = YCOL[q]
    base_col = f'baseline_{q}_clipped'
    need = df_q[[ycol, off_col]].notna().all(axis=1)
    if q == 'Q-VOL':
        need &= df_q[f'nrng{N}'].notna()
    candidates = df_q[need].copy()
    rows_out = []
    for _, r in candidates.iterrows():
        nb = next_calendar_date(r.mkt, r.date)
        if nb is None:
            continue
        if not sample_usable(nb, r.mkt, date, market):
            continue
        model, distinct_dates, _ = fit_at(q, r.mkt, r.date)
        if distinct_dates < MIN_TRAINING_DATES:
            continue  # その日はバーンイン未達で確率を出していない（design.md §1.6）
        z = standardize_row(model, cols, r)
        p = float(sigmoid(r[off_col] + np.dot(model.beta[1:], z)))
        base = float(r[base_col])
        y = float(r[ycol])
        rows_out.append({'d': p - base, 'y': y, 'base': base, 'p': p, 'market': r.mkt, 'date': r.date})
    return pd.DataFrame(rows_out, columns=['d', 'y', 'base', 'p', 'market', 'date'])


def standardize_row(model, cols, row):
    z = []
    num_idx = 0
    for j, c in enumerate(cols):
        raw = row[c]
        if model.num[j]:
            if pd.isna(raw):
                z.append(0.0)
            else:
                z.append((float(raw) - model.mu[num_idx]) / model.sd[num_idx])
            num_idx += 1
        else:
            z.append(0.0 if pd.isna(raw) else float(raw))
    return np.array(z)


def sequential_contributions(offset_logit, beta, z, cols):
    terms = beta * z
    order = np.argsort(-np.abs(terms))
    cur = offset_logit
    contrib = {}
    for k in order:
        nxt = cur + terms[k]
        contrib[to_axis_id(cols[k])] = float(sigmoid(nxt) - sigmoid(cur))
        cur = nxt
    return contrib


def calib_table(hist_df, step=0.05):
    if len(hist_df) == 0:
        return []
    b = np.floor(hist_df.p / step + 1e-9) * step
    g = hist_df.assign(b=b).groupby('b').agg(n=('y', 'size'), k=('y', 'sum')).reset_index()
    return [
        {'lower': float(r.b), 'upper': float(r.b + step), 'count': int(r.n), 'hitRate': float(r.k / r.n)}
        for _, r in g.iterrows()
    ]


def find_band(table, p, step=0.05):
    b = float(np.floor(p / step + 1e-9) * step)
    for entry in table:
        if abs(entry['lower'] - b) < 1e-9:
            return entry
    return None


# ------------------------------------------------------------------ 7. 日次リプレイして評価対象の詳細を出力
#
# TS 側は D までの全期間を名目引け時刻の順にリプレイし、中立帯は「両市場を合わせたカレンダーで
# 30 営業日ごと」に見直して引き継ぐ（design.md §1.5・§3.1、指摘 A-2）。ゴールデン側もこの
# 見直しの持ち回りを再現しないと、評価対象日の中立帯が一致しない（TS は毎回フレッシュには
# 判定し直さないため）。確率帯の過去実績（bandHistoryTable）はスナップショットのたびに
# 毎回フレッシュに計算する（中立帯の見直しとは別サイクル）。
ALL_ENTRIES = sorted(
    ({'market': m, 'date': d} for m in ['JP', 'US'] for d in CAL[m]),
    key=lambda e: close_time(e['date'], e['market']),
)

neutral_state = {q: None for q in QUESTIONS}
targets_by_key = {}


def maybe_recompute_band(q, market, date):
    prev = neutral_state[q]
    if prev is None:
        should_recompute = True
    else:
        elapsed = sum(1 for d in ALL_DATES if d > prev['decidedOn'] and d <= date)
        should_recompute = elapsed >= REVIEW_EVERY
    if should_recompute:
        hist_df = known_history(q, market, date)
        lo, hi = determine_band(hist_df[['d', 'y', 'base']], STEP[q], MINN[q], min_diff=0.03)
        lo, hi = to_sentinel(lo, hi)
        neutral_state[q] = {'lo': lo, 'hi': hi, 'decidedOn': date}
    return neutral_state[q]


for entry in ALL_ENTRIES:
    market, date = entry['market'], entry['date']
    is_target = (market, date) in TARGET_KEYS
    detail = {'market': market, 'date': date, 'questions': {}} if is_target else None

    for q in QUESTIONS:
        band_state = maybe_recompute_band(q, market, date)
        if not is_target:
            continue

        model, distinct_dates, training_size = fit_at(q, market, date)
        cols = FEATS[q]
        weights = {to_axis_id(c): float(model.beta[1 + j]) for j, c in enumerate(cols)}
        standardization = {}
        num_idx = 0
        for j, c in enumerate(cols):
            if model.num[j]:
                standardization[to_axis_id(c)] = {'mean': float(model.mu[num_idx]), 'std': float(model.sd[num_idx])}
                num_idx += 1
        df_q = mk if q == 'Q-MKT' else panel
        base_clipped = float(df_q.loc[(df_q.mkt == market) & (df_q.date == date), f'baseline_{q}_clipped'].iloc[0])
        offset_logit = float(logit(base_clipped))

        # 確率帯の過去実績は、中立帯の見直し間隔とは別に毎回フレッシュに計算する（TS と同じ）
        hist_df = known_history(q, market, date)
        band_table = calib_table(hist_df, step=0.05)
        known_samples = [
            {'market': rr.market, 'date': rr.date, 'probability': float(rr.p), 'baseline': float(rr.base), 'hit': bool(rr.y)}
            for rr in hist_df.itertuples()
        ]

        q_detail = {
            'baseline': base_clipped,
            'weights': weights,
            'standardization': standardization,
            'trainingSize': training_size,
            'distinctTrainingDates': distinct_dates,
            'neutralBand': {'lower': float(band_state['lo']), 'upper': float(band_state['hi'])},
            'bandHistoryTable': band_table,
            'knownSamples': known_samples,
            'predictions': [],
        }

        # 指摘 C-3: 値なしの軸を含む銘柄・市場も、標準化後 0（寄与なし）として予測に含める
        # （TS の standardize_row と同じ扱い。除外しない）。
        if q == 'Q-MKT':
            row = df_q[(df_q.mkt == market) & (df_q.date == date)]
            if len(row) == 1:
                r = row.iloc[0]
                z = standardize_row(model, cols, r)
                p = float(sigmoid(offset_logit + np.dot(model.beta[1:], z)))
                contrib = sequential_contributions(offset_logit, model.beta[1:], z, cols)
                band_entry = find_band(band_table, p)
                q_detail['predictions'].append(
                    {'key': market, 'probability': p, 'contributions': contrib, 'bandHistory': band_entry}
                )
        else:
            rows_today = df_q[(df_q.mkt == market) & (df_q.date == date)]
            for _, r in rows_today.iterrows():
                z = standardize_row(model, cols, r)
                p = float(sigmoid(offset_logit + np.dot(model.beta[1:], z)))
                contrib = sequential_contributions(offset_logit, model.beta[1:], z, cols)
                band_entry = find_band(band_table, p)
                q_detail['predictions'].append(
                    {'key': r.ticker, 'probability': p, 'contributions': contrib, 'bandHistory': band_entry}
                )
        detail['questions'][Q_TO_KEY[q]] = q_detail

    if is_target:
        targets_by_key[(market, date)] = detail

targets = [targets_by_key[k] for m, dates in EVAL_DATES.items() for k in [(m, d) for d in dates]]

# ------------------------------------------------------------------ 8. 採点結果（実績）の出力
#
# 指摘 B-1・B-2: TickerOutcome.nextRange は生の価格差ではなく比率（(翌日高値-翌日安値)÷基準日終値）
# で持つ。ここでは panel の next_ok・close を使って参照実装と同じ値幅の定義で計算し、
# TS の computeOutcomes（compute.test.ts で突き合わせる）と直接比較できる形にする。
panel_sorted = panel.sort_values(['ticker', 'date']).reset_index(drop=True)
g_ticker = panel_sorted.groupby('ticker')
panel_sorted['next_close'] = g_ticker.close.shift(-1)

outcomes_ticker = []
for _, r in panel_sorted.iterrows():
    if not r.next_ok or pd.isna(r.next_date):
        continue
    next_return_raw = float(r.next_close) / float(r.close) - 1  # 除外されていても実際の値を持つ
    excluded = abs(next_return_raw) > 0.20
    entry = {
        'ticker': r.ticker,
        'market': r.mkt,
        'date': r.date,
        'nextDate': r.next_date,
        'nextReturn': next_return_raw,
    }
    if excluded:
        entry['excludedReason'] = 'EXTREME_RETURN'
    else:
        entry['excessReturn'] = float(r.excess)
        entry['hitDir'] = bool(r.excess > 0)
    if not pd.isna(r.rng_next):
        # rng_next は既に比率（(翌日高値-翌日安値)÷基準日終値。prep.py の定義どおり）
        entry['nextRange'] = float(r.rng_next)
        nrng = r[f'nrng{N}']
        if not pd.isna(nrng):
            entry['rangeRatio'] = float(r.rng_next / nrng)
            entry['hitVol'] = bool(r.rng_next / nrng > 1)
    outcomes_ticker.append(entry)

outcomes_market = []
for _, r in mk.iterrows():
    if pd.isna(r.next_date) or not r.next_ok:
        continue
    if pd.isna(r.Rn):
        continue
    entry = {'market': r.mkt, 'date': r.date, 'nextDate': r.next_date, 'nextRange': float(r.Rn)}
    nr = r[f'nR{N}']
    if not pd.isna(nr):
        entry['rangeRatio'] = float(r.Rn / nr)
        entry['hitMkt'] = bool(r.Rn / nr > 1)
    outcomes_market.append(entry)

# ------------------------------------------------------------------ 9. フィクスチャ入力（bars）を出力
bars = []
for _, r in raw_df.iterrows():
    patterns_matched = [pid for pid in PATTERNS if r['p:' + pid] == 'MATCHED']
    patterns_insufficient = [pid for pid in PATTERNS if r['p:' + pid] == 'INSUFFICIENT_DATA']
    bars.append(
        {
            'tickerId': r.ticker,
            'exchangeId': r.ex,
            'date': r.date,
            'open': float(r.open),
            'high': float(r.high),
            'low': float(r.low),
            'close': float(r.close),
            'volume': None if pd.isna(r.volume) else float(r.volume),
            'createdAt': int(r.created),
            'patternsMatched': patterns_matched,
            'patternsInsufficient': patterns_insufficient,
        }
    )

# ------------------------------------------------------------------ 10. 中立帯: 有意なケースの追加検証（指摘 C-2）
#
# 実勢データ（上の合成価格データ）は基準値からの偏りが小さく、中立帯が寄りなし（番兵値）に
# なることが多い。determine_band 自体（両側二項検定 + Holm 補正 + 向き + 最小差）を参照実装と
# 突き合わせるため、明確に偏った合成の hist データを別途用意する。bars には依存しない。
def make_biased_hist(base, bands):
    """bands: [(帯の下端 b, その帯の実現率, 件数), ...]。件数分の (d, y, base) 行を作る。"""
    rows = []
    for b, realized, n in bands:
        k = int(round(realized * n))
        for i in range(n):
            d = b + 0.001 * (i % 10)  # 帯の中に収める微小なばらつき（境界跨ぎを避ける）
            y = 1.0 if i < k else 0.0
            rows.append({'d': d, 'y': y, 'base': base})
    return pd.DataFrame(rows)


neutral_band_cases = []

# Q-DIR 相当（5pt 刻み・最小件数30・最小差3pt）: 上下とも明確に有意な偏りを作る
hist_dir = make_biased_hist(
    0.40,
    [
        (-0.15, 0.10, 80),
        (-0.10, 0.15, 80),
        (-0.05, 0.25, 80),
        (0.00, 0.40, 80),
        (0.05, 0.75, 80),
        (0.10, 0.85, 80),
        (0.15, 0.90, 80),
    ],
)
lo_dir, hi_dir = determine_band(hist_dir[['d', 'y', 'base']], STEP['Q-DIR'], MINN['Q-DIR'], min_diff=0.03)
lo_dir, hi_dir = to_sentinel(lo_dir, hi_dir)
neutral_band_cases.append(
    {
        'label': 'dir_significant_both_sides',
        'step': STEP['Q-DIR'],
        'minCount': MINN['Q-DIR'],
        'minDiff': 0.03,
        'hist': hist_dir[['d', 'y', 'base']].to_dict(orient='records'),
        'expected': {'lower': float(lo_dir), 'upper': float(hi_dir)},
    }
)

# Q-MKT 相当（10pt 刻み・最小件数10）: 上側だけ有意、下側は件数不足で寄りなしのまま
hist_mkt = make_biased_hist(
    0.35,
    [
        (-0.20, 0.30, 5),  # 件数不足（10未満）で判定されない
        (0.00, 0.35, 15),
        (0.10, 0.85, 15),
    ],
)
lo_mkt, hi_mkt = determine_band(hist_mkt[['d', 'y', 'base']], STEP['Q-MKT'], MINN['Q-MKT'], min_diff=0.03)
lo_mkt, hi_mkt = to_sentinel(lo_mkt, hi_mkt)
neutral_band_cases.append(
    {
        'label': 'mkt_significant_upper_only',
        'step': STEP['Q-MKT'],
        'minCount': MINN['Q-MKT'],
        'minDiff': 0.03,
        'hist': hist_mkt[['d', 'y', 'base']].to_dict(orient='records'),
        'expected': {'lower': float(lo_mkt), 'upper': float(hi_mkt)},
    }
)

fixture = {
    'seed': 20260927,
    'patterns': PATTERNS,
    'dropTicker': DROP_TICKER,
    'dropDateIndex': DROP_DATE_INDEX,
    'extremeTicker': EXTREME_TICKER,
    'extremeDateIndex': EXTREME_DATE_INDEX,
    'bars': bars,
    'targets': targets,
    'outcomesTicker': outcomes_ticker,
    'outcomesMarket': outcomes_market,
    'neutralBandCases': neutral_band_cases,
}

out_path = os.path.join(FIXTURES_DIR, 'golden.json')
with open(out_path, 'w') as f:
    json.dump(fixture, f, ensure_ascii=False)

size_kb = os.path.getsize(out_path) / 1024
print(f'wrote {out_path} ({size_kb:.1f} KB)')
print(f'targets: {len(targets)}, outcomesTicker: {len(outcomes_ticker)}, outcomesMarket: {len(outcomes_market)}')
