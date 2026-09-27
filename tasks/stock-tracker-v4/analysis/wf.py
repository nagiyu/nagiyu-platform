"""ウォークフォワード比較の枠組み（方式 M0 / A / B / C / D、評価指標）。"""
import numpy as np, pandas as pd
from scipy.cluster.hierarchy import linkage, fcluster
from scipy.spatial.distance import squareform

EPS = 1e-6
def logit(p): p = np.clip(p, EPS, 1 - EPS); return np.log(p / (1 - p))
def sigmoid(z): return 1 / (1 + np.exp(-z))

# ------------------------------------------------------------------ 方式
class M0:
    name = 'M0'
    def fit(self, X, y, w, cols):
        self.p0 = float(np.average(y, weights=w)); return self
    def predict(self, X): return np.full(len(X), self.p0)
    def coefs(self): return {}

class NB:
    """A: 縮小付き対数オッズ加算。点灯型軸は点灯時的中率をベータ事前（p0 中心・強さ κ）で縮小。数値型は学習分位で 5 ビン化。"""
    name = 'A'
    def __init__(self, kappa=50, nbins=5): self.kappa = kappa; self.nbins = nbins
    def _indicators(self, X, fit=False):
        cols = []; names = []
        for j, c in enumerate(self.cols):
            x = X[:, j]
            if self.is_bin[j]:
                cols.append(x); names.append(c)
            else:
                if fit: self.edges[j] = np.quantile(x, np.linspace(0, 1, self.nbins + 1)[1:-1])
                b = np.searchsorted(self.edges[j], x, side='right')
                for k in range(self.nbins):
                    cols.append((b == k).astype(float)); names.append(f'{c}@q{k+1}')
        return np.column_stack(cols), names
    def fit(self, X, y, w, cols):
        self.cols = cols; self.is_bin = [set(np.unique(X[:, j])) <= {0.0, 1.0} for j in range(X.shape[1])]
        self.edges = {}
        Z, self.names = self._indicators(X, fit=True)
        self.p0 = float(np.average(y, weights=w))
        n1 = (Z * w[:, None]).sum(0); k1 = (Z * (w * y)[:, None]).sum(0)
        p1 = (k1 + self.kappa * self.p0) / (n1 + self.kappa)
        self.contrib = np.where(n1 > 0, logit(p1) - logit(self.p0), 0.0)
        self.n1 = n1; self.p1 = p1
        return self
    def predict(self, X):
        Z, _ = self._indicators(X)
        return sigmoid(logit(self.p0) + Z @ self.contrib)
    def coefs(self): return dict(zip(self.names, self.contrib))

class LR:
    """B/C: L2 正則化ロジスティック回帰（Newton 法、自前実装）。alpha は総和損失スケールの L2 係数（切片は非正則化）。
    数値型は学習データの平均・分散で標準化、点灯型は 0/1 のまま。"""
    name = 'B'
    def __init__(self, alpha=20.0, max_iter=50, fit_intercept=True): self.alpha = alpha; self.max_iter = max_iter; self.fit_intercept = fit_intercept
    def _design(self, X):
        Z = X.copy(); Z[:, self.num] = (Z[:, self.num] - self.mu) / self.sd
        return np.column_stack([np.ones(len(Z)), Z])
    def fit(self, X, y, w, cols, offset=None):
        self.cols = cols
        self.num = np.array([not (set(np.unique(X[:, j])) <= {0.0, 1.0}) for j in range(X.shape[1])])
        self.mu = X[:, self.num].mean(0); self.sd = X[:, self.num].std(0); self.sd[self.sd == 0] = 1
        Z = self._design(X); p = Z.shape[1]
        off = np.zeros(len(y)) if offset is None else offset
        reg = np.full(p, self.alpha); reg[0] = 0 if self.fit_intercept else 1e12  # 切片なし = 極大罰則で 0 に固定
        beta = np.zeros(p); beta[0] = (logit(np.average(y, weights=w)) - off.mean()) if self.fit_intercept else 0.0
        for _ in range(self.max_iter):
            eta = off + Z @ beta; mu = sigmoid(eta)
            g = Z.T @ (w * (mu - y)) + reg * beta
            W = w * mu * (1 - mu)
            H = (Z * W[:, None]).T @ Z + np.diag(reg)
            step = np.linalg.solve(H, g)
            beta -= step
            if np.abs(step).max() < 1e-8: break
        self.beta = beta; return self
    def predict(self, X, offset=None): return sigmoid((0 if offset is None else offset) + self._design(X) @ self.beta)
    def coefs(self): return dict(zip(['(intercept)'] + list(self.cols), self.beta))

