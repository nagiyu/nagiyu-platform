# ビルドとテストのための注意事項

## ローカルビルドの制限

このサンドボックス環境では、Alpine Linux パッケージリポジトリへのアクセスが制限されているため、Docker ビルドが完全には実行できません。

```
WARNING: fetching https://dl-cdn.alpinelinux.org/alpine/v3.20/main: Permission denied
```

## 実際の環境でのビルド

このDockerfileは、以下の環境で正常にビルドできます：

### 前提条件
- インターネットアクセスが可能な環境
- Docker 20.10 以上

### ビルドコマンド

```bash
cd services/codec-converter-worker
docker build -t codec-converter-worker:latest .
```

### ビルド成功の確認

```bash
# イメージサイズの確認（約 200-300MB を想定）
docker images codec-converter-worker:latest

# FFmpeg のバージョン確認
docker run --rm codec-converter-worker:latest ffmpeg -version

# 必要なコーデックの確認
docker run --rm --entrypoint=/bin/sh codec-converter-worker:latest -c "ffmpeg -codecs 2>&1 | grep -E 'libx264|libvpx-vp9|libaom'"
```

期待される出力:
```
DEV.LS h264                 H.264 / AVC / MPEG-4 AVC / MPEG-4 part 10 (decoders: h264 ) (encoders: libx264 libx264rgb )
DEV.L. vp9                  Google VP9 (decoders: vp9 libvpx-vp9 ) (encoders: libvpx-vp9 )
DEV.L. av1                  Alliance for Open Media AV1 (decoders: libdav1d libaom-av1 av1 ) (encoders: libaom-av1 libsvtav1 )
```

## CI/CD でのビルド

GitHub Actions または AWS CodeBuild で自動ビルドする場合の例：

```yaml
# .github/workflows/build-worker.yml
name: Build Worker Image

on:
  push:
    paths:
      - 'services/codec-converter-worker/**'

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_ROLE_ARN }}
          aws-region: ap-northeast-1
      
      - name: Login to Amazon ECR
        id: login-ecr
        uses: aws-actions/amazon-ecr-login@v2
      
      - name: Build and push
        env:
          ECR_REGISTRY: ${{ steps.login-ecr.outputs.registry }}
          ECR_REPOSITORY: codec-converter-worker
          IMAGE_TAG: ${{ github.sha }}
        run: |
          cd services/codec-converter-worker
          docker build -t $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG .
          docker push $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG
          docker tag $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG $ECR_REGISTRY/$ECR_REPOSITORY:latest
          docker push $ECR_REGISTRY/$ECR_REPOSITORY:latest
```

## セキュリティスキャン

ビルド後に脆弱性スキャンを実行することを推奨します：

```bash
# Trivy を使用したスキャン
docker run --rm -v /var/run/docker.sock:/var/run/docker.sock \
  aquasec/trivy image codec-converter-worker:latest
```

## トラブルシューティング

### ビルドが遅い
- Docker のビルドキャッシュを活用してください
- マルチステージビルドは既に最適化されています

### イメージサイズが大きい
- 現在の構成では約 200-300MB を想定
- これは FFmpeg と AWS CLI を含むため妥当なサイズです
- さらに小さくする場合は、AWS CLI の代わりに AWS SDK for Go などの静的バイナリを検討

### コーデックが見つからない
- 使用している `jrottenberg/ffmpeg:6.1-alpine` には以下が含まれています：
  - libx264 (H.264)
  - libvpx-vp9 (VP9)
  - libaom-av1 (AV1)
- 異なるバージョンやタグを使用する場合は、コーデック対応を確認してください
