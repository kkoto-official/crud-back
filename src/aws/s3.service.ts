import { Injectable } from '@nestjs/common';
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
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
        // TODO: 必要に応じてACL設定を追加してください
        // ACL: 'public-read',
      });

      await this.s3Client.send(command);

      // TODO: CloudFrontを使用する場合は、CloudFrontのURLを使用してください
      // const cloudFrontUrl = process.env.CLOUDFRONT_URL || 'https://your-cloudfront-url.cloudfront.net';
      // return `${cloudFrontUrl}/${fileName}`;

      // S3の直接URLを返す（パブリックアクセスが有効な場合）
      const region = this.s3Client.config.region || 'ap-northeast-1';
      return `https://${this.bucketName}.s3.${region}.amazonaws.com/${fileName}`;
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
      // S3のURLからファイル名を抽出（URLが渡された場合）
      const key = fileName.includes('/') 
        ? fileName.split('/').pop() || fileName 
        : fileName;

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
}

