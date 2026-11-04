import { Controller, Get, Post, Body, UseGuards, Req, Query } from '@nestjs/common';
import { StorageService } from './storage.service';
import { SupabaseAuthGuard } from '../auth/auth.guard';

@Controller('api/v1/storage')
export class StorageController {
  constructor(private readonly storageService: StorageService) {}

  @Get('buckets')
  async listBuckets() {
    return this.storageService.listBuckets();
  }

  @Post('upload-url')
  @UseGuards(SupabaseAuthGuard)
  async getUploadUrl(
    @Req() req: any,
    @Body('bucket') bucket: string,
    @Body('filename') filename: string,
  ) {
    return this.storageService.createSignedUploadUrl(req.user.id, bucket, filename || 'file.bin');
  }

  @Get('download-url')
  @UseGuards(SupabaseAuthGuard)
  async getDownloadUrl(
    @Req() req: any,
    @Query('bucket') bucket: string,
    @Query('path') path: string,
  ) {
    return this.storageService.createSignedDownloadUrl(req.user.id, bucket, path);
  }
}
