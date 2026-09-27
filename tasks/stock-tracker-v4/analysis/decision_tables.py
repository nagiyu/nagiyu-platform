"""decision_results.csv → 追加検証 1・2 の表（out/decision_tables.md）。"""
import os, sys, json, ast
import numpy as np, pandas as pd
HERE = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(HERE, 'out')
R = pd.read_csv(os.path.join(OUT, 'decision_results.csv')); setup = json.load(open(os.path.join(OUT, 'setup.json')))
R['ci'] = R.dll_ci90.apply(lambda s: '' if pd.isna(s) else '[{:+.4f}, {:+.4f}]'.format(*ast.literal_eval(s)))
VN = {'m0': 'M0（拡張平均）', 'm0r': 'M0r（直近60日基準値）', 'a': '(a) 切片のみ', 'b': '(b) オフセット+切片', 'c': '(c) オフセットのみ'}
UN = {'pooled': '共通', 'dummy': '共通+市場ダミー', 'per_mkt': '市場別'}
md = []; P = md.append
def tbl(df, cols, digits):
    P('| ' + ' | '.join(cols) + ' |'); P('|' + '---|' * len(cols))
    for _, r in df.iterrows():
        P('| ' + ' | '.join((f'{r[c]:.{digits.get(c, 4)}f}' if isinstance(r[c], (float, np.floating)) else str(r[c])) for c in cols) + ' |')
    P('')
def pick(q, v, unit, win, baseline, scope): 
    s = R[(R.q == q) & (R.variant == v) & (R.unit == unit) & (R.win == win) & (R.baseline == baseline) & (R.scope == scope)]
    return s.iloc[0] if len(s) else None

P('### 検証 1: 基準値追従の入れ方（共通モデル、N=20）'); P('')
P('ΔLL(M0) = 拡張平均 M0 との差、ΔLL(M0r) = 直近 60 日基準値 M0r との差。前半/後半は ΔLL(M0)。')
for q in ['Q-DIR', 'Q-VOL', 'Q-MKT']:
    for win in ['main', 'ext20']:
        rows = []
        for v in ['m0r', 'a', 'b', 'c']:
            r = pick(q, v, 'pooled', win, 'M0', 'ALL'); r2 = pick(q, v, 'pooled', win, 'M0r', 'ALL')
            h1 = pick(q, v, 'pooled', win, 'M0', 'H1'); h2 = pick(q, v, 'pooled', win, 'M0', 'H2')
            rows.append({'方式': VN[v], 'n': int(r.n), 'ΔLL(M0)': r.dll, '90%CI': r.ci, 'ΔLL(M0r)': r2.dll, '前半': h1.dll, '後半': h2.dll, 'BSS(M0)': r.bss, 'AUC': r.auc, 'ECE': r.ece, '予測平均': r.p_q50, '実現率': None})
        m0 = pick(q, 'm0', 'pooled', win, 'M0', 'ALL')
        P(f"**{q} / 評価窓 {win}（{setup['oos_start']['60' if win=='main' else '20']}〜）** n={int(m0.n)}, M0 基準値平均 {m0.base:.3f}, LL(M0)={m0.ll0:.4f}, ECE(M0)={m0.ece:.3f}"); P('')
        tbl(pd.DataFrame(rows), ['方式', 'ΔLL(M0)', '90%CI', 'ΔLL(M0r)', '前半', '後半', 'BSS(M0)', 'AUC', 'ECE'], {'AUC': 3, 'ECE': 3})

P('### 検証 2: 重みの単位（共通 / 共通+市場ダミー / 市場別）'); P('')
P('現在の実装（§3 まで）は**共通モデル・市場ダミーなし**（JP/US のサンプルをまとめて 1 本の係数）。市場別は基準値も市場別の直近 60 日。')
rows = []
for q in ['Q-DIR', 'Q-VOL', 'Q-MKT']:
    for win in ['main', 'ext20']:
        for v in ['a', 'b']:
            for unit in ['pooled', 'dummy', 'per_mkt']:
                r = pick(q, v, unit, win, 'M0', 'ALL'); h1 = pick(q, v, unit, win, 'M0', 'H1'); h2 = pick(q, v, unit, win, 'M0', 'H2')
                jp = pick(q, v, unit, win, 'M0', 'JP'); us = pick(q, v, unit, win, 'M0', 'US')
                rows.append({'問い': q, '窓': win, '方式': VN[v], '単位': UN[unit], 'ΔLL': r.dll, '90%CI': r.ci, '前半': h1.dll, '後半': h2.dll, 'JP': jp.dll, 'US': us.dll, 'ECE': r.ece, 'ECE_JP': jp.ece, 'ECE_US': us.ece})
tbl(pd.DataFrame(rows), ['問い', '窓', '方式', '単位', 'ΔLL', '90%CI', '前半', '後半', 'JP', 'US', 'ECE', 'ECE_JP', 'ECE_US'], {'ECE': 3, 'ECE_JP': 3, 'ECE_US': 3})
open(os.path.join(OUT, 'decision_tables.md'), 'w').write('\n'.join(md)); print('\n'.join(md))
