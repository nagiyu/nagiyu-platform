"""全方式・全設定のウォークフォワード実行。出力: out/results.csv, out/preds/*.parquet, out/coefs_*.csv, out/setup.json"""
import json, os, sys, time, itertools
import numpy as np, pandas as pd
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from wf import *

HERE = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(HERE, 'out'); os.makedirs(os.path.join(OUT, 'preds'), exist_ok=True)
panel = pd.read_parquet(os.path.join(OUT, 'panel.parquet')); mk = pd.read_parquet(os.path.join(OUT, 'mkt.parquet'))
MIN_TRAIN_DAYS = 30
PAT = [c for c in panel.columns if c.startswith('x:') and 'cnt' not in c]  # 27 + buy_ge2 + sell_ge2
def size(N): return [f'f_lpark{N}', f'f_lrng{N}', f'f_lvol{N}']
def msize(N): return [f'f_mlpark{N}', f'f_mlrng{N}', f'f_mlvol{N}']
FEATS = {
    ('Q-DIR', 'fixed'): lambda N: PAT, ('Q-DIR', 'all'): lambda N: PAT + size(N) + msize(N),
    ('Q-VOL', 'fixed'): lambda N: size(N), ('Q-VOL', 'fixed+mkt'): lambda N: size(N) + msize(N), ('Q-VOL', 'all'): lambda N: PAT + size(N) + msize(N),
    ('Q-MKT', 'fixed'): lambda N: msize(N) + [f'f_mlR{N}'],
}
YCOL = {'Q-DIR': lambda N: 'y_dir', 'Q-VOL': lambda N: f'y_vol{N}', 'Q-MKT': lambda N: f'y_mkt{N}'}

cal = {m: np.array(sorted(panel[panel.mkt == m].date.unique())) for m in ['JP', 'US']}
def oos_start(N):
    """N 日平常＋MIN_TRAIN_DAYS 営業日のラベル付き学習が両市場で揃う最初の日。"""
    starts = []
    for m in ['JP', 'US']:
        ok = panel[(panel.mkt == m) & panel[f'f_lrng{N}'].notna() & panel[f'y_vol{N}'].notna()].date
        d0 = ok.min(); i0 = int(np.searchsorted(cal[m], d0)); starts.append(cal[m][i0 + MIN_TRAIN_DAYS])
    return max(starts)
def oos_dates(start, end=None):
    return {m: [d for d in cal[m] if d >= start and (end is None or d < end)] for m in ['JP', 'US']}

def run_one(q, N, fs, method, params, window, update, halflife, oos, save_coefs=False):
    data = mk if q == 'Q-MKT' else panel
    cols = FEATS[(q, fs)](N); ycol = YCOL[q](N)
    fac = {'M0': lambda: M0(), 'A': lambda: NB(**params), 'B': lambda: LR(**params), 'Bcv': lambda: LRCV(**params),
           'C': lambda: LR(**params), 'D': lambda: Cluster(**params)}[method]
    return walk_forward(data, cols, ycol, oos, cal, fac, window=window, update=update, halflife=halflife, save_coefs=save_coefs)

