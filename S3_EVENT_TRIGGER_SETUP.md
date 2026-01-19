# S3イベントトリガー設定ガイド

## 概要

バックエンドからLambda関数を直接呼び出すのではなく、S3のイベント通知でLambda関数を自動的にトリガーする方式に変更しました。

## アーキテクチャ

```
1. バックエンドが画像をS3にアップロード
   ↓
2. S3のPutObjectイベントがLambda関数を自動的にトリガー
   ↓
3. Lambda関数が画像をリサイズしてresized/プレフィックス付きで保存
   ↓
4. バックエンドはresized/プレフィックス付きのURLを組み立てる
```

## 変更内容

### バックエンド側

1. **Lambda関数の直接呼び出しを削除**
   - `users.service.ts`から`lambdaService.triggerOnImageUpload()`の呼び出しを削除
   - `LambdaService`の依存関係を削除

2. **リサイズ後のURL生成機能を追加**
   - `S3Service.generateResizedImageUrl()`: リサイズ後のURLを生成
   - `S3Service.checkObjectExists()`: オブジェクトの存在確認（オプション）

3. **画像削除時の処理を改善**
   - 元の画像とリサイズ画像の両方を削除

## S3イベント通知の設定

### AWSコンソールでの設定

1. S3コンソールに移動
2. 対象のバケットを選択
3. 「プロパティ」タブを開く
4. 「イベント通知」セクションで「イベント通知を作成」をクリック
5. 以下の設定を行う：
   - **イベント名**: `image-upload-trigger`（任意）
   - **プレフィックス**: `users/`（画像が保存されるプレフィックス）
   - **サフィックス**: `.jpg`、`.jpeg`、`.png`、`.gif`、`.webp`（画像ファイルの拡張子）
   - **イベントタイプ**: `PUT`（オブジェクト作成時）
   - **送信先**: Lambda関数
   - **Lambda関数**: `s3-upload-logger`（または作成したLambda関数名）

### AWS CLIでの設定

```bash
# Lambda関数にS3からの呼び出し権限を付与
aws lambda add-permission \
  --function-name s3-upload-logger \
  --principal s3.amazonaws.com \
  --statement-id s3-trigger \
  --action "lambda:InvokeFunction" \
  --source-arn arn:aws:s3:::YOUR_BUCKET_NAME \
  --region ap-northeast-1

# S3イベント通知を作成
aws s3api put-bucket-notification-configuration \
  --bucket YOUR_BUCKET_NAME \
  --notification-configuration '{
    "LambdaFunctionConfigurations": [
      {
        "Id": "image-upload-trigger",
        "LambdaFunctionArn": "arn:aws:lambda:ap-northeast-1:ACCOUNT_ID:function:s3-upload-logger",
        "Events": ["s3:ObjectCreated:Put"],
        "Filter": {
          "Key": {
            "FilterRules": [
              {
                "Name": "prefix",
                "Value": "users/"
              },
              {
                "Name": "suffix",
                "Value": ".jpg"
              }
            ]
          }
        }
      }
    ]
  }' \
  --region ap-northeast-1
```

## Lambda関数の実装

Lambda関数は以下の形式でイベントを受け取ります：

```json
{
  "Records": [
    {
      "s3": {
        "bucket": {
          "name": "your-bucket-name"
        },
        "object": {
          "key": "users/user-id/timestamp-random.jpg"
        }
      }
    }
  ]
}
```

Lambda関数は以下の処理を行います：

1. S3から画像をダウンロード
2. 画像をリサイズ（最大800x800px）
3. `resized/users/user-id/timestamp-random.jpg`として保存

## バックエンドでの使用方法

### リサイズ後のURLを取得

```typescript
// 画像アップロード後
const originalImageUrl = await s3Service.uploadImage(file.buffer, fileName, file.mimetype);

// リサイズ後のURLを生成（Lambda関数が非同期で処理するため、すぐには存在しない可能性がある）
const resizedImageUrl = s3Service.generateResizedImageUrl(originalImageUrl);
```

### リサイズ画像の存在確認（オプション）

```typescript
// リサイズ画像が存在するか確認
const exists = await s3Service.checkObjectExists(resizedImageUrl);
if (exists) {
  // リサイズ画像を使用
} else {
  // 元の画像を使用、またはリトライ
}
```

## 注意事項

1. **非同期処理**
   - Lambda関数は非同期で実行されるため、アップロード直後はリサイズ画像が存在しない可能性があります
   - フロントエンドでは、リサイズ画像が存在しない場合は元の画像を表示するなどのフォールバック処理を実装してください

2. **エラーハンドリング**
   - Lambda関数の実行に失敗した場合でも、元の画像は保存されているため、アプリケーションは正常に動作します

3. **コスト最適化**
   - リサイズ画像は必要に応じて生成されるため、不要なリサイズ処理を避けられます

4. **プレフィックスの変更**
   - リサイズ画像のプレフィックス（`resized/`）を変更する場合は、Lambda関数と`S3Service.generateResizedImageUrl()`の両方を更新してください

