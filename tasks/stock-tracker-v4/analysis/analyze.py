"""results.csv / preds / coefs から比較表・キャリブレーション表・図・追加分析を作る。出力: out/tables.md, out/calib_*.png"""
import json, os, sys, glob
import numpy as np, pandas as pd
import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt
from matplotlib import font_manager
font_manager.fontManager.addfont('/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc'); plt.rcParams['font.family'] = 'WenQuanYi Zen Hei'
from scipy.stats import binomtest
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from wf import logloss, brier, ece

HERE = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(HERE, 'out')
R = pd.read_csv(os.path.join(OUT, 'results.csv')); setup = json.load(open(os.path.join(OUT, 'setup.json')))
prep = json.load(open(os.path.join(OUT, 'prep_summary.json')))
COL = {'M0': '#6b6b6b', 'A': '#2a78d6', 'B': '#eb6834', 'C': '#1baf7a', 'D': '#eda100', 'Bcv': '#e87ba4'}
md = []
def P(s=''): md.append(s)
def fmt(x, d=4):
    return '' if (x is None or (isinstance(x, float) and np.isnan(x))) else (f'{x:.{d}f}' if isinstance(x, (float, np.floating)) else str(x))
def table(df, cols, digits=None):
    digits = digits or {}
    P('| ' + ' | '.join(cols) + ' |'); P('|' + '---|' * len(cols))
    for _, r in df.iterrows(): P('| ' + ' | '.join(fmt(r[c], digits.get(c, 4)) for c in cols) + ' |')
    P()

def label(r):
    p = json.loads(r.params) if isinstance(r.params, str) and r.params.startswith('{') else {}
    s = r.method
    if r.method == 'A': s += f" κ={p['kappa']}"
    if r.method in ('B', 'C'): s += f" α={p['alpha']}"
    if r.method == 'C': s += f" h={int(r.halflife)}"
    if r.method == 'D': s += f" ρ={p['rho']} κ={p['kappa']}"
    if r.method == 'Bcv': s = 'B-cv α∈{5,20,80}'
    if not pd.isna(r['window']): s += f" 窓{int(r['window'])}日"
    if r['update'] == 'weekly': s += ' 週次'
    return s
R['label'] = R.apply(label, axis=1)
import ast
R['ci'] = R.dll_ci90.apply(lambda s: '' if pd.isna(s) else '[{:+.4f}, {:+.4f}]'.format(*ast.literal_eval(s)))
R['dll_pct'] = R.dll / R.ll0 * 100

def load_pred(q, N, fs, method, params, window=None, update='daily', halflife=None, win='main'):
    k = f"{q}|N{N}|{fs}|{method}|{json.dumps(params, sort_keys=True)}|w{window}|{update}|h{halflife}|{win}"
    return pd.read_parquet(os.path.join(OUT, 'preds', k.replace('|', '_').replace(' ', '').replace('/', '') + '.parquet'))

