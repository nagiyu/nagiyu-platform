---
id: niconico-mylist-assistant/screen/mylist-register
title: マイリスト登録画面
kind: screen
service: niconico-mylist-assistant
sources:
  - services/niconico-mylist-assistant/web/src/app/mylist/register/page.tsx
  - services/niconico-mylist-assistant/web/src/components/MylistRegisterForm.tsx
  - services/niconico-mylist-assistant/web/src/components/NiconicoSessionManager.tsx
  - services/niconico-mylist-assistant/web/src/lib/mylist-register-validation.ts
  - services/niconico-mylist-assistant/web/src/lib/constants/errors.ts
  - services/niconico-mylist-assistant/web/src/types/mylist.ts
sources_hash: 814fd47a6a8f21e5a66ceaf791e8fc9f0b1315e2611034e5d2b289c87676ed5b
terms: [niconico-mylist-assistant/term/user-session, niconico-mylist-assistant/term/video-setting, niconico-mylist-assistant/term/batch-job]
related_cards: [niconico-mylist-assistant/api/mylist-register, niconico-mylist-assistant/api/niconico-session, niconico-mylist-assistant/screen/job-status, niconico-mylist-assistant/flow/mylist-registration, niconico-mylist-assistant/flow/session-injection]
related_adr:
  - services/niconico-mylist-assistant/requirements.md#2.4 マイリスト登録の制約
  - services/niconico-mylist-assistant/architecture.md#2.13 認証方式：自動ログインから user_session 注入への移行
---

# マイリスト登録画面

登録の条件とマイリスト名を決めて、マイリストへの登録を依頼する画面。依頼にはニコニコの[セッション](../term/user-session.md)が要り、その保存と更新もこの画面の「セッション管理」で行う。

## 入口

- パスは `/mylist/register`。ヘッダーの「マイリスト登録」と、[ホーム画面](./home.md)の「マイリスト登録」から来る
- [ジョブの状態画面](./job-status.md)の「登録画面に戻る」からも来る

## 表示するもの

| 部分 | 内容 |
|---|---|
| ニコニコセッションの状態 | 「ニコニコセッション:」に続けて状態の札と、「セッション管理」ボタン |
| 登録条件 | 「登録する最大動画数」(数値、初期値 100、1〜100)、「お気に入りのみを対象にする」(初期値はオフ)、「スキップ動画を除外する」(初期値はオン) |
| 「マイリスト名」 | 必須。50 文字以内の入力欄 (ニコニコ動画に作る名前) |
| 「マイリストに登録」 | 登録を依頼する。セッションの状態によっては押せない |

セッションの札は、状態によって次のとおり。

| 札 | 条件 |
|---|---|
| 確認中... | 状態を取得している間 |
| 有効 (あと N 日) | 有効。残り日数は推定有効期限から数える ([user_session](../term/user-session.md)) |
| 無効 | 保存した値が無効 (復号できない場合も含む) |
| 判定不能 | ニコニコ側の状態を確かめられなかった |
| 未登録 | 保存したセッションがない |
| 取得失敗 | 状態の取得に失敗した |

## 表示の条件

登録ボタンを押せるのは、状態を取得できていて、セッションが保存されていて、無効でないときだけ。

| 状態 | 登録ボタン | フォームの上の警告 |
|---|---|---|
| 取得前 | 押せない | なし |
| 取得に失敗 | 押せない (再取得に成功すると解ける) | 「ニコニコセッションの状態を取得できませんでした。ページを再読み込みしてください。」 |
| 未登録 | 押せない | 「ニコニコセッションが未登録です。「セッション管理」ボタンから user_session を登録してください。」 |
| 無効 | 押せない | 「ニコニコセッションが無効です。「セッション管理」ボタンから user_session を更新してください。」 |
| 有効、判定不能 | 押せる | なし |


## 操作

| 操作 | 結果 |
|---|---|
| 「マイリストに登録」 | 入力を検証し、通れば[マイリスト登録 API](../api/mylist-register.md) (`POST /api/mylist/register`) に送る。ブラウザがすでに Web Push を購読していれば、購読の情報も添える (許可は求めない)。送信中は「登録中...」 |
| セッション管理 | ダイアログを開く (下) |

