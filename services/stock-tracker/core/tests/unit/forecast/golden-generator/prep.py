"""前処理: 除外・翌営業日・ターゲット・判断軸 (特徴量) の算出。

golden.py が DATA / OUT を差し替えて main() を呼ぶ。
出力: OUT/panel.parquet (銘柄×日), OUT/mkt.parquet (市場×日), OUT/prep_summary.json
"""
import json, sys, os
import numpy as np, pandas as pd

# golden.py が実行時に差し替える
DATA = None
OUT = None

BUY = ['ascending-triangle','bull-flag','bullish-engulfing','harami-cross-buy','inverse-head-and-shoulders',
       'morning-star','rising-double-bottom','rising-three-methods','three-gaps-hammering','three-white-soldiers','tweezer-bottom']
SELL = ['bear-flag','bearish-engulfing','bearish-full-engulfing','bearish-harami','bullish-harami-top','doji-star','double-top',
        'evening-star','falling-three-methods','hanging-man','head-and-shoulders','red-three-soldiers-hesitation','rising-wedge',
        'shooting-star','three-black-crows-gaps','three-black-crows']
# signalType の分類は BUY=11 / SELL=16 (tweezer-bottom は BUY)。
HOLIDAY_COPIES = {
    'JP': ['2026-03-20','2026-04-29','2026-05-04','2026-05-05','2026-05-06','2026-07-20','2026-08-11','2026-09-21','2026-09-22','2026-09-23'],
    'US': ['2026-04-03','2026-05-25','2026-06-19','2026-07-03','2026-09-07'],
}
TZ = {'JP': 'Asia/Tokyo', 'US': 'America/New_York'}
OPEN = {'JP': '09:00', 'US': '09:30'}
CLOSE = {'JP': '15:30', 'US': '16:00'}
NS = [20, 60]
MINP = {20: 20, 60: 60}  # 平常算出の最小観測数（フル N を要求）

