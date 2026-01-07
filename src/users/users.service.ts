import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { S3Service } from '../aws/s3.service';
import { LambdaService } from '../aws/lambda.service';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private repo: Repository<User>,
    private s3Service: S3Service,
    private lambdaService: LambdaService,
  ) {}

  async create(dto: CreateUserDto) {
    const user = this.repo.create(dto);
    const savedUser = await this.repo.save(user);
    
    // 画像がアップロードされている場合、Lambdaを起動
    if (savedUser.imageUrl) {
      try {
        await this.lambdaService.triggerOnImageUpload(
          savedUser.imageUrl,
          savedUser.id,
          'create',
        );
      } catch (error) {
        // Lambda起動の失敗はログに記録するが、ユーザー作成は成功とする
        console.error('Lambda起動エラー（ユーザー作成）:', error);
      }
    }
    
    return savedUser;
  }

  async findAll() {
    return this.repo.find({ order: { createdAt: 'DESC' } });
  }

  async findOne(id: string) {
    const user = await this.repo.findOne({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async update(id: string, dto: UpdateUserDto) {
    const user = await this.findOne(id);
    const oldImageUrl = user.imageUrl;
    Object.assign(user, dto);
    const savedUser = await this.repo.save(user);
    
    // 新しい画像がアップロードされている場合、Lambdaを起動
    if (savedUser.imageUrl && savedUser.imageUrl !== oldImageUrl) {
      try {
        await this.lambdaService.triggerOnImageUpload(
          savedUser.imageUrl,
          savedUser.id,
          'update',
        );
      } catch (error) {
        // Lambda起動の失敗はログに記録するが、ユーザー更新は成功とする
        console.error('Lambda起動エラー（ユーザー更新）:', error);
      }
    }
    
    return savedUser;
  }

  async remove(id: string) {
    const user = await this.findOne(id);
    
    // 画像が存在する場合、S3からも削除
    if (user.imageUrl) {
      try {
        await this.s3Service.deleteImage(user.imageUrl);
      } catch (error) {
        console.error('S3削除エラー:', error);
        // S3削除の失敗はログに記録するが、ユーザー削除は続行
      }
    }
    
    await this.repo.remove(user);
    return { deleted: true, id };
  }

  /**
   * 画像ファイルをアップロードしてURLを取得
   * @param file アップロードするファイル
   * @param userId ユーザーID（オプション）
   * @returns アップロードされた画像のURL
   */
  async uploadImage(file: Express.Multer.File, userId?: string): Promise<string> {
    const fileName = this.s3Service.generateFileName(file.originalname, userId);
    return await this.s3Service.uploadImage(file.buffer, fileName, file.mimetype);
  }
}