送る前の検証は、次の順で行う。失敗すると、フォームの上に理由を出す。

| 条件 | メッセージ |
|---|---|
| マイリスト名が空、または空白だけ | 「マイリスト名を入力してください」 |
| マイリスト名が 50 文字を超える (文字数はコードポイントで数える。絵文字は 1 文字) | 「マイリスト名は 50 文字以内で入力してください」 |
| 最大動画数が整数でない (空を含む) | 「登録件数は整数で指定してください」 |
| 最大動画数が 1〜100 の外 | 「登録件数は1〜100の範囲で指定してください」 |

- 成功すると、「マイリスト登録ジョブを投入しました。」と選ばれた動画の件数、ジョブ ID を出す。3 秒後に[ジョブの状態画面](./job-status.md) (`/mylist/status/{jobId}`) へ自動で移る
- 失敗は、API が返した文をそのまま出す。読み取れなければ「マイリスト登録に失敗しました」

セッション管理のダイアログ (「ニコニコセッション管理」)。

| 部分 | 内容 |
|---|---|
| 現在の状態 | 札と同じ状態を、色つきの帯で出す。有効期限の目安 (あと N 日)、取得日時、推定有効期限 (日本時間の `YYYY/MM/DD HH:mm`) も出す。無効なときは有効期限を出さない |
| セッションを設定/更新 | `user_session` の入力欄 (伏せ字) と「セッションを保存」。注記で、シークレット窓で取得すること (普段使いのブラウザで取ると、別のログインが無効になるおそれがあること) を案内する |
| セッションを削除 | 保存済みのときだけ出る。確認 (「セッションを削除しますか?」) のあと削除し、ダイアログを閉じる |

- 保存は[ニコニコセッション API](../api/niconico-session.md) (`POST /api/niconico/session`) を呼ぶ。入力が空なら「user_session を入力してください」。成功すると「セッションを保存しました」を出し、状態を取得し直す
- 保存・削除に失敗したら、理由をダイアログに出す。ダイアログは開くたびに入力と表示をリセットする

## 画面の見た目

### 通常表示

セッションが有効で、条件は初期値のまま。

| スマホ | PC |
|---|---|
| ![マイリスト登録画面 通常表示 (スマホ)](../../../images/specs/niconico-mylist-assistant/screen/mylist-register-default-mobile.png) | ![マイリスト登録画面 通常表示 (PC)](../../../images/specs/niconico-mylist-assistant/screen/mylist-register-default-desktop.png) |

### セッション管理のダイアログ

| スマホ | PC |
|---|---|
| ![マイリスト登録画面 セッション管理のダイアログ (スマホ)](../../../images/specs/niconico-mylist-assistant/screen/mylist-register-session-dialog-mobile.png) | ![マイリスト登録画面 セッション管理のダイアログ (PC)](../../../images/specs/niconico-mylist-assistant/screen/mylist-register-session-dialog-desktop.png) |

### セッションの保存に失敗したとき

入力した値が無効と判定された例。

| スマホ | PC |
|---|---|
| ![マイリスト登録画面 セッションの保存に失敗したとき (スマホ)](../../../images/specs/niconico-mylist-assistant/screen/mylist-register-session-save-error-mobile.png) | ![マイリスト登録画面 セッションの保存に失敗したとき (PC)](../../../images/specs/niconico-mylist-assistant/screen/mylist-register-session-save-error-desktop.png) |

### セッションの削除の確認

| スマホ | PC |
|---|---|
| ![マイリスト登録画面 セッションの削除の確認 (スマホ)](../../../images/specs/niconico-mylist-assistant/screen/mylist-register-session-delete-confirm-mobile.png) | ![マイリスト登録画面 セッションの削除の確認 (PC)](../../../images/specs/niconico-mylist-assistant/screen/mylist-register-session-delete-confirm-desktop.png) |