class LRCV(LR):
    """B-cv: 学習窓内の末尾 val_days 営業日分を検証に使い alpha を選ぶ（選択もウォークフォワード内で完結）。"""
    name = 'Bcv'
    def __init__(self, alphas=(5, 20, 80), val_frac=0.25): self.alphas = alphas; self.val_frac = val_frac; self.max_iter = 50
    def fit(self, X, y, w, cols, dates=None):
        if dates is not None and len(np.unique(dates)) > 10:
            ud = np.sort(np.unique(dates)); cut = ud[int(len(ud) * (1 - self.val_frac))]
            tr = dates < cut; va = ~tr
            best = None
            for a in self.alphas:
                m = LR(a).fit(X[tr], y[tr], w[tr], cols); pv = np.clip(m.predict(X[va]), EPS, 1 - EPS)
                ll = -np.average(y[va] * np.log(pv) + (1 - y[va]) * np.log(1 - pv), weights=w[va])
                if best is None or ll < best[0]: best = (ll, a)
            self.alpha = best[1]
        else:
            self.alpha = self.alphas[1]
        return LR.fit(self, X, y, w, cols)

class Cluster:
    """D: 学習データの相関でクラスタ化（平均連結、距離 1-corr、閾値 1-rho）→ クラスタ代表値 → A と同じ縮小付き加算。"""
    name = 'D'
    def __init__(self, rho=0.5, kappa=50): self.rho = rho; self.kappa = kappa
    def _reps(self, X):
        Z = (X - self.mu) / self.sd
        out = []
        for members in self.clusters:
            if len(members) == 1: out.append(X[:, members[0]])
            elif all(self.is_bin[j] for j in members): out.append(X[:, members].max(1))  # いずれか点灯
            else: out.append(Z[:, members].mean(1))
        return np.column_stack(out)
    def fit(self, X, y, w, cols):
        self.cols = cols; self.is_bin = [set(np.unique(X[:, j])) <= {0.0, 1.0} for j in range(X.shape[1])]
        self.mu = X.mean(0); self.sd = X.std(0); self.sd[self.sd == 0] = 1
        var = X.std(0) > 0
        C = np.corrcoef(X[:, var].T) if var.sum() > 1 else np.ones((1, 1)); C = np.nan_to_num(C)
        D = np.clip(1 - C, 0, 2); np.fill_diagonal(D, 0)
        idx = np.where(var)[0]
        if len(idx) > 1:
            lab = fcluster(linkage(squareform(D, checks=False), 'average'), 1 - self.rho, 'distance')
        else: lab = np.ones(len(idx), int)
        self.clusters = [list(idx[lab == l]) for l in np.unique(lab)]
        self.names = ['+'.join(cols[j] for j in m) for m in self.clusters]
        R = self._reps(X)
        self.inner = NB(self.kappa).fit(R, y, w, self.names)
        return self
    def predict(self, X): return self.inner.predict(self._reps(X))
    def coefs(self): return self.inner.coefs()

# ------------------------------------------------------------------ ウォークフォワード
def walk_forward(panel, cols, ycol, oos_dates_by_mkt, cal, model_factory, window=None, update='daily', halflife=None,
                 save_coefs=False, offset_col=None):
    """panel: DataFrame（mkt, date, pred_time, label_time, cols, ycol）。
    予測日 t（市場 m）で使う学習サンプル: label_time <= pred_time(t,m) かつ（窓内）かつ y・特徴量が有効。
    戻り値: 予測 DataFrame（date, mkt, y, p）と係数の時系列。"""
    need = cols + [ycol] + ([offset_col] if offset_col else [])
    ok = panel[need].notna().all(axis=1)
    P = panel[ok].copy()
    X_all = P[cols].to_numpy(float); y_all = P[ycol].to_numpy(float)
    off_all = P[offset_col].to_numpy(float) if offset_col else None
    dates_all = P.date.to_numpy(); lab_t = P.label_time.to_numpy(); mkts_all = P.mkt.to_numpy()
    preds = []; coef_rows = []
    for m in ['JP', 'US']:
        cal_m = cal[m]; model = None; last_week = None
        pred_time_m = dict(zip(P[P.mkt == m].date, P[P.mkt == m].pred_time))
        for t in oos_dates_by_mkt[m]:
            te = (mkts_all == m) & (dates_all == t)
            if te.sum() == 0: continue
            wk = pd.Timestamp(str(t)).isocalendar()[1]
            if model is None or update == 'daily' or wk != last_week:
                pt = pred_time_m[t]
                tr = lab_t <= pt
                ti = int(np.searchsorted(cal_m, t))
                if window is not None:
                    tr &= dates_all >= cal_m[max(0, ti - window)]
                Xtr, ytr = X_all[tr], y_all[tr]
                if halflife is not None:
                    idx = np.searchsorted(cal_m, dates_all[tr])  # 予測市場の営業日インデックスに写像
                    w = 0.5 ** ((ti - idx) / halflife)
                else: w = np.ones(len(ytr))
                model = model_factory()
                if isinstance(model, LRCV): model.fit(Xtr, ytr, w, cols, dates=dates_all[tr])
                elif off_all is not None: model.fit(Xtr, ytr, w, cols, offset=off_all[tr])
                else: model.fit(Xtr, ytr, w, cols)
                last_week = wk; ntr = int(tr.sum())
                if save_coefs: coef_rows.append({'mkt': m, 'date': t, 'ntr': ntr, **model.coefs()})
            p = model.predict(X_all[te], offset=off_all[te]) if off_all is not None else model.predict(X_all[te])
            preds.append(pd.DataFrame({'date': t, 'mkt': m, 'idx': P.index[te], 'y': y_all[te], 'p': p, 'ntr': ntr,
                                       **({'off': off_all[te]} if off_all is not None else {})}))
    out = pd.concat(preds, ignore_index=True)
    return out, (pd.DataFrame(coef_rows) if save_coefs else None)

