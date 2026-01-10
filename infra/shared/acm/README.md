# ACM CloudFormation Template (廃止予定)

## 概要

このディレクトリには、以前使用していた ACM 証明書の CloudFormation テンプレートが保管されています。

**現在のステータス**: ✅ CDK に移行済み

## 移行情報

- **移行日**: 2026-01-10
- **移行元**: `certificate.yaml` (CloudFormation)
- **移行先**: `infra/shared/lib/acm-stack.ts` (CDK)
- **旧スタック名**: `nagiyu-shared-acm-certificate`
- **新スタック名**: `SharedAcm`

## ファイル

- `certificate.yaml.bak` - CloudFormation テンプレートのバックアップ
- `certificate.yaml` - 元の CloudFormation テンプレート（参照用）

## 使用方法

**⚠️ 重要**: このディレクトリのテンプレートは今後使用されません。新しい ACM 証明書のデプロイには CDK を使用してください。

### CDK でのデプロイ

```bash
cd infra/shared

# ビルド
npm run build

# デプロイ
npx cdk deploy SharedAcm
```

詳細は [ACM 詳細ドキュメント](../../../docs/infra/shared/acm.md) を参照してください。

## バックアップファイルの削除について

`certificate.yaml.bak` ファイルは、CDK への移行が安定して問題なく動作することを確認した後、削除して構いません。

削除の目安:
- CDK スタックが正常にデプロイできている
- 既存サービス（CloudFront など）が正常に動作している
- DNS 検証が正常に完了している
- 問題なく数週間運用できている

## 関連ドキュメント

- [ACM 詳細ドキュメント](../../../docs/infra/shared/acm.md)
- [CDK 移行ガイド](../../../docs/infra/cdk-migration.md)
