import { Injectable } from '@nestjs/common';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
// TODO: 環境変数から取得するように設定してください
// AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_REGION, LAMBDA_FUNCTION_NAME

@Injectable()
export class LambdaService {
  private lambdaClient: LambdaClient;
  private functionName: string;

  constructor() {
    const region = process.env.AWS_REGION || 'ap-northeast-1';
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    this.functionName = process.env.LAMBDA_FUNCTION_NAME || '';

    if (!accessKeyId || !secretAccessKey) {
      throw new Error('AWS認証情報が設定されていません。AWS_ACCESS_KEY_IDとAWS_SECRET_ACCESS_KEYを設定してください。');
    }

    if (!this.functionName) {
      throw new Error('Lambda関数名が設定されていません。LAMBDA_FUNCTION_NAMEを設定してください。');
    }

    this.lambdaClient = new LambdaClient({
      region,
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }

  /**
   * Lambda関数を起動
   * @param payload Lambda関数に渡すペイロード
   * @returns Lambda関数の実行結果
   */
  async invokeLambda(payload: Record<string, any>): Promise<any> {
    try {
      const command = new InvokeCommand({
        FunctionName: this.functionName,
        InvocationType: 'Event', // 非同期実行（'RequestResponse'で同期実行）
        Payload: JSON.stringify(payload),
      });

      const response = await this.lambdaClient.send(command);

      // 非同期実行の場合、レスポンスは基本的に空
      if (response.StatusCode === 202 || response.StatusCode === 200) {
        return {
          success: true,
          statusCode: response.StatusCode,
          // 同期実行の場合、ペイロードをパース
          payload: response.Payload 
            ? JSON.parse(Buffer.from(response.Payload).toString())
            : null,
        };
      }

      throw new Error(`Lambda実行に失敗しました。ステータスコード: ${response.StatusCode}`);
    } catch (error) {
      console.error('Lambda invoke error:', error);
      throw new Error(`Lambda関数の起動に失敗しました: ${error.message}`);
    }
  }

  /**
   * S3画像アップロードをトリガーとしてLambda関数を起動
   * @param imageUrl アップロードされた画像のURL
   * @param userId ユーザーID
   * @param action アクションタイプ（'create' | 'update'）
   */
  async triggerOnImageUpload(
    imageUrl: string,
    userId: string,
    action: 'create' | 'update',
  ): Promise<void> {
    const payload = {
      event: 'image_uploaded',
      userId,
      imageUrl,
      action,
      timestamp: new Date().toISOString(),
    };

    await this.invokeLambda(payload);
  }
}

