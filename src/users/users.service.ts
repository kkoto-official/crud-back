import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { S3Service } from '../aws/s3.service';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private repo: Repository<User>,
    private s3Service: S3Service,
  ) {}

  async create(dto: CreateUserDto) {
    const user = this.repo.create(dto);
    const savedUser = await this.repo.save(user);
    
    // 画像がアップロードされている場合、リサイズ後のURLに変換
    if (savedUser.imageUrl && !this.s3Service.isResizedImageUrl(savedUser.imageUrl)) {
      savedUser.imageUrl = this.s3Service.generateResizedImageUrl(savedUser.imageUrl);
      await this.repo.save(savedUser);
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
    console.log('oldImageUrl: ', oldImageUrl);
    console.log('dto: ', dto);
    console.log('user: ', user);
    Object.assign(user, dto);
    console.log('user after assign: ', user);
    const savedUser = await this.repo.save(user);
    
    // 画像が変更または削除された場合、古い画像とリサイズ画像を削除
    if (oldImageUrl && oldImageUrl !== savedUser.imageUrl) {
      try {
        const isResized = this.s3Service.isResizedImageUrl(oldImageUrl);
        // 既存URLを削除
        await this.s3Service.deleteImage(oldImageUrl);
        // 元URLの場合はリサイズ画像も削除
        if (!isResized) {
          const resizedUrl = this.s3Service.generateResizedImageUrl(oldImageUrl);
          if (resizedUrl !== oldImageUrl) {
            await this.s3Service.deleteImage(resizedUrl);
          }
        }
      } catch (error) {
        console.error('S3削除エラー（ユーザー更新）:', error);
      }
    }

    // 新しい画像がアップロードされている場合、リサイズ後のURLに変換
    const imageUrlChanged = dto.imageUrl !== undefined && dto.imageUrl !== oldImageUrl;
    if (imageUrlChanged && savedUser.imageUrl && !this.s3Service.isResizedImageUrl(savedUser.imageUrl)) {
      savedUser.imageUrl = this.s3Service.generateResizedImageUrl(savedUser.imageUrl);
      await this.repo.save(savedUser);
    }
    
    return savedUser;
  }

  async remove(id: string) {
    const user = await this.findOne(id);
    
    // 画像が存在する場合、S3からも削除
    if (user.imageUrl) {
      try {
        const isResized = this.s3Service.isResizedImageUrl(user.imageUrl);
        await this.s3Service.deleteImage(user.imageUrl);
        if (!isResized) {
          const resizedUrl = this.s3Service.generateResizedImageUrl(user.imageUrl);
          if (resizedUrl !== user.imageUrl) {
            await this.s3Service.deleteImage(resizedUrl);
          }
        }
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
