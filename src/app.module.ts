import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { typeOrmConfig } from './config/typeorm.config';
import { UsersModule } from './users/users.module';
import { AwsModule } from './aws/aws.module';

@Module({
  imports: [
    TypeOrmModule.forRoot(typeOrmConfig),
    AwsModule,
    UsersModule,
  ],
})
export class AppModule {}