# ------------------------------------------------------------------ 指標
def logloss(y, p): p = np.clip(p, EPS, 1 - EPS); return float(-np.mean(y * np.log(p) + (1 - y) * np.log(1 - p)))
def brier(y, p): return float(np.mean((p - y) ** 2))
def auc(y, p):
    from sklearn.metrics import roc_auc_score
    return float(roc_auc_score(y, p)) if len(np.unique(y)) == 2 and np.std(p) > 0 else float('nan')
def ece(y, p, nb=10):
    b = np.clip((p * nb).astype(int), 0, nb - 1); e = 0
    for k in range(nb):
        s = b == k
        if s.any(): e += s.mean() * abs(y[s].mean() - p[s].mean())
    return float(e)

def block_boot_delta_ll(y, p, p0, dates, reps=1000, seed=0):
    """日付ブロック・ブートストラップで ΔLL = LL(p0) - LL(p)（正なら改善）の 90% CI。"""
    rng = np.random.default_rng(seed)
    ud = np.unique(dates); groups = {d: np.where(dates == d)[0] for d in ud}
    pc = np.clip(p, EPS, 1 - EPS); p0c = np.clip(p0, EPS, 1 - EPS)
    l1 = -(y * np.log(pc) + (1 - y) * np.log(1 - pc)); l0 = -(y * np.log(p0c) + (1 - y) * np.log(1 - p0c))
    per_day = np.array([[l0[g].sum() - l1[g].sum(), len(g)] for g in groups.values()])
    stats = []
    for _ in range(reps):
        s = rng.integers(0, len(ud), len(ud)); stats.append(per_day[s, 0].sum() / per_day[s, 1].sum())
    return float(np.percentile(stats, 5)), float(np.percentile(stats, 95))

def evaluate(pred, pred0, half_split_date):
    """pred/pred0: walk_forward の出力（同じ idx 順に揃える）。"""
    d = pred.merge(pred0[['idx', 'p']].rename(columns={'p': 'p0'}), on='idx')
    res = {}
    for scope, s in [('ALL', np.ones(len(d), bool)), ('JP', (d.mkt == 'JP').values), ('US', (d.mkt == 'US').values),
                     ('H1', (d.date < half_split_date).values), ('H2', (d.date >= half_split_date).values)]:
        y, p, p0 = d.y.values[s], d.p.values[s], d.p0.values[s]
        if len(y) == 0: continue
        r = {'n': int(len(y)), 'll': logloss(y, p), 'll0': logloss(y, p0), 'dll': logloss(y, p0) - logloss(y, p),
             'brier': brier(y, p), 'bss': 1 - brier(y, p) / brier(y, p0), 'auc': auc(y, p), 'ece': ece(y, p),
             'base': float(np.mean(p0)), 'p_q05': float(np.quantile(p, .05)), 'p_q50': float(np.quantile(p, .5)),
             'p_q95': float(np.quantile(p, .95)), 'share_far5': float(np.mean(np.abs(p - p0) >= 0.05)),
             'share_far10': float(np.mean(np.abs(p - p0) >= 0.10))}
        if scope in ('ALL',):
            r['dll_ci90'] = block_boot_delta_ll(y, p, p0, d.date.values[s])
        res[scope] = r
    return res, d

def calib_table(d, step=0.05):
    lo = np.floor(d.p / step) * step
    t = d.assign(band=lo).groupby('band').agg(n=('y', 'size'), p_mean=('p', 'mean'), realized=('y', 'mean')).reset_index()
    return t
