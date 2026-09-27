"""中立帯の判定方法の比較。前半 OOS で帯を決め、後半 OOS で「帯の外に出た割合」と「その実現率」を測る。出力: out/neutral.md"""
import os, sys, json
import numpy as np, pandas as pd
from scipy.stats import binomtest
HERE = os.path.dirname(os.path.abspath(__file__)); OUT = os.path.join(HERE, 'out')
setup = json.load(open(os.path.join(OUT, 'setup.json'))); SPLIT = setup['half_split']['main']
def load_pred(q, N, fs, method, params, window=None, update='daily', halflife=None, win='main'):
    k = f"{q}|N{N}|{fs}|{method}|{json.dumps(params, sort_keys=True)}|w{window}|{update}|h{halflife}|{win}"
    return pd.read_parquet(os.path.join(OUT, 'preds', k.replace('|', '_').replace(' ', '').replace('/', '') + '.parquet'))
md = []; P = md.append

def band_sig(h1, base, step=0.05, alpha=0.05):
    """(i) 帯ごとの実現率が基準値と二項検定で有意に異なる帯の外側を「寄りあり」。基準側から連続して非有意な帯を中立とみなす。
    戻り値: (lower_edge, upper_edge) = 中立帯 [lo, hi)。"""
    lo = np.floor(h1.p / step + 1e-9) * step
    t = h1.assign(band=lo).groupby('band').agg(n=('y', 'size'), k=('y', 'sum')).reset_index()
    t['sig'] = [binomtest(int(k), int(n), base).pvalue < alpha if n >= 10 else False for n, k in zip(t.n, t.k)]
    t['dir'] = np.sign(t.k / t.n - base)
    bb = np.floor(base / step + 1e-9) * step
    hi = bb + step
    for b in sorted(t.band[t.band > bb]):
        r = t[t.band == b].iloc[0]
        if r.sig and r.dir > 0: break
        hi = b + step
    lo_e = bb
    for b in sorted(t.band[t.band < bb], reverse=True):
        r = t[t.band == b].iloc[0]
        if r.sig and r.dir < 0: break
        lo_e = b
    return lo_e, hi

def summarize(h2, lo, hi, base):
    up = h2.p >= hi; dn = h2.p < lo; mid = ~(up | dn)
    def rr(s): return (int(s.sum()), float(h2.y[s].mean()) if s.sum() else float('nan'))
    return {'中立の割合': float(mid.mean()), '上寄り n': rr(up)[0], '上寄り 実現率': rr(up)[1], '下寄り n': rr(dn)[0], '下寄り 実現率': rr(dn)[1],
            '中立 実現率': rr(mid)[1], '後半の実現率(全体)': float(h2.y.mean()), '後半の基準値(M0)': base}

for q, cands in [('Q-DIR', [('B', {'alpha': 20}, None)]), ('Q-VOL', [('B', {'alpha': 20}, None), ('C', {'alpha': 20}, 40)]), ('Q-MKT', [('B', {'alpha': 20}, None), ('A', {'kappa': 50}, None)])]:
    p0 = load_pred(q, 60, 'fixed', 'M0', {})
    for meth, params, h in cands:
        pr = load_pred(q, 60, 'fixed', meth, params, halflife=h).merge(p0[['idx', 'p']].rename(columns={'p': 'p0'}), on='idx')
        h1 = pr[pr.date < SPLIT]; h2 = pr[pr.date >= SPLIT]
        base1 = float(h1.p0.mean()); base2 = float(h2.p0.mean())
        # 前半の帯を「予測確率 − 基準値」で正規化して定義（基準値が日々動くため、差分で帯を持つ）
        d1 = h1.assign(p=h1.p - h1.p0 + 0.5); d2 = h2.assign(p=h2.p - h2.p0 + 0.5)
        step = 0.10 if q == 'Q-MKT' else 0.05
        lab = f"{meth} {json.dumps(params)}" + (f" h={h}" if h else '')
        P(f'### {q} / {lab}（前半で帯を決め、後半で評価。帯は「確率 − 基準値」で定義）'); P('')
        rows = []
        # (i) 有意差ベース: 実現率を基準値との差で見るため、y も基準差に揃えて検定する代わりに、前半の基準値を用いる
        lo, hi = band_sig(d1.assign(y=d1.y), base1 + 0.0, step)  # d1.p は 0.5 中心なので基準値 0.5 相当で検定
        lo, hi = band_sig(d1, 0.5, step)
        rows.append({'方式': f'(i) 有意差帯（前半、二項検定 5%、{int(step*100)}pt 刻み）', '中立帯(基準差)': f'[{(lo-0.5)*100:+.0f}pt, {(hi-0.5)*100:+.0f}pt)', **summarize(d2, lo, hi, base2)})
        for w in ([0.05, 0.10] if q != 'Q-MKT' else [0.10, 0.20]):
            rows.append({'方式': f'(ii) 固定 ±{int(w*100)}pt', '中立帯(基準差)': f'[{-w*100:+.0f}pt, {w*100:+.0f}pt)', **summarize(d2, 0.5 - w, 0.5 + w, base2)})
        for x in [0.10, 0.20]:
            lo_q, hi_q = np.quantile(d1.p, x), np.quantile(d1.p, 1 - x)
            rows.append({'方式': f'(iii) 前半の分位 上下 {int(x*100)}%', '中立帯(基準差)': f'[{(lo_q-0.5)*100:+.1f}pt, {(hi_q-0.5)*100:+.1f}pt)', **summarize(d2, lo_q, hi_q, base2)})
        T = pd.DataFrame(rows)
        cols = ['方式', '中立帯(基準差)', '中立の割合', '上寄り n', '上寄り 実現率', '下寄り n', '下寄り 実現率', '中立 実現率', '後半の実現率(全体)', '後半の基準値(M0)']
        P('| ' + ' | '.join(cols) + ' |'); P('|' + '---|' * len(cols))
        for _, r in T.iterrows():
            P('| ' + ' | '.join((f'{r[c]:.3f}' if isinstance(r[c], float) else str(r[c])) for c in cols) + ' |')
        P('')
open(os.path.join(OUT, 'neutral.md'), 'w').write('\n'.join(md)); print('\n'.join(md))
