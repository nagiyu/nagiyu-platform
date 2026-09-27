"""決定構成（B・N=20・対応固定・拡張窓・日次）の追加検証 1・2:
 1. 基準値追従の入れ方 (a) 切片のみ / (b) 直近60日基準値 logit をオフセット + 切片 / (c) オフセットのみ（切片なし）
 2. 重みの単位: 共通モデル（現状）/ 共通 + 市場ダミー / 市場別モデル
出力: out/decision_results.csv, out/decision_tables.md, out/preds_dec/*.parquet"""
import os, sys, json, itertools
import numpy as np, pandas as pd
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from wf import *
import run as R0

HERE = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(HERE, 'out'); PD = os.path.join(OUT, 'preds_dec'); os.makedirs(PD, exist_ok=True)
panel = R0.panel.copy(); mk = R0.mk.copy(); cal = R0.cal
N = 20
ALPHA = {'Q-DIR': 80, 'Q-VOL': 20, 'Q-MKT': 20}
FEATS = {'Q-DIR': R0.PAT, 'Q-VOL': R0.size(N) + R0.msize(N), 'Q-MKT': R0.msize(N) + [f'f_mlR{N}']}
YCOL = {'Q-DIR': 'y_dir', 'Q-VOL': f'y_vol{N}', 'Q-MKT': f'y_mkt{N}'}
BASE_WIN = 60; BASE_MIN = 20

def rolling_base(df, ycol, scope):
    """各行の (date, mkt) 時点で知り得る、直近 BASE_WIN 営業日（予測市場のカレンダー）のラベル付きサンプルの的中率。
    scope='pooled': 両市場のサンプル / 'mkt': 同市場のみ。件数 < BASE_MIN なら拡張平均、それも無ければ 0.5。"""
    out = pd.Series(np.nan, index=df.index)
    lab = df.label_time.to_numpy(); y = df[ycol].to_numpy(float); d = df.date.to_numpy(); m = df.mkt.to_numpy()
    valid = ~np.isnan(y)
    for mm in ['JP', 'US']:
        rows = df[df.mkt == mm]
        pt = dict(zip(rows.date, rows.pred_time))
        for i, t in enumerate(cal[mm]):
            if t not in pt: continue
            known = valid & (lab <= pt[t])
            if scope == 'mkt': known &= (m == mm)
            recent = known & (d >= cal[mm][max(0, i - BASE_WIN)])
            b = y[recent].mean() if recent.sum() >= BASE_MIN else (y[known].mean() if known.sum() > 0 else 0.5)
            out[rows.index[rows.date == t]] = b
    return out

for q in ['Q-DIR', 'Q-VOL', 'Q-MKT']:
    df = mk if q == 'Q-MKT' else panel
    df[f'b60_pooled_{q}'] = rolling_base(df, YCOL[q], 'pooled'); df[f'b60_mkt_{q}'] = rolling_base(df, YCOL[q], 'mkt')
    df[f'off_pooled_{q}'] = logit(df[f'b60_pooled_{q}'].clip(0.02, 0.98)); df[f'off_mkt_{q}'] = logit(df[f'b60_mkt_{q}'].clip(0.02, 0.98))
panel['x:mkt_US'] = (panel.mkt == 'US').astype(float); mk['x:mkt_US'] = (mk.mkt == 'US').astype(float)

S60 = R0.oos_start(60); S20 = R0.oos_start(20)
windows = {'main': R0.oos_dates(S60), 'ext20': R0.oos_dates(S20)}
setup = json.load(open(os.path.join(OUT, 'setup.json')))

class M0Roll:  # M0 直近60日版: 予測 = オフセットの sigmoid
    name = 'M0r'
    def fit(self, X, y, w, cols, offset=None): return self
    def predict(self, X, offset=None): return sigmoid(offset)
    def coefs(self): return {}

def run(q, variant, unit, win):
    df = mk if q == 'Q-MKT' else panel
    cols = list(FEATS[q]); a = ALPHA[q]; oos = windows[win]
    off = None
    if variant in ('b', 'c', 'm0r'): off = f'off_{"mkt" if unit == "per_mkt" else "pooled"}_{q}'
    if unit == 'dummy': cols = cols + ['x:mkt_US']
    fac = {'a': lambda: LR(a), 'b': lambda: LR(a), 'c': lambda: LR(a, fit_intercept=False), 'm0': lambda: M0(), 'm0r': lambda: M0Roll()}[variant]
    if unit == 'per_mkt':
        parts = []
        for mm in ['JP', 'US']:
            sub = df[df.mkt == mm]
            p, _ = walk_forward(sub, cols, YCOL[q], {mm: oos[mm], ('US' if mm == 'JP' else 'JP'): []}, cal, fac, offset_col=off)
            parts.append(p)
        pred = pd.concat(parts, ignore_index=True)
    else:
        pred, _ = walk_forward(df, cols, YCOL[q], oos, cal, fac, offset_col=off)
    return pred

if __name__ == '__main__':
    grid = []
    for q in ['Q-DIR', 'Q-VOL', 'Q-MKT']:
        for win in ['main', 'ext20']:
            grid += [(q, 'm0', 'pooled', win), (q, 'm0r', 'pooled', win), (q, 'm0r', 'per_mkt', win)]
            for v in ['a', 'b', 'c']: grid.append((q, v, 'pooled', win))
            for v in ['a', 'b']:
                for unit in ['dummy', 'per_mkt']: grid.append((q, v, unit, win))
    preds = {}; rows = []
    for i, g in enumerate(grid):
        preds[g] = run(*g); preds[g].to_parquet(os.path.join(PD, '_'.join(g) + '.parquet'))
        print(f'[{i+1}/{len(grid)}]', g, len(preds[g]), flush=True)
    for g in grid:
        q, v, unit, win = g
        for base_name, bkey in [('M0', (q, 'm0', 'pooled', win)), ('M0r', (q, 'm0r', 'pooled', win))]:
            res, _ = evaluate(preds[g], preds[bkey], setup['half_split'][win])
            for scope, r in res.items():
                rows.append({'q': q, 'variant': v, 'unit': unit, 'win': win, 'baseline': base_name, 'scope': scope, **r})
    pd.DataFrame(rows).to_csv(os.path.join(OUT, 'decision_results.csv'), index=False)
    print('done')
