import { Module } from '@nestjs/common';
import { S3Service } from './s3.service';
import { LambdaService } from './lambda.service';

@Module({
  providers: [S3Service, LambdaService],
  exports: [S3Service, LambdaService],
})
export class AwsModule {}

