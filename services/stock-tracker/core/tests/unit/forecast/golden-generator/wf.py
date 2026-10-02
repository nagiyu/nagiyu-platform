"""ロジスティック回帰 (LR) と、ロジット変換・シグモイド。"""
import numpy as np

EPS = 1e-6
def logit(p): p = np.clip(p, EPS, 1 - EPS); return np.log(p / (1 - p))
def sigmoid(z): return 1 / (1 + np.exp(-z))

# ------------------------------------------------------------------ モデル
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
