"""追加検証 3〜5: 中立帯 (i) の定期見直し運用の模擬、寄与の pt 換算、確率帯ごとの件数分布。
入力: out/preds_dec/<q>_<variant>_<unit>_ext20.parquet（decision.py の出力）。出力: out/decision2_tables.md"""
import os, sys, json
import numpy as np, pandas as pd
from scipy.stats import binomtest
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from wf import logit, sigmoid, LR, walk_forward
import decision as D

HERE = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(HERE, 'out'); PD = os.path.join(OUT, 'preds_dec')
VARIANT = os.environ.get('DEC_VARIANT', 'b'); UNIT = os.environ.get('DEC_UNIT', 'pooled')
md = []; P = md.append
def tbl(df, cols, digits=None):
    digits = digits or {}
    P('| ' + ' | '.join(cols) + ' |'); P('|' + '---|' * len(cols))
    for _, r in df.iterrows():
        P('| ' + ' | '.join((f'{r[c]:.{digits.get(c, 3)}f}' if isinstance(r[c], (float, np.floating)) and not np.isnan(r[c]) else ('' if isinstance(r[c], float) else str(r[c]))) for c in cols) + ' |')
    P('')

# ------------------------------------------------------------ 3. 中立帯 (i) の定期見直し
STEP = {'Q-DIR': 0.05, 'Q-VOL': 0.05, 'Q-MKT': 0.10}; MINN = {'Q-DIR': 30, 'Q-VOL': 30, 'Q-MKT': 10}
REVIEW_EVERY = 30  # 営業日（両市場の合算カレンダー）

def determine_band(hist, step, minn, alpha=0.05, min_diff=0.0):
    """hist: 列 d (= p − 基準値), y, base。帯 = d を step 刻みで区切る。各帯で実現率 vs その帯の基準値平均の二項検定（両側）。
    Holm 法で多重比較補正（検定した帯の数）。基準値を含む帯（d=0 の帯）から外側へ進み、最初に「有意かつ向きが合う」帯が出たら、
    その帯以遠をすべて寄りあり（外側は件数不足でも寄りありとみなす）。戻り値: 中立帯 [lo, hi)（d の単位）。"""
    b = np.floor(hist.d / step + 1e-9) * step
    g = hist.assign(b=b).groupby('b').agg(n=('y', 'size'), k=('y', 'sum'), base=('base', 'mean')).reset_index()
    g = g[g.n >= minn].copy()
    if len(g) == 0: return -np.inf, np.inf
    g['pv'] = [binomtest(int(k), int(n), float(p0)).pvalue for k, n, p0 in zip(g.k, g.n, g.base)]
    # Holm
    order = np.argsort(g.pv.values); m = len(g); adj = np.empty(m)
    for rank, i in enumerate(order): adj[i] = min(1, g.pv.values[i] * (m - rank))
    adj = np.maximum.accumulate(adj[order])[np.argsort(order)]
    g['sig'] = (adj < alpha) & ((g.k / g.n - g.base).abs() >= min_diff); g['dir'] = np.sign(g.k / g.n - g.base)
    hi = np.inf
    for bb in sorted(g.b[g.b >= 0]):
        r = g[g.b == bb].iloc[0]
        if r.sig and r.dir > 0: hi = bb; break
    lo = -np.inf
    for bb in sorted(g.b[g.b < 0], reverse=True):
        r = g[g.b == bb].iloc[0]
        if r.sig and r.dir < 0: lo = bb + step; break
    return lo, hi