# ================================================================ 1. 主比較表
P('## 比較表（主評価窓・N=60・FR-5 対応固定・拡張窓・日次更新）'); P()
P(f"評価窓: {setup['oos_start']['60']} 〜 2026-09-25（JP {setup['oos_days']['main']['JP']} 営業日 / US {setup['oos_days']['main']['US']} 営業日）。前半・後半の分割日: {setup['half_split']['main']}。ΔLL = LL(M0) − LL(方式)（正で改善）。CI は日付ブロック・ブートストラップ 90%。"); P()
for q in ['Q-DIR', 'Q-VOL', 'Q-MKT']:
    sub = R[(R.q == q) & (R.N == 60) & (R.fs == 'fixed') & (R.win_key == 'main') & (R.scope == 'ALL')]
    main = sub[sub['window'].isna() & (sub['update'] == 'daily')]
    P(f'### {q}（全体）'); P()
    m0 = main[main.method == 'M0'].iloc[0]
    P(f"M0: n={m0.n}, 基準値(学習期間の的中率の平均)={m0.base:.3f}, 実現率(OOS)={load_pred(q,60,'fixed','M0',{}).y.mean():.3f}, LL={m0.ll0:.4f}, Brier={m0.brier:.4f}"); P()
    tt = main[main.method != 'M0'].copy()
    # 前半後半
    h1 = R[(R.q == q) & (R.N == 60) & (R.fs == 'fixed') & (R.win_key == 'main') & (R.scope == 'H1')].set_index('key').dll
    h2 = R[(R.q == q) & (R.N == 60) & (R.fs == 'fixed') & (R.win_key == 'main') & (R.scope == 'H2')].set_index('key').dll
    jp = R[(R.q == q) & (R.N == 60) & (R.fs == 'fixed') & (R.win_key == 'main') & (R.scope == 'JP')].set_index('key').dll
    us = R[(R.q == q) & (R.N == 60) & (R.fs == 'fixed') & (R.win_key == 'main') & (R.scope == 'US')].set_index('key').dll
    tt['ΔLL前半'] = tt.key.map(h1); tt['ΔLL後半'] = tt.key.map(h2); tt['ΔLL_JP'] = tt.key.map(jp); tt['ΔLL_US'] = tt.key.map(us)
    tt = tt.rename(columns={'label': '方式', 'dll': 'ΔLL', 'ci': 'ΔLL 90%CI', 'bss': 'BSS', 'auc': 'AUC', 'ece': 'ECE', 'share_far5': '基準±5pt超の割合'})
    table(tt, ['方式', 'ΔLL', 'ΔLL 90%CI', 'ΔLL前半', 'ΔLL後半', 'ΔLL_JP', 'ΔLL_US', 'BSS', 'AUC', 'ECE', '基準±5pt超の割合'], {'基準±5pt超の割合': 3, 'AUC': 3, 'ECE': 3})
    # 窓・更新頻度
    P(f'### {q}: 学習窓・更新頻度（M0 の基準は拡張窓 M0）'); P()
    ww = sub[~(sub['window'].isna() & (sub['update'] == 'daily')) | sub.method.isin(['M0'])]
    ww = ww[ww.method.isin(['M0', 'A', 'B'])].copy()
    ww['ΔLL前半'] = ww.key.map(h1); ww['ΔLL後半'] = ww.key.map(h2)
    ww = ww.rename(columns={'label': '方式', 'dll': 'ΔLL', 'ci': 'ΔLL 90%CI', 'bss': 'BSS', 'auc': 'AUC', 'ece': 'ECE', 'share_far5': '基準±5pt超の割合'})
    table(ww, ['方式', 'ΔLL', 'ΔLL 90%CI', 'ΔLL前半', 'ΔLL後半', 'BSS', 'AUC', 'ECE', '基準±5pt超の割合'], {'基準±5pt超の割合': 3, 'AUC': 3, 'ECE': 3})

# ================================================================ 2. FR-5
P('## FR-5: 対応固定 vs 全軸'); P()
sub = R[(R.N == 60) & (R.win_key == 'main') & (R.scope == 'ALL') & R['window'].isna() & (R['update'] == 'daily') & R.halflife.isna() & (R.q != 'Q-MKT')]
sub = sub[sub.label.isin(['A κ=50', 'B α=20', 'B α=80', 'D ρ=0.5 κ=50'])].copy()
h1 = R[(R.scope == 'H1')].set_index('key').dll; h2 = R[(R.scope == 'H2')].set_index('key').dll
sub['ΔLL前半'] = sub.key.map(h1); sub['ΔLL後半'] = sub.key.map(h2)
sub['軸セット'] = sub.fs.map({'fixed': '対応固定', 'fixed+mkt': '大きさ+市場大きさ', 'all': '全軸'})
sub = sub.rename(columns={'q': '問い', 'label': '方式', 'dll': 'ΔLL', 'ci': 'ΔLL 90%CI', 'bss': 'BSS', 'auc': 'AUC', 'ece': 'ECE', 'share_far5': '基準±5pt超の割合'})
table(sub.sort_values(['問い', '方式', '軸セット']), ['問い', '軸セット', '方式', 'ΔLL', 'ΔLL 90%CI', 'ΔLL前半', 'ΔLL後半', 'BSS', 'AUC', 'ECE', '基準±5pt超の割合'], {'基準±5pt超の割合': 3, 'AUC': 3, 'ECE': 3})

