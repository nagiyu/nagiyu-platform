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
N_DAYS = 80
DATES = pd.bdate_range('2024-01-02', periods=N_DAYS).strftime('%Y-%m-%d').tolist()

TICKERS = [
    ('JT1', 'TSE'),
    ('JT2', 'TSE'),
    ('JT3', 'TSE'),
    ('JT4', 'TSE'),
    ('UT1', 'NASDAQ'),
    ('UT2', 'NYSE'),
    ('UT3', 'AMEX'),
    ('UT4', 'NASDAQ'),
]

DROP_TICKER, DROP_DATE_INDEX = 'UT3', 40  # 1銘柄だけ1日欠落 -> 翌営業日不一致を作る
EXTREME_TICKER, EXTREME_DATE_INDEX = 'JT2', 55  # |リターン| > 20% を1件作る

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


# ------------------------------------------------------------------ 6. 評価対象（各市場の最終3営業日）
EVAL_DATES = {m: list(CAL[m][-2:]) for m in ['JP', 'US']}

QUESTIONS = ['Q-DIR', 'Q-VOL', 'Q-MKT']
Q_TO_KEY = {'Q-DIR': 'DIR', 'Q-VOL': 'VOL', 'Q-MKT': 'MKT'}


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
    TS 側の history.knownXxxSamples に渡す元データ（market, date, probability, baseline, hit）も保持する。"""
    df_q = mk if q == 'Q-MKT' else panel
    cols = FEATS[q]
    off_col = f'offset_{q}'
    ycol = YCOL[q]
    base_col = f'baseline_{q}_clipped'
    need = df_q[cols + [ycol, off_col]].notna().all(axis=1)
    candidates = df_q[need].copy()
    rows_out = []
    for _, r in candidates.iterrows():
        nb = next_calendar_date(r.mkt, r.date)
        if nb is None:
            continue
        if not sample_usable(nb, r.mkt, date, market):
            continue
        model, _, _ = fit_at(q, r.mkt, r.date)
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


# ------------------------------------------------------------------ 7. 評価対象ごとに詳細を出力
targets = []
for market, dates in EVAL_DATES.items():
    for date in dates:
        detail = {'market': market, 'date': date, 'questions': {}}
        for q in QUESTIONS:
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

            hist_df = known_history(q, market, date)
            hist_for_band = hist_df[['d', 'y', 'base']]
            lo, hi = determine_band(hist_for_band, STEP[q], MINN[q], min_diff=0.03)
            lo, hi = to_sentinel(lo, hi)
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
                'neutralBand': {'lower': float(lo), 'upper': float(hi)},
                'bandHistoryTable': band_table,
                'knownSamples': known_samples,
                'predictions': [],
            }

            if q == 'Q-MKT':
                row = df_q[(df_q.mkt == market) & (df_q.date == date)]
                if len(row) == 1:
                    r = row.iloc[0]
                    if not r[cols].isna().any():
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
                    if r[cols].isna().any():
                        continue  # 値なし軸のケースは別途 TS 単体テストで扱う（報告に記載）
                    z = standardize_row(model, cols, r)
                    p = float(sigmoid(offset_logit + np.dot(model.beta[1:], z)))
                    contrib = sequential_contributions(offset_logit, model.beta[1:], z, cols)
                    band_entry = find_band(band_table, p)
                    q_detail['predictions'].append(
                        {'key': r.ticker, 'probability': p, 'contributions': contrib, 'bandHistory': band_entry}
                    )
            detail['questions'][Q_TO_KEY[q]] = q_detail
        targets.append(detail)

# ------------------------------------------------------------------ 8. 採点結果（実績）の出力
outcomes_ticker = []
for _, r in panel.iterrows():
    if pd.isna(r.next_date) or not r.next_ok:
        continue
    entry = {'ticker': r.ticker, 'market': r.mkt, 'date': r.date, 'nextDate': r.next_date}
    if pd.isna(r.ret1):
        entry['excludedReason'] = 'EXTREME_RETURN'
    else:
        entry['excessReturn'] = float(r.excess)
        entry['hitDir'] = bool(r.excess > 0)
    if not pd.isna(r.rng_next):
        entry['rangeNextRatio'] = float(r.rng_next)
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
    entry = {'market': r.mkt, 'date': r.date, 'nextDate': r.next_date}
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
}

out_path = os.path.join(FIXTURES_DIR, 'golden.json')
with open(out_path, 'w') as f:
    json.dump(fixture, f, ensure_ascii=False)

size_kb = os.path.getsize(out_path) / 1024
print(f'wrote {out_path} ({size_kb:.1f} KB)')
print(f'targets: {len(targets)}, outcomesTicker: {len(outcomes_ticker)}, outcomesMarket: {len(outcomes_market)}')
