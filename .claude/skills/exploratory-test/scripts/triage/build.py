"""data.py から起票トリアージのページ (triage.html) を生成する。

人に 1 件ずつ起票の判断を仰ぐための一覧ページを作る。左に検討中の候補 1 件 (提案・再現手順・原因・証拠)、
右に全候補のキューと進捗を出す。判断が進むたびに data.py を更新して作り直し、同じページを更新して見せる。

使い方:
    cp -r <このディレクトリ> <セッションの一時ディレクトリ>/triage    # リポジトリを汚さないよう、作業は一時ディレクトリで行う
    python3 <一時ディレクトリ>/triage/build.py                          # 隣の data.py と img/ を読み、隣に triage.html を書く
    python3 build.py <作業ディレクトリ>                                 # data.py / img/ / 出力先を別のディレクトリにするとき

data.py の形 (雛形を参照):
    CURRENT     検討中の候補の id
    CANDIDATES  (id, サービス名の配列, 重要度 "高"/"中"/"低", 種別, 要約) の配列。人に見せる順に並べる
    STATUS      判断済みの候補: id -> ("filed", "#1234") / ("skipped", "理由") / ("merged", "統合先") / ("delegated", "理由")
    DETAILS     検討中の候補の詳細 (id -> 辞書)。CURRENT の分だけあればよい
証拠のスクリーンショットは img/ に PNG で置き、DETAILS の evidence に (ファイル名, キャプション) で書く。
"""
import base64, html, importlib.util, json, pathlib, re, sys

HERE = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else pathlib.Path(__file__).parent
spec = importlib.util.spec_from_file_location("data", HERE / "data.py")
data = importlib.util.module_from_spec(spec); spec.loader.exec_module(data)

def esc(s): return html.escape(s, quote=True)

def inline_code(s):
    # `code` をコード表示にする (エスケープ後に置換)
    return re.sub(r"`([^`]+)`", r"<code>\1</code>", esc(s))

def img_uri(name):
    b = (HERE / "img" / name).read_bytes()
    return "data:image/png;base64," + base64.b64encode(b).decode()

def note_html(st, note):
    # 起票済みの番号は GitHub の Issue へのリンクにする
    m = re.fullmatch(r"#(\d+)", note)
    if st == "filed" and m:
        return f'<a class="issue" href="https://github.com/nagiyu/nagiyu-platform/issues/{m.group(1)}" target="_blank" rel="noopener">{esc(note)}</a>'
    return esc(note)

STATUS_LABEL = {"todo": "未判断", "filed": "起票", "skipped": "見送り", "merged": "統合", "delegated": "別対応"}

def status_of(cid):
    if cid in data.STATUS: return data.STATUS[cid]
    return ("current", "") if cid == data.CURRENT else ("todo", "")

counts = {"filed": 0, "skipped": 0, "merged": 0, "todo": 0, "delegated": 0}
for c in data.CANDIDATES:
    st = status_of(c[0])[0]
    counts["todo" if st == "current" else st] += 1
total = len(data.CANDIDATES)
decided = total - counts["todo"]

# 現在の候補
cur = next(c for c in data.CANDIDATES if c[0] == data.CURRENT)
d = data.DETAILS[data.CURRENT]
idx = [c[0] for c in data.CANDIDATES].index(data.CURRENT) + 1
sev_cls = {"高": "high", "中": "mid", "低": "low"}

evidence = "".join(
    f'<figure><img src="{img_uri(f)}" alt="{esc(cap)}"><figcaption>{esc(cap)}</figcaption></figure>'
    for f, cap in d.get("evidence", [])
)
repro = "".join(f"<li>{inline_code(s)}</li>" for s in d["repro"])
labels = "".join(f'<span class="label">{esc(l)}</span>' for l in d["labels"])

current_html = f"""
<article class="current" aria-labelledby="cur-title">
  <div class="cur-meta">
    <span class="seq">候補 {idx} / {total}</span>
    <span class="sev {sev_cls.get(cur[2], 'low')}">重要度 {esc(cur[2])}</span>
    {''.join(f'<span class="svc">{esc(s)}</span>' for s in cur[1])}
  </div>
  <h2 id="cur-title">{esc(d['title'])}</h2>
  <p class="lead">{inline_code(d['what'])}</p>

  <section class="verdict">
    <div class="verdict-head"><span class="eyebrow">Claude の提案</span><strong>{esc(d['recommend'])}</strong></div>
    <p>{inline_code(d['why'])}</p>
    <div class="labels"><span class="eyebrow">ラベル案</span>{labels}</div>
  </section>

  <div class="grid">
    <section><h3>再現手順</h3><ol>{repro}</ol></section>
    <section><h3>原因</h3><p class="path"><code>{esc(d['cause'])}</code></p><p>{inline_code(d['cause_note'])}</p></section>
    <section><h3>影響範囲</h3><p>{inline_code(d['scope'])}</p></section>
    <section><h3>確認の状態</h3><p>{inline_code(d['verified'])}</p></section>
  </div>
  {f'<section class="evidence"><h3>証拠</h3>{evidence}</section>' if evidence else ''}
</article>
"""