# ================================================================ 3. N=20 vs 60
P('## 平常の算出期間 N=20 vs N=60'); P()
rows = []
for q in ['Q-VOL', 'Q-MKT', 'Q-DIR']:
    for N in [20, 60]:
        for win in ['main', 'ext20']:
            for lab in ['M0', 'A κ=50', 'B α=20', 'C α=20 h=40']:
                s = R[(R.q == q) & (R.N == N) & (R.fs == 'fixed') & (R.win_key == win) & (R.scope == 'ALL') & (R.label == lab) & R['window'].isna() & (R['update'] == 'daily')]
                if len(s) == 0: continue
                s = s.iloc[0]
                if lab == 'M0':
                    pr = load_pred(q, N, 'fixed', 'M0', {}, win=win)
                    rows.append({'問い': q, 'N': N, '評価窓': win, '方式': lab, 'n': s.n, '基準値(M0平均)': s.base, '実現率(OOS)': pr.y.mean(), '実現率 前半': pr[pr.date < setup['half_split'][win]].y.mean(), '実現率 後半': pr[pr.date >= setup['half_split'][win]].y.mean(), 'LL(M0)': s.ll0})
                else:
                    rows.append({'問い': q, 'N': N, '評価窓': win, '方式': lab, 'n': s.n, 'ΔLL': s.dll, 'ΔLL 90%CI': s.ci, 'ΔLL前半': h1.get(s.key), 'ΔLL後半': h2.get(s.key), 'BSS': s.bss, 'AUC': s.auc, 'ECE': s.ece, '基準±5pt超の割合': s.share_far5})
NN = pd.DataFrame(rows)
P(f"評価窓 main = {setup['oos_start']['60']}〜, ext20 = {setup['oos_start']['20']}〜（N=20 のみ可能な拡張窓。分割日 {setup['half_split']['ext20']}）。"); P()
P('### 基準値（M0）と実現率'); P()
table(NN[NN.方式 == 'M0'], ['問い', 'N', '評価窓', 'n', '基準値(M0平均)', '実現率(OOS)', '実現率 前半', '実現率 後半', 'LL(M0)'], {'n': 0})
P('### 予測可能性'); P()
table(NN[NN.方式 != 'M0'], ['問い', 'N', '評価窓', '方式', 'n', 'ΔLL', 'ΔLL 90%CI', 'ΔLL前半', 'ΔLL後半', 'BSS', 'AUC', 'ECE', '基準±5pt超の割合'], {'n': 0, 'AUC': 3, 'ECE': 3, '基準±5pt超の割合': 3})
# 中央値版の基準値（prep から）
P(f"参考: 全期間の基準値（平均版 / 中央値版）: Q-VOL N=20 {prep['base_rates_all']['y_vol20']:.3f} / {prep['base_rates_all']['y_vol20_med']:.3f}, N=60 {prep['base_rates_all']['y_vol60']:.3f} / {prep['base_rates_all']['y_vol60_med']:.3f}（中央値版は基準値が 50% 近くになり「平常」の解釈が変わるため、本比較は平均版で統一）"); P()

# ================================================================ 4. キャリブレーション表＋図
P('## キャリブレーション（主評価窓・N=60・対応固定）'); P()
CANDS = [('M0', {}, None), ('A', {'kappa': 50}, None), ('B', {'alpha': 20}, None), ('C', {'alpha': 20}, 40), ('D', {'rho': 0.5, 'kappa': 50}, None)]
def band_table(pr, step=0.05):
    lo = np.floor(pr.p / step + 1e-9) * step
    t = pr.assign(band=lo).groupby('band').agg(n=('y', 'size'), 予測平均=('p', 'mean'), 実現率=('y', 'mean')).reset_index()
    t['帯'] = t.band.apply(lambda b: f'{b*100:.0f}–{(b+step)*100:.0f}%'); return t
