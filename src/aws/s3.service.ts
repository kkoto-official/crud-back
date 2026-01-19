import { Injectable } from '@nestjs/common';
import { S3Client, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
// TODO: 環境変数から取得するように設定してください
// AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, S3_BUCKET_NAME

@Injectable()
export class S3Service {
  private s3Client: S3Client;
  private bucketName: string;

  constructor() {
    const region = process.env.AWS_REGION || 'ap-northeast-1';
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    this.bucketName = process.env.S3_BUCKET_NAME || '';

    if (!accessKeyId || !secretAccessKey) {
      throw new Error('AWS認証情報が設定されていません。AWS_ACCESS_KEY_IDとAWS_SECRET_ACCESS_KEYを設定してください。');
    }

    if (!this.bucketName) {
      throw new Error('S3バケット名が設定されていません。S3_BUCKET_NAMEを設定してください。');
    }

    this.s3Client = new S3Client({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }

  /**
   * 画像ファイルをS3にアップロード
   * @param file アップロードするファイル（Buffer）
   * @param fileName S3に保存するファイル名
   * @param contentType ファイルのMIMEタイプ
   * @returns アップロードされたファイルのURL
   */
  async uploadImage(
    file: Buffer,
    fileName: string,
    contentType: string,
  ): Promise<string> {
    try {
      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: fileName,
        Body: file,
        ContentType: contentType,
        // ACLは削除（バケットポリシーでパブリックアクセスを許可する必要があります）
        // バケットがACLをサポートしていない場合、バケットポリシーを使用してください
      });

      await this.s3Client.send(command);

      // TODO: CloudFrontを使用する場合は、CloudFrontのURLを使用してください
      // const cloudFrontUrl = process.env.CLOUDFRONT_URL || 'https://your-cloudfront-url.cloudfront.net';
      // return `${cloudFrontUrl}/${fileName}`;

      // S3の直接URLを返す（パブリックアクセスが有効な場合）
      const region = 'ap-northeast-1';

      console.log('region', region);
      console.log('bucketName', this.bucketName);
      const url = `https://${this.bucketName}.s3.${region}.amazonaws.com/${fileName}`;
      console.log('url', url);
      return url;
    } catch (error) {
      console.error('S3 upload error:', error);
      throw new Error(`画像のアップロードに失敗しました: ${error.message}`);
    }
  }

  /**
   * S3からファイルを削除
   * @param fileName 削除するファイル名
   */
  async deleteImage(fileName: string): Promise<void> {
    try {
      // S3のURLからキーを抽出（URLが渡された場合）
      let key = fileName;
      if (fileName.startsWith('http')) {
        try {
          const url = new URL(fileName);
          key = url.pathname.replace(/^\/+/, '');
        } catch {
          // URL解析に失敗した場合は元の値を使用
          key = fileName;
        }
      }

      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      await this.s3Client.send(command);
    } catch (error) {
      console.error('S3 delete error:', error);
      throw new Error(`画像の削除に失敗しました: ${error.message}`);
    }
  }

  /**
   * 一意のファイル名を生成
   * @param originalFileName 元のファイル名
   * @param userId ユーザーID（オプション）
   * @returns 生成されたファイル名
   */
  generateFileName(originalFileName: string, userId?: string): string {
    const timestamp = Date.now();
    const randomString = Math.random().toString(36).substring(2, 15);
    const extension = originalFileName.split('.').pop() || 'jpg';
    const prefix = userId ? `users/${userId}` : 'users';
    return `${prefix}/${timestamp}-${randomString}.${extension}`;
  }

  /**
   * リサイズ後の画像URLを生成
   * S3イベントトリガーでLambda関数が自動的にリサイズ画像を生成することを前提とする
   * @param originalImageUrl 元の画像URL
   * @returns リサイズ後の画像URL
   * 例: users/user-id/timestamp-random.png -> resized/users/user-id/timestamp-random_w800.webp
   */
  generateResizedImageUrl(originalImageUrl: string): string {
    if (this.isResizedImageUrl(originalImageUrl)) {
      return originalImageUrl;
    }

    try {
      const url = new URL(originalImageUrl);
      const pathname = url.pathname.replace(/^\/+/, '');
      
      // パスからリサイズ版のパスを生成
      // 例: users/user-id/timestamp-random.png -> resized/users/user-id/timestamp-random_w800.webp
      const pathParts = pathname.split('/');
      const fileName = pathParts[pathParts.length - 1];
      
      // ファイル名から拡張子を分離
      const lastDotIndex = fileName.lastIndexOf('.');
      const nameWithoutExt = lastDotIndex > 0 ? fileName.substring(0, lastDotIndex) : fileName;
      const extension = lastDotIndex > 0 ? fileName.substring(lastDotIndex + 1) : '';
      
      // リサイズ版のファイル名を生成（_w800.webp）
      const resizedFileName = `${nameWithoutExt}_w800.webp`;
      
      // パスを再構築（users/の前にresized/を追加）
      const directoryPath = pathParts.slice(0, -1).join('/');
      const resizedPath = `resized/${directoryPath}/${resizedFileName}`;
      
      const region = 'ap-northeast-1';
      return `https://${this.bucketName}.s3.${region}.amazonaws.com/${resizedPath}`;
    } catch {
      // URL解析に失敗した場合は、元のURLにresized/と_w800.webpを追加
      const key = originalImageUrl.includes('/') 
        ? originalImageUrl.split('/').slice(-1)[0] 
        : originalImageUrl;
      
      const lastDotIndex = key.lastIndexOf('.');
      const nameWithoutExt = lastDotIndex > 0 ? key.substring(0, lastDotIndex) : key;
      const resizedKey = `${nameWithoutExt}_w800.webp`;
      
      const region = 'ap-northeast-1';
      return `https://${this.bucketName}.s3.${region}.amazonaws.com/resized/${resizedKey}`;
    }
  }

  /**
   * URLがリサイズ済み画像か判定
   * @param imageUrl 画像URL
   * @returns リサイズ済みの場合true
   */
  isResizedImageUrl(imageUrl: string): boolean {
    try {
      const url = new URL(imageUrl);
      const pathname = url.pathname;
      return pathname.includes('/resized/') && /_w800\.webp$/i.test(pathname);
    } catch {
      return imageUrl.includes('/resized/') && /_w800\.webp$/i.test(imageUrl);
    }
  }

  /**
   * S3オブジェクトの存在確認
   * @param key S3キーまたはURL
   * @returns オブジェクトが存在する場合true
   */
  async checkObjectExists(key: string): Promise<boolean> {
    try {
      // URLからキーを抽出
      let s3Key = key;
      if (key.startsWith('http')) {
        try {
          const url = new URL(key);
          s3Key = url.pathname.replace(/^\/+/, '');
        } catch {
          s3Key = key;
        }
      }

      const command = new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: s3Key,
      });

      await this.s3Client.send(command);
      return true;
    } catch (error: any) {
      if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
        return false;
      }
      // その他のエラーはログに記録
      console.error('S3 HeadObject error:', error);
      return false;
    }
  }
}

