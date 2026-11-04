import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { DatabaseService } from '../database/database.service';

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly databaseService: DatabaseService,
  ) {}

  async listBuckets() {
    // 1. First query direct PostgreSQL storage.buckets table
    try {
      const res = await this.databaseService.query(
        `SELECT id, name, public, created_at, file_size_limit FROM storage.buckets ORDER BY name;`
      );
      if (res.rows && res.rows.length > 0) {
        return {
          success: true,
          buckets: res.rows.map(b => ({
            id: b.id,
            name: b.name,
            public: b.public,
            createdAt: b.created_at,
            fileSizeLimit: b.file_size_limit,
          })),
        };
      }
    } catch (err: any) {
      this.logger.warn(`Direct storage.buckets query warning: ${err.message}`);
    }

    // 2. Fallback to Supabase JS client
    const supabase = this.supabaseService.getClient();
    if (!supabase) {
      throw new BadRequestException('Supabase client is not configured');
    }

    const { data, error } = await supabase.storage.listBuckets();
    if (error) {
      throw new BadRequestException(`Failed to list storage buckets: ${error.message}`);
    }

    return {
      success: true,
      buckets: (data || []).map(b => ({
        id: b.id,
        name: b.name,
        public: b.public,
        createdAt: b.created_at,
        fileSizeLimit: b.file_size_limit,
      })),
    };
  }

  async createSignedUploadUrl(userId: string, bucket: string, filename: string) {
    const supabase = this.supabaseService.getClient();
    if (!supabase) {
      throw new BadRequestException('Supabase client is not configured');
    }

    const allowedBuckets = ['profile-photos', 'health-documents', 'educational-media'];
    if (!allowedBuckets.includes(bucket)) {
      throw new BadRequestException(`Invalid bucket. Allowed buckets: ${allowedBuckets.join(', ')}`);
    }

    // Path is scoped by user id to respect RLS
    const sanitizedFilename = filename.replace(/[^a-zA-Z0-9_.-]/g, '_');
    const path = `${userId}/${Date.now()}-${sanitizedFilename}`;

    const { data, error } = await supabase.storage.from(bucket).createSignedUploadUrl(path);
    if (error) {
      this.logger.error(`Failed to generate signed upload URL: ${error.message}`);
      throw new BadRequestException(`Signed URL error: ${error.message}`);
    }

    return {
      success: true,
      bucket,
      path,
      token: data.token,
      signedUrl: data.signedUrl,
      expiresIn: 3600,
    };
  }

  async createSignedDownloadUrl(userId: string, bucket: string, path: string) {
    const supabase = this.supabaseService.getClient();
    if (!supabase) {
      throw new BadRequestException('Supabase client is not configured');
    }

    // Enforce folder ownership for private health documents
    if (bucket !== 'educational-media' && !path.startsWith(`${userId}/`)) {
      throw new BadRequestException('Unauthorized: You cannot access files outside your personal vault.');
    }

    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 15); // 15 mins
    if (error) {
      throw new BadRequestException(`Failed to generate signed download URL: ${error.message}`);
    }

    return {
      success: true,
      signedUrl: data.signedUrl,
    };
  }
}