for q in ['Q-DIR', 'Q-VOL', 'Q-MKT']:
    fig, ax = plt.subplots(figsize=(6.4, 6), dpi=130)
    ax.plot([0, 1], [0, 1], color='#bbbbbb', lw=1, ls='--', zorder=1)
    step = 0.10 if q == 'Q-MKT' else 0.05
    for meth, params, h in CANDS:
        pr = load_pred(q, 60, 'fixed', meth, params, halflife=h)
        t = band_table(pr, step)
        lab = {'M0': 'M0', 'A': 'A κ=50', 'B': 'B α=20', 'C': 'C h=40', 'D': 'D ρ=0.5'}[meth]
        if meth == 'M0':
            ax.scatter([pr.p.mean()], [pr.y.mean()], color=COL[meth], s=70, zorder=5, label=lab + '（基準値の平均, 実現率）', marker='D')
        else:
            tt = t[t.n >= (5 if q == 'Q-MKT' else 30)]
            ax.plot(tt.予測平均, tt.実現率, color=COL[meth], lw=2, marker='o', ms=5, label=lab, zorder=4)
        if meth in ('B',):
            P(f'### {q} / {lab}（帯ごとの件数・予測平均・実現率）'); P()
            t2 = t.copy(); t2['基準値との差(実現率−基準)'] = t2.実現率 - pr.y.mean()
            table(t2, ['帯', 'n', '予測平均', '実現率', '基準値との差(実現率−基準)'], {'n': 0, '予測平均': 3, '実現率': 3, '基準値との差(実現率−基準)': 3})
    lo, hi = {'Q-MKT': (0, 1), 'Q-DIR': (0.35, 0.65)}.get(q, (0.1, 0.8))
    ax.set_xlim(lo, hi); ax.set_ylim(lo, hi); ax.set_xlabel('予測確率（帯の平均）'); ax.set_ylabel('実現率')
    ax.set_title(f'{q} 信頼度図（OOS {setup["oos_start"]["60"]}〜09-25, N=60）'); ax.grid(alpha=.25); ax.legend(frameon=False)
    for s in ['top', 'right']: ax.spines[s].set_visible(False)
    fig.tight_layout(); fig.savefig(os.path.join(OUT, f'calib_{q}.png')); plt.close(fig)

# ================================================================ 5. 重みの安定性
P('## 重みの安定性（B α=20・対応固定・拡張窓・日次。US 側の日次再推定の係数）'); P()
for q in ['Q-DIR', 'Q-VOL', 'Q-MKT']:
    f = os.path.join(OUT, f'coefs_{q}_fixed_B_{{"alpha":20}}.csv')
    if not os.path.exists(f): continue
    c = pd.read_csv(f); c = c[c.mkt == 'US']
    cols = [x for x in c.columns if x not in ('mkt', 'date', 'ntr')]
    st = pd.DataFrame({'軸': cols, '平均係数': [c[x].mean() for x in cols], '係数SD(時系列)': [c[x].std() for x in cols],
                       '最小': [c[x].min() for x in cols], '最大': [c[x].max() for x in cols],
                       '符号反転率': [(np.sign(c[x]) != np.sign(c[x].mean())).mean() for x in cols]})
    st['abs'] = st.平均係数.abs(); st = st.sort_values('abs', ascending=False).drop(columns='abs')
    P(f'### {q}（|平均係数| 上位 8。学習 n: {int(c.ntr.iloc[0])} → {int(c.ntr.iloc[-1])}）'); P()
    table(st.head(8), ['軸', '平均係数', '係数SD(時系列)', '最小', '最大', '符号反転率'], {'符号反転率': 2, '平均係数': 3, '係数SD(時系列)': 3, '最小': 3, '最大': 3})