P(f'### 検証 3: 中立帯 (i) の定期見直し運用の模擬（構成: ({VARIANT}) / {"共通" if UNIT=="pooled" else UNIT}、拡張評価窓 05-19〜）'); P('')
P(f'判定の具体（「最小差」は有意差に加えて |実現率 − 基準値| ≥ 3pt を要求する変種）: 帯は「確率 − 基準値」を {"5pt（Q-MKT は 10pt）"} 刻み。各帯で実現率 vs その帯の基準値平均を両側二項検定、Holm 法で補正（α=5%）、最小件数 30（Q-MKT は 10）。基準値を含む帯から外側へ進み、最初に有意かつ向きが合う帯以遠を「寄りあり」（それより外の帯は件数不足でも寄りあり）。稼働開始時は OOS 予測の最初の {REVIEW_EVERY} 営業日分（FR-13 の初期値算出に相当）で決め、以後 {REVIEW_EVERY} 営業日ごとに累積 OOS 予測で再判定。'); P('')
all_dates = sorted(set(D.cal['JP']) | set(D.cal['US']))
sim_rows = []; band_hist = []
for q, MD in [(q, md_) for md_ in [0.0, 0.03] for q in ['Q-DIR', 'Q-VOL', 'Q-MKT']]:
    pr = pd.read_parquet(os.path.join(PD, f'{q}_{VARIANT}_{UNIT}_ext20.parquet'))
    m0r = pd.read_parquet(os.path.join(PD, f'{q}_m0r_{UNIT}_ext20.parquet'))
    pr = pr.merge(m0r[['idx', 'p']].rename(columns={'p': 'base'}), on='idx')
    pr['d'] = pr.p - pr.base
    ds = [d for d in all_dates if d >= pr.date.min()]
    checkpoints = ds[REVIEW_EVERY::REVIEW_EVERY] + [None]
    prev = ds[REVIEW_EVERY]; lo, hi = determine_band(pr[pr.date < prev], STEP[q], MINN[q], min_diff=MD)
    band_hist.append({'問い': q, '最小差': f'{MD*100:.0f}pt', '判定日': prev, '中立帯': f'[{lo*100:+.0f}pt, {hi*100:+.0f}pt)', '判定に使った件数': int((pr.date < prev).sum())})
    ev = []
    for cp in checkpoints[1:]:
        seg = pr[(pr.date >= prev) & ((pr.date < cp) if cp else True)]
        ev.append(seg.assign(lo=lo, hi=hi))
        if cp:
            lo, hi = determine_band(pr[pr.date < cp], STEP[q], MINN[q], min_diff=MD); prev = cp
            band_hist.append({'問い': q, '最小差': f'{MD*100:.0f}pt', '判定日': cp, '中立帯': f'[{lo*100:+.0f}pt, {hi*100:+.0f}pt)', '判定に使った件数': int((pr.date < cp).sum())})
    E = pd.concat(ev)
    up = E.d >= E.hi; dn = E.d < E.lo; mid = ~(up | dn)
    sim_rows.append({'問い': q, '最小差': f'{MD*100:.0f}pt', '評価件数': len(E), '評価期間': f'{E.date.min()}〜{E.date.max()}', '中立の割合': mid.mean(),
                     '上寄り n': int(up.sum()), '上寄り 実現率': E.y[up].mean() if up.any() else np.nan, '上寄り 基準値平均': E.base[up].mean() if up.any() else np.nan,
                     '下寄り n': int(dn.sum()), '下寄り 実現率': E.y[dn].mean() if dn.any() else np.nan, '下寄り 基準値平均': E.base[dn].mean() if dn.any() else np.nan,
                     '中立 実現率': E.y[mid].mean() if mid.any() else np.nan, '中立 基準値平均': E.base[mid].mean() if mid.any() else np.nan})
P('中立帯の判定履歴:'); P(''); tbl(pd.DataFrame(band_hist), ['問い', '最小差', '判定日', '中立帯', '判定に使った件数'])
P('評価（初回判定後の全期間、その時点の帯を適用）:'); P('')
tbl(pd.DataFrame(sim_rows), ['問い', '最小差', '評価件数', '評価期間', '中立の割合', '上寄り n', '上寄り 実現率', '上寄り 基準値平均', '下寄り n', '下寄り 実現率', '下寄り 基準値平均', '中立 実現率', '中立 基準値平均'])

