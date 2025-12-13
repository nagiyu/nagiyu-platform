# Feature Specification: Codec Converter

**Feature Branch**: `002-add-codec-converter`  
**Created**: 2025-12-13  
**Status**: Draft  
**Input**: User description: "docs 配下にある要件の、Codec Converter を実装する。Spec Kit による成果物は日本語で出力する。"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 動画のアップロードと変換 (Priority: P1)

エンドユーザーはブラウザから動画（MP4）をアップロードし、指定した出力コーデック（H.264/VP9/AV1）に変換してダウンロードできる。

**Why this priority**: 本機能がサービスの核となるため最優先（MVP）。

**Independent Test**: ブラウザから 100MB 未満の MP4 をアップロードし、H.264 に変換してダウンロードできるかを確認する。

**Acceptance Scenarios**:

1. **Given** 有効な MP4 ファイル（<=500MB）、**When** ユーザーがアップロードして H.264 を選択、**Then** ジョブは `PENDING`→`PROCESSING`→`COMPLETED` と遷移し、変換後ファイルをダウンロード可能である。
2. **Given** FFmpeg で処理できないコーデックを含む MP4、**When** 変換を要求、**Then** ジョブは `FAILED` となり、エラー理由が返される。

---

### User Story 2 - ジョブ管理と進捗確認 (Priority: P2)

ユーザーはブラウザを開くことで、ローカルストレージに保存されたジョブ ID の一覧から各ジョブの状態を確認できる。

**Why this priority**: 変換結果の取得とトラブル対応に必須。

**Independent Test**: アップロード完了後、ブラウザのローカルストレージにジョブ ID を保存してページ再読み込みし、API からステータスを取得して表示する。

**Acceptance Scenarios**:

1. **Given** ブラウザのローカルストレージにジョブ ID、**When** ページを開く、**Then** 各ジョブの現在ステータスが API から取得され表示される。

---

### User Story 3 - ダウンロードと保持 (Priority: P3)

ユーザーは変換完了後、ダウンロード用の Presigned URL を取得して変換済ファイルをダウンロードできる。ファイルは変換完了後24時間で削除される。

**Why this priority**: ユーザーが変換成果物を受け取るために必要。

**Independent Test**: 変換完了後にダウンロード用 Presigned URL を生成し、24時間以内にダウンロードが成功することを確認する。

**Acceptance Scenarios**:

1. **Given** 変換が `COMPLETED`、**When** ダウンロード要求、**Then** 有効な Presigned URL が返り、ダウンロードが可能である。

---

### Edge Cases

- アップロード中にネットワーク切断が発生した場合: クライアント側で再試行させる。未完のアップロードは S3 に残らない前提。
- ファイルサイズが 500MB を超えた場合: フロントエンドで弾き、ユーザーにエラーメッセージを表示する。
- 変換処理が 2時間を超えた場合: ジョブは `FAILED` とし、ユーザーにタイムアウトを通知する。
- 同時処理が上限（3ジョブ）を超えた場合: 新規ジョブはキュー待ち (`PENDING`) となる。

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: ユーザーはブラウザから MP4 ファイルをアップロードできる。アップロードは S3 Presigned URL を用いて行う。
- **FR-002**: アップロード可能なファイルは MP4 のみとし、ファイルサイズ上限は 500MB とする。フロントエンドで拡張子と MIME タイプ、サイズを検証する。
- **FR-003**: システムはアップロード完了後、変換ジョブを作成し一意のジョブ ID (UUID) を返す。
- **FR-004**: システムは指定された出力コーデック（H.264 / VP9 / AV1）に変換処理を行う。FFmpeg で処理できない場合は `FAILED` を返す。
- **FR-005**: 変換処理は AWS Batch 上で実行し、キューは FIFO とする。各ジョブは最大 2時間でタイムアウトする。
- **FR-006**: ジョブステータスは `PENDING`, `PROCESSING`, `COMPLETED`, `FAILED` を持ち、DynamoDB に記録する。
- **FR-007**: 変換後ファイルとジョブ情報は 24時間保持し、その後 S3 と DynamoDB のレコードを削除する。
- **FR-008**: 変換済ファイルのダウンロードは Lambda で生成する Presigned URL を用い、有効期限は 24時間とする。
- **FR-009**: 認証は行わない（匿名利用）。ジョブ ID は推測困難な UUID とする。
- **FR-010**: 同時実行ジョブ数は Phase 1 で最大 3 とし、それ以上はキューで待機する。

### Key Entities

- **Job**: ジョブ ID (UUID), ステータス, 入力ファイル情報（S3 パス, 元ファイル名, ファイルサイズ）, 出力フォーマット, 作成日時, 更新日時, エラー情報。
- **File (S3 Object)**: 入力ファイル、変換済ファイル。メタ情報として Content-Type, サイズを保持。
- **User Session (軽量)**: ブラウザのローカルストレージに保存するジョブ ID の一覧（匿名ユーザー識別は行わない）。
- **DynamoDB レコード**: Job の永続化先。索引はジョブ ID を主キーとして検索可能。

## Success Criteria *(mandatory)*

- **SC-001**: ユーザーはブラウザから 500MB 以下の MP4 をアップロードし、選択した出力コーデックへの変換を正常に完了できる（KPI: 成功率 >= 95% for typical test set）。
- **SC-002**: 変換処理は同時 3 ジョブまで受け付け、追加はキューに入り処理される（KPI: キュー処理が滞留しないこと）。
- **SC-003**: 変換ジョブのタイムアウトは 2 時間で処理が終了しない場合 `FAILED` となることを確認できる。
- **SC-004**: 変換完了後に生成されるダウンロード用 Presigned URL は発行から 24 時間以内にダウンロードが成功すること。
- **SC-005**: 変換完了後 24 時間で関連する S3 オブジェクトと DynamoDB レコードが削除されること（検証用 API /監査ログで確認可能）。

## Assumptions

- Phase 1 のスコープは `MP4 入力のみ`、仮に他形式が来た場合は明示的にエラーを返す。
- ウイルススキャンは Phase 1 では実施しない。
- 匿名利用のため認証・アカウント管理機能は実装しない。

---

関連ドキュメント: [アーキテクチャ](./architecture.md), [インフラ概要](./infra/README.md)