# ================================================================ 6. 軸ごとの OOS 成績（Q-DIR 点灯型）
P('## 参考: 単一軸の成績（Q-DIR、主評価窓の OOS サンプル、点灯時の的中率）'); P()
panel = pd.read_parquet(os.path.join(OUT, 'panel.parquet'))
pr0 = load_pred('Q-DIR', 60, 'fixed', 'M0', {})
oos = panel.loc[pr0.idx]
rows = []
for x in [c for c in panel.columns if c.startswith('x:') and 'cnt' not in c]:
    lit = oos[oos[x] == 1]
    if len(lit) == 0: rows.append({'軸': x[2:], '点灯数': 0}); continue
    rows.append({'軸': x[2:], '点灯数': len(lit), '的中率': lit.y_dir.mean(), '基準との差': lit.y_dir.mean() - oos.y_dir.mean(), '平均超過リターン(pt)': lit.excess.mean() * 100})
AX = pd.DataFrame(rows).sort_values('点灯数', ascending=False)
P(f'全体の実現率 {oos.y_dir.mean():.3f}、n={len(oos)}。全期間の点灯数は prep_summary.json を参照。'); P()
table(AX, ['軸', '点灯数', '的中率', '基準との差', '平均超過リターン(pt)'], {'点灯数': 0, '的中率': 3, '基準との差': 3, '平均超過リターン(pt)': 2})

# ================================================================ 7. Q-MKT 詳細
P('## Q-MKT 詳細（市場×日）'); P()
mk = pd.read_parquet(os.path.join(OUT, 'mkt.parquet'))
prB = load_pred('Q-MKT', 60, 'fixed', 'B', {'alpha': 20}); prA = load_pred('Q-MKT', 60, 'fixed', 'A', {'kappa': 50}); pr0 = load_pred('Q-MKT', 60, 'fixed', 'M0', {})
d = prB.merge(prA[['idx', 'p']].rename(columns={'p': 'pA'}), on='idx').merge(pr0[['idx', 'p']].rename(columns={'p': 'p0'}), on='idx')
d = d.merge(mk[['f_mlR60', 'R', 'nR60', 'Rn']], left_on='idx', right_index=True)
P(f"OOS n={len(d)}（JP {int((d.mkt=='JP').sum())} / US {int((d.mkt=='US').sum())}）。実現率 {d.y.mean():.3f}（JP {d[d.mkt=='JP'].y.mean():.3f} / US {d[d.mkt=='US'].y.mean():.3f}）、M0 基準値の平均 {d.p0.mean():.3f}。"); P()
P('市場ごとの月別: 実現率 / B α=20 予測平均 / M0'); P()
d['month'] = d.date.str[:7]
g = d.groupby(['mkt', 'month']).agg(n=('y', 'size'), 実現率=('y', 'mean'), 予測B=('p', 'mean'), 予測A=('pA', 'mean'), M0=('p0', 'mean')).reset_index()
table(g, ['mkt', 'month', 'n', '実現率', '予測B', '予測A', 'M0'], {'n': 0, '実現率': 3, '予測B': 3, '予測A': 3, 'M0': 3})
# 単純ルールとの比較: f_mlR60 > 0 (当日の市場値幅が平常超) の的中
P(f"参考: 単純ルール「当日の市場平均値幅が平常(60日)超なら翌日も荒れる」の OOS 精度: 当日超 {int((d.f_mlR60>0).sum())} 件のうち実現 {d[d.f_mlR60>0].y.mean():.3f}、当日以下 {int((d.f_mlR60<=0).sum())} 件のうち実現 {d[d.f_mlR60<=0].y.mean():.3f}。"); P()

open(os.path.join(OUT, 'tables.md'), 'w').write('\n'.join(md))
print('\n'.join(md))