# 一覧 (サービス別ではなく提示順。判断の順番そのものが情報なので)
rows = []
for i, (cid, svcs, sev, kind, summary) in enumerate(data.CANDIDATES, 1):
    st, note = status_of(cid)
    badge = "検討中" if st == "current" else STATUS_LABEL[st]
    rows.append(f"""<li class="row st-{st}"{' aria-current="true"' if st == 'current' else ''}>
  <span class="n">{i}</span>
  <span class="sevdot {sev_cls.get(sev, 'low')}" title="重要度 {esc(sev)}"></span>
  <span class="body"><span class="sum">{esc(summary)}</span>
    <span class="sub">{esc(kind)} · {esc(' / '.join(svcs))}{(' · ' + note_html(st, note)) if note else ''}</span></span>
  <span class="badge b-{st}">{badge}</span>
</li>""")

page = f"""<title>探索テストの起票トリアージ</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+JP:wght@400;500;700&family=IBM+Plex+Mono:wght@400;500&display=swap">
<style>
/* 左に検討中の候補 1 件を大きく、右に全候補のキュー。狭い画面では縦積み */
:root {{
  --bg: #f3f5f6; --surface: #ffffff; --ink: #18232b; --muted: #5b6a74; --line: #d9e0e4;
  --accent: #0e6b74; --accent-soft: #e2f0f1;
  --high: #c2362b; --mid: #b7791f; --low: #7a8892;
  --ok: #2f7d4b; --ok-soft: #e3f2e8; --skip-soft: #eceff1;
  --code-bg: #eef2f4;
  --f-body: "IBM Plex Sans JP", "Hiragino Sans", "Noto Sans JP", system-ui, sans-serif;
  --f-mono: "IBM Plex Mono", ui-monospace, "SFMono-Regular", Menlo, monospace;
}}
@media (prefers-color-scheme: dark) {{ :root:not([data-theme="light"]) {{
  --bg: #11171b; --surface: #182127; --ink: #e4eaed; --muted: #9aa8b1; --line: #2a363e;
  --accent: #5cc0c9; --accent-soft: #173538; --high: #ef7a70; --mid: #e3aa55; --low: #8d9ba4;
  --ok: #6cc28c; --ok-soft: #183a26; --skip-soft: #212b31; --code-bg: #212c33; color-scheme: dark; }} }}
:root[data-theme="dark"] {{
  --bg: #11171b; --surface: #182127; --ink: #e4eaed; --muted: #9aa8b1; --line: #2a363e;
  --accent: #5cc0c9; --accent-soft: #173538; --high: #ef7a70; --mid: #e3aa55; --low: #8d9ba4;
  --ok: #6cc28c; --ok-soft: #183a26; --skip-soft: #212b31; --code-bg: #212c33; color-scheme: dark; }}
* {{ box-sizing: border-box; }}
body {{ background: var(--bg); color: var(--ink); font-family: var(--f-body); font-size: 15px; line-height: 1.7; }}
.wrap {{ max-width: 1240px; margin: 0 auto; padding-inline: 20px; padding-block: 24px 48px; display: grid; gap: 20px; }}
header {{ display: flex; flex-wrap: wrap; align-items: end; justify-content: space-between; gap: 12px 24px; }}
h1 {{ font-size: 1.35rem; margin: 0; letter-spacing: .01em; text-wrap: balance; }}
header p {{ margin: 2px 0 0; color: var(--muted); font-size: .88rem; }}
.tally {{ display: flex; gap: 14px; font-size: .85rem; color: var(--muted); font-variant-numeric: tabular-nums; flex-wrap: wrap; }}
.tally b {{ color: var(--ink); font-size: 1.05rem; margin-right: 3px; }}
.bar {{ grid-column: 1 / -1; height: 6px; border-radius: 3px; background: var(--line); overflow: hidden; display: flex; }}
.bar i {{ display: block; height: 100%; }}
.layout {{ display: grid; grid-template-columns: minmax(0, 1fr) 360px; gap: 20px; align-items: start; }}
@media (max-width: 960px) {{ .layout {{ grid-template-columns: minmax(0, 1fr); }} }}
.current {{ background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 22px 24px; display: grid; gap: 16px; min-width: 0; }}
.cur-meta {{ display: flex; flex-wrap: wrap; gap: 8px; align-items: center; font-size: .8rem; }}
.seq {{ font-family: var(--f-mono); color: var(--muted); }}
.sev, .svc, .label {{ border-radius: 999px; padding: 1px 10px; font-size: .78rem; }}
.sev.high {{ color: var(--high); border: 1px solid var(--high); }}
.sev.mid {{ color: var(--mid); border: 1px solid var(--mid); }}
.sev.low {{ color: var(--low); border: 1px solid var(--low); }}
.svc {{ background: var(--code-bg); color: var(--ink); font-family: var(--f-mono); }}
h2 {{ margin: 0; font-size: 1.25rem; line-height: 1.45; text-wrap: balance; }}
.lead {{ margin: 0; }}
h3 {{ font-size: .78rem; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); margin: 0 0 4px; font-weight: 500; }}
.eyebrow {{ font-size: .75rem; letter-spacing: .08em; color: var(--muted); }}
.verdict {{ background: var(--accent-soft); border-radius: 8px; padding: 14px 16px; display: grid; gap: 8px; }}
.verdict p {{ margin: 0; }}
.verdict-head {{ display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap; }}
.verdict-head strong {{ color: var(--accent); font-size: 1.05rem; }}
.labels {{ display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }}
.label {{ background: var(--surface); border: 1px solid var(--line); font-family: var(--f-mono); }}
.grid {{ display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px 24px; }}
@media (max-width: 640px) {{ .grid {{ grid-template-columns: minmax(0, 1fr); }} }}
.grid section p, .grid ol {{ margin: 0; }}
.grid ol {{ padding-left: 1.3em; }}
.path {{ margin-bottom: 4px !important; overflow-wrap: anywhere; }}
code {{ font-family: var(--f-mono); font-size: .86em; background: var(--code-bg); padding: 1px 5px; border-radius: 4px; overflow-wrap: anywhere; }}
.evidence {{ display: grid; gap: 10px; }}
figure {{ margin: 0; display: grid; gap: 6px; }}
figure img {{ border: 1px solid var(--line); border-radius: 6px; background: #fff; }}
figcaption {{ font-size: .82rem; color: var(--muted); }}
aside {{ background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 14px 6px 8px; min-width: 0; }}
aside h2 {{ font-size: .85rem; padding: 0 12px 8px; color: var(--muted); font-weight: 500; }}
ol.queue {{ list-style: none; margin: 0; padding: 0; max-height: 78vh; overflow-y: auto; }}
.row {{ display: grid; grid-template-columns: 22px 8px minmax(0, 1fr) auto; gap: 8px; align-items: start; padding: 7px 10px; border-radius: 6px; font-size: .84rem; line-height: 1.5; }}
.row .n {{ font-family: var(--f-mono); color: var(--muted); text-align: right; font-variant-numeric: tabular-nums; }}
.sevdot {{ width: 8px; height: 8px; border-radius: 50%; margin-top: 7px; }}
.sevdot.high {{ background: var(--high); }} .sevdot.mid {{ background: var(--mid); }} .sevdot.low {{ background: var(--low); }}
.body {{ display: grid; }}
.sub {{ color: var(--muted); font-size: .76rem; }}
.badge {{ font-size: .72rem; border-radius: 4px; padding: 0 6px; white-space: nowrap; margin-top: 2px; }}
.b-todo {{ color: var(--muted); }}
.b-current {{ background: var(--accent); color: var(--surface); }}
.b-filed, .b-delegated {{ background: var(--ok-soft); color: var(--ok); }}
.b-skipped, .b-merged {{ background: var(--skip-soft); color: var(--muted); }}
.st-current {{ background: var(--accent-soft); }}
.issue {{ color: var(--accent); text-decoration: underline; text-underline-offset: 2px; }}
.st-skipped .sum, .st-merged .sum {{ text-decoration: line-through; color: var(--muted); }}
</style>
<div class="wrap">
  <header>
    <div>
      <h1>探索テストの起票トリアージ</h1>
      <p>ローカル探索で見つかった候補を 1 件ずつ判断する。判断はチャットで返す。</p>
    </div>
    <div class="tally">
      <span><b>{counts['filed'] + counts['delegated']}</b>起票・別対応</span>
      <span><b>{counts['skipped'] + counts['merged']}</b>見送り・統合</span>
      <span><b>{counts['todo']}</b>未判断</span>
    </div>
    <div class="bar" aria-hidden="true">
      <i style="width:{(counts['filed']+counts['delegated'])/total*100:.2f}%;background:var(--ok)"></i>
      <i style="width:{(counts['skipped']+counts['merged'])/total*100:.2f}%;background:var(--low)"></i>
    </div>
  </header>
  <div class="layout">
    {current_html}
    <aside aria-label="候補の一覧"><h2>候補 {total} 件 · 判断済み {decided}</h2><ol class="queue">{''.join(rows)}</ol></aside>
  </div>
</div>
"""
(HERE / "triage.html").write_text(page)
print("ok", len(page))