# ------------------------------------------------------------ 4. 寄与の pt 換算（Q-VOL、最終日のモデルで典型例）
P('### 検証 4: 寄与の pt 換算（Q-VOL、最終日 2026-09-25 のモデル、共通・(b) と (c)）'); P('')
q = 'Q-VOL'; cols = D.FEATS[q]; ycol = D.YCOL[q]
df = D.panel; off = f'off_pooled_{q}'
last_t = '2026-09-25'
need = df[cols + [ycol, off]].notna().all(axis=1)
tr = df[need & (df.label_time <= df[df.date == last_t].pred_time.max())]
te = df[df[cols + [off]].notna().all(axis=1) & (df.date == last_t)]
for variant in ['b', 'c']:
    m = LR(D.ALPHA[q], fit_intercept=(variant == 'b')).fit(tr[cols].to_numpy(float), tr[ycol].to_numpy(float), np.ones(len(tr)), cols, offset=tr[off].to_numpy(float))
    Z = m._design(te[cols].to_numpy(float)); beta = m.beta
    o = te[off].to_numpy(float); eta = o + Z @ beta; p = sigmoid(eta); base = sigmoid(o)
    te2 = te.assign(p=p, base=base)
    picks = [te2.p.idxmax(), te2.p.idxmin(), (te2.p - te2.base).abs().idxmin()]
    P(f'**({variant})** 係数: 切片 {beta[0]:+.3f}, ' + ', '.join(f'{c} {b:+.3f}' for c, b in zip(cols, beta[1:]))); P('')
    rows = []
    for i in picks:
        j = te2.index.get_loc(i); z = Z[j]; contrib_logit = z[1:] * beta[1:]
        # 定義 1: その軸を外したときの差
        loo = [sigmoid(eta[j]) - sigmoid(eta[j] - contrib_logit[k]) for k in range(len(cols))]
        # 定義 2: 基準値 logit から順に足す（|寄与| の大きい順）
        order = np.argsort(-np.abs(contrib_logit)); seq = np.zeros(len(cols)); cur = o[j] + beta[0]
        for k in order:
            nxt = cur + contrib_logit[k]; seq[k] = sigmoid(nxt) - sigmoid(cur); cur = nxt
        icpt = sigmoid(o[j] + beta[0]) - sigmoid(o[j])
        rows.append({'銘柄': te2.loc[i, 'ticker'], '確率': p[j] * 100, '基準値': base[j] * 100, '確率−基準': (p[j] - base[j]) * 100, '切片の寄与(pt)': icpt * 100,
                     **{f'{c} 値(z)': z[1 + k] for k, c in enumerate(cols)},
                     **{f'{c} logit寄与': contrib_logit[k] for k, c in enumerate(cols)},
                     'Σ外した差(pt)': sum(loo) * 100, 'Σ順次(pt)': sum(seq) * 100,
                     **{f'{c} 外した差(pt)': loo[k] * 100 for k, c in enumerate(cols)}, **{f'{c} 順次(pt)': seq[k] * 100 for k, c in enumerate(cols)}})
    T = pd.DataFrame(rows)
    short = {c: c.replace('f_', '').replace('20', '') for c in cols}
    def ren(cc):
        for c in cols:
            if c in cc: return cc.replace(c, short[c])
        return cc
    T.columns = [ren(cc) for cc in T.columns]
    tbl(T, ['銘柄', '確率', '基準値', '確率−基準', '切片の寄与(pt)', 'Σ外した差(pt)', 'Σ順次(pt)'], {'確率': 1, '基準値': 1, '確率−基準': 1, '切片の寄与(pt)': 1, 'Σ外した差(pt)': 1, 'Σ順次(pt)': 1})
    tbl(T, ['銘柄'] + [f'{short[c]} logit寄与' for c in cols] + [f'{short[c]} 外した差(pt)' for c in cols] + [f'{short[c]} 順次(pt)' for c in cols], {k: 1 for k in T.columns if 'pt' in k})

# ------------------------------------------------------------ 5. 確率帯ごとの件数分布（評価期間末時点の累積）
P('### 検証 5: 確率帯（5pt）ごとの累積件数（拡張評価窓 05-19〜09-25 の OOS 予測、構成 ' + f'({VARIANT})）'); P('')
for q in ['Q-DIR', 'Q-VOL', 'Q-MKT']:
    pr = pd.read_parquet(os.path.join(PD, f'{q}_{VARIANT}_{UNIT}_ext20.parquet'))
    b = np.floor(pr.p / 0.05 + 1e-9) * 0.05
    g = pr.assign(b=b).groupby('b').agg(n=('y', 'size'), 実現率=('y', 'mean')).reset_index()
    g['帯'] = g.b.apply(lambda x: f'{x*100:.0f}–{(x+0.05)*100:.0f}%')
    P(f'{q}（n={len(pr)}、30 件未満の帯: {int((g.n < 30).sum())} / {len(g)}）: ' + ', '.join(f'{r.帯} {int(r.n)}件({r.実現率:.2f})' for _, r in g.iterrows())); P('')
open(os.path.join(OUT, 'decision2_tables.md'), 'w').write('\n'.join(md)); print('\n'.join(md))