### セッションが無効なとき

登録ボタンが押せず、更新を促す。

| スマホ | PC |
|---|---|
| ![マイリスト登録画面 セッションが無効なとき (スマホ)](../../../images/specs/niconico-mylist-assistant/screen/mylist-register-session-invalid-mobile.png) | ![マイリスト登録画面 セッションが無効なとき (PC)](../../../images/specs/niconico-mylist-assistant/screen/mylist-register-session-invalid-desktop.png) |

### セッションが未登録のとき

| スマホ | PC |
|---|---|
| ![マイリスト登録画面 セッションが未登録のとき (スマホ)](../../../images/specs/niconico-mylist-assistant/screen/mylist-register-session-none-mobile.png) | ![マイリスト登録画面 セッションが未登録のとき (PC)](../../../images/specs/niconico-mylist-assistant/screen/mylist-register-session-none-desktop.png) |

### セッションの有効性を判定できないとき

登録ボタンは押せる。

| スマホ | PC |
|---|---|
| ![マイリスト登録画面 セッションの有効性を判定できないとき (スマホ)](../../../images/specs/niconico-mylist-assistant/screen/mylist-register-session-unknown-mobile.png) | ![マイリスト登録画面 セッションの有効性を判定できないとき (PC)](../../../images/specs/niconico-mylist-assistant/screen/mylist-register-session-unknown-desktop.png) |

### セッションの状態を取得できなかったとき

| スマホ | PC |
|---|---|
| ![マイリスト登録画面 セッションの状態を取得できなかったとき (スマホ)](../../../images/specs/niconico-mylist-assistant/screen/mylist-register-session-fetch-error-mobile.png) | ![マイリスト登録画面 セッションの状態を取得できなかったとき (PC)](../../../images/specs/niconico-mylist-assistant/screen/mylist-register-session-fetch-error-desktop.png) |

### 入力が範囲外のとき

最大動画数に 150 を入れた例。

| スマホ | PC |
|---|---|
| ![マイリスト登録画面 入力が範囲外のとき (スマホ)](../../../images/specs/niconico-mylist-assistant/screen/mylist-register-input-error-mobile.png) | ![マイリスト登録画面 入力が範囲外のとき (PC)](../../../images/specs/niconico-mylist-assistant/screen/mylist-register-input-error-desktop.png) |

### 登録できる動画がないとき

動画を取り込んでいない状態で依頼した例。サーバーが断る。

| スマホ | PC |
|---|---|
| ![マイリスト登録画面 登録できる動画がないとき (スマホ)](../../../images/specs/niconico-mylist-assistant/screen/mylist-register-no-videos-mobile.png) | ![マイリスト登録画面 登録できる動画がないとき (PC)](../../../images/specs/niconico-mylist-assistant/screen/mylist-register-no-videos-desktop.png) |

### 登録中

応答を待っているあいだ。

| スマホ | PC |
|---|---|
| ![マイリスト登録画面 登録中 (スマホ)](../../../images/specs/niconico-mylist-assistant/screen/mylist-register-submitting-mobile.png) | ![マイリスト登録画面 登録中 (PC)](../../../images/specs/niconico-mylist-assistant/screen/mylist-register-submitting-desktop.png) |

### 登録を依頼したとき

数秒後に、ジョブの状態画面へ移る。

| スマホ | PC |
|---|---|
| ![マイリスト登録画面 登録を依頼したとき (スマホ)](../../../images/specs/niconico-mylist-assistant/screen/mylist-register-submitted-mobile.png) | ![マイリスト登録画面 登録を依頼したとき (PC)](../../../images/specs/niconico-mylist-assistant/screen/mylist-register-submitted-desktop.png) |

## つながり

```mermaid
flowchart TD
    H[ホーム画面<br/>ヘッダーのメニュー] --> S[マイリスト登録画面]
    S -->|状態の取得・保存・削除| A1[ニコニコセッション API]
    S -->|登録を依頼| A2[マイリスト登録 API]
    S -->|3 秒後に移る| J[ジョブの状態画面]
```
