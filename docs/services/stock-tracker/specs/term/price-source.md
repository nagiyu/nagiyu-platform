---
sources:
  - services/stock-tracker/core/src/entities/exchange.entity.ts
  - services/stock-tracker/core/src/services/market-data/router.ts
  - services/stock-tracker/core/src/services/market-data/finnhub-quote-provider.ts
  - services/stock-tracker/core/src/services/market-data/tradingview-quote-provider.ts
sources_hash: abcc7adaef5e4a12426b5bbea7da720f6f4634d64a61bdf1bfd40c3c448da707
---

# 価格の取得元

アラートの判定に使う現在価格を、どこから取るか。取引所ごとの設定 `priceSource` で決まる。

## 説明

| 値 | 取得元 | 取り方 |
|---|---|---|
| `tradingview` (省略時) | TradingView | WebSocket で現在値を取る |
| `finnhub` | Finnhub | REST の現在値 (`/quote`) を 1 回呼ぶ。API キーは環境変数から読む |

- 値が `finnhub` のときだけ Finnhub を使い、それ以外 (未設定・未知の値) は TradingView になる
- Finnhub は次の場合に失敗する: API キーがない、ティッカー ID に `:` がない、HTTP 429、HTTP エラー、現在値が 0 以下 (未知のシンボル)、タイムアウト。タイムアウトの既定は 4 秒
- この設定が決めるのは現在価格だけ。日足 (サマリー・チャート) は取引所によらず TradingView から取る
- 設定は取引所のデータで、[取引所 API](../api/exchanges.md)で切り替える。[分次バッチ](../batch/minute.md)と[時間次バッチ](../batch/hourly.md)が、取引所の設定に従って現在価格を取り、[アラート通知の経路](../flow/alert-notification.md)に流す

## 理由

### TradingView を使う

- `@mathieuc/tradingview` を通じて TradingView を使う。WebSocket 接続で現在値を取れ、ポーリングが要らない
- 複数のタイムフレームと多数の取引所・ティッカーに対応する
- 非公式のパッケージなので、API の仕様が変わるリスクがある

### US を Finnhub、東証を TradingView にする

- 分次バッチで TradingView のタイムアウトが頻発した。CloudWatch Logs の実測で、タイムアウトの 100% が US 銘柄 (NASDAQ・NYSE・AMEX) に集中し、東証はほぼ 0 だった。原因は、非公式ライブラリの匿名 (ゲスト) WebSocket 接続がスロットリングされ、共有接続が沈黙死することで、ゲストの優先度は US のリアルタイムデータほど厳しく絞られる。共有セッション、並列度の抑制、jitter、時間予算、新しい接続での再試行、コンテナの強制終了といった延命策を重ねても、根治しなかった
- 東証には、無料の代替データソースが実質ない。J-Quants の無料枠は 12 週間遅れで、Yahoo や stooq は非公式でサーバーからの自動アクセスが難しく、証券会社系は Windows アプリの常駐や TSE の有料契約が要る。一方 US は、無料の正規株価 API が潤沢にある。そこで、タイムアウトが集中する US を正規 API の Finnhub (無料の `/quote`、REST・リアルタイム) に移し、代替のない東証を比較的安定している TradingView に残す
- 日足 (サマリー・チャート) は TradingView のまま移さない。サマリーは毎時、チャートはオンデマンドで、分次のような新しい接続のバーストを作らず、タイムアウトの原因ではない。Finnhub の無料枠は日足 (`/stock/candle`) を有料専用にしており、提供できない
- 取引所と取得元の対応をコードに固定せず、取引所のデータの `priceSource` にする。取引所の追加と切り替えがコードのデプロイなしにでき、段階的に移せる。未設定や未知の値は TradingView に倒すので、切り替えるまで挙動は変わらない
- Finnhub の API キーは、デプロイ時に環境変数へ入れる。キーを PLACEHOLDER で作る理由は[シークレット](../resource/secrets.md)にある
- TradingView の認証 (cookie、または ID とパスワードの保管) は採らない。非公式な利用であることは、匿名でも認証でも変わらない。アカウントの凍結、CAPTCHA、運用の負担のリスクがある
- dev で US の取引所を `finnhub` に切り替えたあと、分次バッチの US 銘柄が、エラー 0・新しい接続での再試行 0・タイムアウト 0 で処理されることを確かめた