def main():
    setup = {'oos_start': {N: str(oos_start(N)) for N in [20, 60]}, 'min_train_days': MIN_TRAIN_DAYS}
    S60 = oos_start(60); S20 = oos_start(20)
    # 主評価窓: N=60 の OOS 開始日以降（全方式・全 N でこの窓）。副次: N=20 の拡張窓。
    windows = {'main': oos_dates(S60), 'ext20': oos_dates(S20)}
    def half(oos):
        ds = sorted(set(oos['JP']) | set(oos['US'])); return ds[len(ds) // 2]
    setup['half_split'] = {k: str(half(v)) for k, v in windows.items()}
    setup['oos_days'] = {k: {m: len(v[m]) for m in v} for k, v in windows.items()}
    json.dump(setup, open(os.path.join(OUT, 'setup.json'), 'w'), indent=1)
    print(setup)

    # ---- 設定グリッド
    grid = []  # (q, N, fs, method, params, window, update, halflife, win_key)
    def add(q, N, fs, method, params=None, window=None, update='daily', halflife=None, win_key='main'):
        grid.append(dict(q=q, N=N, fs=fs, method=method, params=params or {}, window=window, update=update, halflife=halflife, win_key=win_key))
    for q, fs_main in [('Q-DIR', 'fixed'), ('Q-VOL', 'fixed'), ('Q-MKT', 'fixed')]:
        N = 60
        add(q, N, fs_main, 'M0')
        for k in [20, 50, 200]: add(q, N, fs_main, 'A', {'kappa': k})
        for a in [5, 20, 80]: add(q, N, fs_main, 'B', {'alpha': a})
        add(q, N, fs_main, 'Bcv', {'alphas': (5, 20, 80)})
        for h in [20, 40, 80]: add(q, N, fs_main, 'C', {'alpha': 20}, halflife=h)
        for r in [0.3, 0.5]: add(q, N, fs_main, 'D', {'rho': r, 'kappa': 50})
        # 学習窓・更新頻度（M0 / A50 / B20）
        for w in [60, 120]:
            add(q, N, fs_main, 'M0', window=w); add(q, N, fs_main, 'A', {'kappa': 50}, window=w); add(q, N, fs_main, 'B', {'alpha': 20}, window=w)
        add(q, N, fs_main, 'A', {'kappa': 50}, update='weekly'); add(q, N, fs_main, 'B', {'alpha': 20}, update='weekly')
        # N=20（同じ主評価窓）
        add(q, 20, fs_main, 'M0'); add(q, 20, fs_main, 'A', {'kappa': 50}); add(q, 20, fs_main, 'B', {'alpha': 20})
        # N=20 拡張窓
        add(q, 20, fs_main, 'M0', win_key='ext20'); add(q, 20, fs_main, 'A', {'kappa': 50}, win_key='ext20'); add(q, 20, fs_main, 'B', {'alpha': 20}, win_key='ext20')
        add(q, 20, fs_main, 'C', {'alpha': 20}, halflife=40, win_key='ext20')
    # FR-5: 全軸
    for fs in ['all']:
        for a in [20, 80]: add('Q-DIR', 60, fs, 'B', {'alpha': a})
        add('Q-DIR', 60, fs, 'A', {'kappa': 50}); add('Q-DIR', 60, fs, 'D', {'rho': 0.5, 'kappa': 50})
    for fs in ['fixed+mkt', 'all']:
        add('Q-VOL', 60, fs, 'B', {'alpha': 20}); add('Q-VOL', 60, fs, 'A', {'kappa': 50}); add('Q-VOL', 60, fs, 'D', {'rho': 0.5, 'kappa': 50})
    add('Q-VOL', 60, 'fixed+mkt', 'B', {'alpha': 80})
    print('configs:', len(grid))

    rows = []; preds_cache = {}
    def key(c): return f"{c['q']}|N{c['N']}|{c['fs']}|{c['method']}|{json.dumps(c['params'], sort_keys=True)}|w{c['window']}|{c['update']}|h{c['halflife']}|{c['win_key']}"
    t0 = time.time()
    for i, c in enumerate(grid):
        k = key(c); oos = windows[c['win_key']]
        save = c['method'] in ('B', 'A') and c['window'] is None and c['update'] == 'daily' and c['halflife'] is None and c['N'] == 60 and c['win_key'] == 'main'
        pred, coefs = run_one(c['q'], c['N'], c['fs'], c['method'], c['params'], c['window'], c['update'], c['halflife'], oos, save_coefs=save)
        preds_cache[k] = pred
        pred.to_parquet(os.path.join(OUT, 'preds', k.replace('|', '_').replace(' ', '').replace('/', '') + '.parquet'))
        if coefs is not None: coefs.to_csv(os.path.join(OUT, f"coefs_{c['q']}_{c['fs']}_{c['method']}_{json.dumps(c['params']).replace(' ', '')}.csv"), index=False)
        print(f'[{i+1}/{len(grid)}] {k} n={len(pred)} {time.time()-t0:.0f}s', flush=True)
    # ---- 評価（M0 は同じ q/N/win_key/window の拡張型 M0 を基準にする。窓比較も基準は拡張 M0）
    for c in grid:
        k = key(c); c0 = dict(c, method='M0', params={}, window=None, update='daily', halflife=None); k0 = key(c0)
        if k0 not in preds_cache:
            preds_cache[k0], _ = run_one(c0['q'], c0['N'], c0['fs'], 'M0', {}, None, 'daily', None, windows[c['win_key']])
        res, d = evaluate(preds_cache[k], preds_cache[k0], setup['half_split'][c['win_key']])
        for scope, r in res.items():
            rows.append({**{kk: (json.dumps(v) if isinstance(v, (dict, tuple)) else v) for kk, v in c.items()}, 'key': k, 'scope': scope, **r})
    R = pd.DataFrame(rows); R.to_csv(os.path.join(OUT, 'results.csv'), index=False)
    print(R[R.scope == 'ALL'][['q', 'N', 'fs', 'method', 'params', 'window', 'update', 'halflife', 'win_key', 'n', 'll0', 'dll', 'bss', 'auc', 'ece', 'share_far5']].to_string())

if __name__ == '__main__':
    main()
