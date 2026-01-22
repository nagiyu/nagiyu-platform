#!/bin/bash

# favicon-16.png, favicon-24.png, favicon-32.png を統合して favicon.ico を作成するスクリプト
# 使用方法: ./create-favicon.sh <出力ディレクトリ>

set -e

if [ -z "$1" ]; then
    echo "使用方法: $0 <出力ディレクトリ>"
    echo "例: $0 /path/to/output"
    exit 1
fi

OUTPUT_DIR="$1"

if [ ! -d "$OUTPUT_DIR" ]; then
    echo "エラー: ディレクトリが存在しません: $OUTPUT_DIR"
    exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

FAVICON_16="$SCRIPT_DIR/favicon-16.png"
FAVICON_24="$SCRIPT_DIR/favicon-24.png"
FAVICON_32="$SCRIPT_DIR/favicon-32.png"

for file in "$FAVICON_16" "$FAVICON_24" "$FAVICON_32"; do
    if [ ! -f "$file" ]; then
        echo "エラー: ファイルが見つかりません: $file"
        exit 1
    fi
done

OUTPUT_FILE="$OUTPUT_DIR/favicon.ico"

# ImageMagick の convert コマンドを使用して ICO ファイルを作成
convert "$FAVICON_16" "$FAVICON_24" "$FAVICON_32" "$OUTPUT_FILE"

echo "favicon.ico を作成しました: $OUTPUT_FILE"