def main():
    df = pd.read_parquet(DATA)
    summ = {}
    df['mkt'] = np.where(df.ex == 'TSE', 'JP', 'US')
    df = df.sort_values(['ticker', 'date']).reset_index(drop=True)
    summ['rows_raw'] = len(df)
    pcols = [c for c in df.columns if c.startswith('p:')]
    assert len(pcols) == 27 and set(c[2:] for c in pcols) == set(BUY + SELL)

    # --- 除外1: 休場日コピー足 + 前レコードと OHLC 完全一致
    hol = df.apply(lambda r: r.date in HOLIDAY_COPIES[r.mkt], axis=1)
    prev = df.groupby('ticker')[['open','high','low','close']].shift(1)
    same = (df[['open','high','low','close']].values == prev.values).all(axis=1)
    summ['excl1_holiday'] = int(hol.sum()); summ['excl1_same_ohlc_extra'] = int((same & ~hol).sum())
    df = df[~(hol | same)].copy()

    # 市場カレンダー（除外1後の観測日付）と bday ベースの翌営業日
    cal = {m: np.array(sorted(df[df.mkt == m].date.unique())) for m in ['JP', 'US']}
    def next_bday(m, d):
        rng = pd.bdate_range(pd.Timestamp(str(d)) + pd.Timedelta(days=1), periods=10)
        for x in rng:
            if x.strftime('%Y-%m-%d') not in HOLIDAY_COPIES[m]:
                return x.strftime('%Y-%m-%d')
    # 観測カレンダーの検算
    mism = {m: [(a, next_bday(m, a), b) for a, b in zip(cal[m][:-1], cal[m][1:]) if next_bday(m, a) != b] for m in cal}
    summ['calendar_mismatch'] = {m: v for m, v in mism.items()}
    summ['calendar_days'] = {m: int(len(cal[m])) for m in cal}

    # --- 除外2: 途中足（CreatedAt が翌営業日の寄付き以降）
    df['created_dt'] = pd.to_datetime(df.created, unit='ms', utc=True)
    def session_open_next(r):
        nb = next_bday(r.mkt, r.date)
        return pd.Timestamp(f'{nb} {OPEN[r.mkt]}', tz=TZ[r.mkt]).tz_convert('UTC')
    nxt_open = df.apply(session_open_next, axis=1)
    mid = df.created_dt >= nxt_open
    summ['excl2_midsession'] = int(mid.sum())
    df = df[~mid].copy()
    summ['rows_after_excl'] = len(df)

    # --- 翌営業日レコード（同一銘柄の次レコード）とカレンダー整合
    df = df.sort_values(['ticker', 'date']).reset_index(drop=True)
    g = df.groupby('ticker')
    df['next_date'] = g.date.shift(-1)
    df['cal_next'] = df.apply(lambda r: next_bday(r.mkt, r.date), axis=1)
    df['next_ok'] = df.next_date == df.cal_next
    summ['next_record_not_calendar_next'] = int(((~df.next_ok) & df.next_date.notna()).sum())
    summ['last_record_no_next'] = int(df.next_date.isna().sum())
    for c in ['open', 'high', 'low', 'close']:
        df[f'n_{c}'] = g[c].shift(-1)
    # ラベル確定時刻（翌営業日の引け）UTC
    df['label_time'] = [pd.Timestamp(f'{d} {CLOSE[m]}', tz=TZ[m]).tz_convert('UTC') if isinstance(d, str) else pd.NaT
                        for d, m in zip(df.next_date, df.mkt)]
    df['pred_time'] = [pd.Timestamp(f'{d} {CLOSE[m]}', tz=TZ[m]).tz_convert('UTC') for d, m in zip(df.date, df.mkt)]

    # --- ターゲット
    df['ret1'] = np.where(df.next_ok, df.n_close / df.close - 1, np.nan)
    summ['excl3_abs_ret_gt20'] = int((df.ret1.abs() > 0.20).sum())
    df.loc[df.ret1.abs() > 0.20, 'ret1'] = np.nan
    df['mkt_ret1'] = df.groupby(['mkt', 'date']).ret1.transform('mean')
    df['n_valid_mkt'] = df.groupby(['mkt', 'date']).ret1.transform('count')
    df['excess'] = df.ret1 - df.mkt_ret1
    df['y_dir'] = np.where(df.excess.notna(), (df.excess > 0).astype(float), np.nan)

    # 値幅系列: r_s = (H_s - L_s) / C_{s-1}（翌日値幅を当日終値比で見る定義に揃える）
    df['prev_close'] = g.close.shift(1)
    df['rng'] = (df.high - df.low) / df.prev_close
    df['rng_next'] = np.where(df.next_ok, (df.n_high - df.n_low) / df.close, np.nan)
    df.loc[df.ret1.isna(), 'rng_next'] = np.nan  # 分割またぎ等は値幅ターゲットも除外
    df['lhl2'] = np.log(df.high / df.low) ** 2
    df['park5'] = np.sqrt(g.lhl2.transform(lambda s: s.rolling(5, min_periods=5).mean()) / (4 * np.log(2)))
    df['vol'] = df.volume
    # 異常値: 0 以下の値幅・出来高
    df.loc[df.rng <= 0, 'rng'] = np.nan
    df.loc[df.vol <= 0, 'vol'] = np.nan

    for N in NS:
        mp = MINP[N]
        roll = lambda s: s.rolling(N, min_periods=mp).mean()
        df[f'nrng{N}'] = g.rng.transform(roll)
        df[f'nrng{N}_med'] = g.rng.transform(lambda s: s.rolling(N, min_periods=mp).median())
        df[f'npark{N}'] = np.sqrt(g.lhl2.transform(roll) / (4 * np.log(2)))
        df[f'nvol{N}'] = g.vol.transform(roll)
        # ターゲット Q-VOL
        df[f'y_vol{N}'] = np.where(df.rng_next.notna() & df[f'nrng{N}'].notna(), (df.rng_next > df[f'nrng{N}']).astype(float), np.nan)
        df[f'y_vol{N}_med'] = np.where(df.rng_next.notna() & df[f'nrng{N}_med'].notna(), (df.rng_next > df[f'nrng{N}_med']).astype(float), np.nan)
        # 大きさ軸（水準除去・対数）
        df[f'f_lpark{N}'] = np.log(df.park5 / df[f'npark{N}'])
        df[f'f_lrng{N}'] = np.log(df.rng / df[f'nrng{N}'])
        df[f'f_lvol{N}'] = np.log(df.vol / df[f'nvol{N}'])
        # 市場平均（同日・同市場）
        for f in ['lpark', 'lrng', 'lvol']:
            df[f'f_m{f}{N}'] = df.groupby(['mkt', 'date'])[f'f_{f}{N}'].transform('mean')

    # --- パターン軸
    ins = 0; nan_p = 0
    for c in pcols:
        ins += int((df[c] == 'INSUFFICIENT_DATA').sum()); nan_p += int(df[c].isna().sum())
        df['x:' + c[2:]] = (df[c] == 'MATCHED').astype(float)
    summ['pattern_insufficient_cells'] = ins; summ['pattern_nan_cells'] = nan_p
    df['x:buy_cnt'] = df[['x:' + p for p in BUY]].sum(axis=1)
    df['x:sell_cnt'] = df[['x:' + p for p in SELL]].sum(axis=1)
    df['x:buy_ge2'] = (df['x:buy_cnt'] >= 2).astype(float)
    df['x:sell_ge2'] = (df['x:sell_cnt'] >= 2).astype(float)
    summ['pattern_match_counts'] = {c[2:]: int(df['x:' + c[2:]].sum()) for c in pcols}
    summ['buy_ge2'] = int(df['x:buy_ge2'].sum()); summ['sell_ge2'] = int(df['x:sell_ge2'].sum())

    # --- 市場×日パネル（Q-MKT）
    rows = []
    for (m, d), gg in df.groupby(['mkt', 'date']):
        rows.append({'mkt': m, 'date': d, 'n': len(gg), 'R': gg.rng.mean(), 'Rn': gg.rng_next.mean(),
                     'mpark5': gg.park5.mean(), 'mret': gg.ret1.mean(), 'disp': gg.ret1.std(),
                     **{f'f_m{f}{N}': gg[f'f_m{f}{N}'].iloc[0] for N in NS for f in ['lpark', 'lrng', 'lvol']}})
    mk = pd.DataFrame(rows).sort_values(['mkt', 'date']).reset_index(drop=True)
    gm = mk.groupby('mkt')
    mk['next_date'] = gm.date.shift(-1)
    mk['cal_next'] = [next_bday(m, d) for m, d in zip(mk.mkt, mk.date)]
    mk['next_ok'] = mk.next_date == mk.cal_next
    mk['Rn'] = np.where(mk.next_ok, mk.Rn, np.nan)
    for N in NS:
        mk[f'nR{N}'] = gm.R.transform(lambda s: s.rolling(N, min_periods=MINP[N]).mean())
        mk[f'y_mkt{N}'] = np.where(mk.Rn.notna() & mk[f'nR{N}'].notna(), (mk.Rn > mk[f'nR{N}']).astype(float), np.nan)
        mk[f'f_mlR{N}'] = np.log(mk.R / mk[f'nR{N}'])  # 市場平均値幅の水準除去版
    mk['label_time'] = [pd.Timestamp(f'{d} {CLOSE[m]}', tz=TZ[m]).tz_convert('UTC') if isinstance(d, str) else pd.NaT for d, m in zip(mk.next_date, mk.mkt)]
    mk['pred_time'] = [pd.Timestamp(f'{d} {CLOSE[m]}', tz=TZ[m]).tz_convert('UTC') for d, m in zip(mk.date, mk.mkt)]

    summ['base_rates_all'] = {
        'y_dir': float(df.y_dir.mean()),
        **{f'y_vol{N}': float(df[f'y_vol{N}'].mean()) for N in NS},
        **{f'y_vol{N}_med': float(df[f'y_vol{N}_med'].mean()) for N in NS},
        **{f'y_mkt{N}': float(mk[f'y_mkt{N}'].mean()) for N in NS},
    }
    summ['n_targets'] = {'y_dir': int(df.y_dir.notna().sum()), **{f'y_vol{N}': int(df[f'y_vol{N}'].notna().sum()) for N in NS},
                         **{f'y_mkt{N}': int(mk[f'y_mkt{N}'].notna().sum()) for N in NS}}
    summ['missing_volume_after_excl'] = int(df.vol.isna().sum())

    keep = ['ticker', 'ex', 'mkt', 'date', 'next_date', 'next_ok', 'pred_time', 'label_time', 'close', 'ret1', 'mkt_ret1', 'excess',
            'rng', 'rng_next', 'park5', 'y_dir'] + [c for c in df.columns if c.startswith(('y_vol', 'f_', 'x:', 'nrng', 'npark', 'nvol'))]
    df[keep].to_parquet(os.path.join(OUT, 'panel.parquet'))
    mk.to_parquet(os.path.join(OUT, 'mkt.parquet'))
    json.dump(summ, open(os.path.join(OUT, 'prep_summary.json'), 'w'), ensure_ascii=False, indent=1, default=str)
    print(json.dumps(summ, ensure_ascii=False, indent=1, default=str))

if __name__ == '__main__':
    main()
