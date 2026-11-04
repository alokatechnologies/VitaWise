import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

export interface SupabaseHealthResult {
  connected: boolean;
  url: string;
  configured: boolean;
  latencyMs: number | null;
  storageOnline: boolean;
  authOnline: boolean;
  message: string;
  error?: string;
}

@Injectable()
export class SupabaseService {
  private readonly logger = new Logger(SupabaseService.name);
  private client: SupabaseClient | null = null;
  private readonly supabaseUrl: string;
  private readonly serviceRoleKey: string | null;
  private readonly anonKey: string | null;
  private readonly clientKey: string | null;

  constructor(private readonly configService: ConfigService) {
    this.supabaseUrl = this.configService.get<string>('supabase.url') || 'https://zvxqvelosmswdwntnpbe.supabase.co';
    this.serviceRoleKey = this.configService.get<string>('supabase.serviceRoleKey');
    this.anonKey = this.configService.get<string>('supabase.anonKey');
    this.clientKey = this.serviceRoleKey || this.anonKey;

    if (this.clientKey) {
      this.client = createClient(this.supabaseUrl, this.clientKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      });
      this.logger.log(`Initialized Supabase client for project URL: ${this.supabaseUrl} (${this.serviceRoleKey ? 'service role' : 'public key'} mode)`);
    } else {
      this.logger.warn(`Supabase client initialized in unauthenticated mode (SUPABASE_SERVICE_ROLE_KEY missing)`);
    }
  }

  getClient(): SupabaseClient | null {
    return this.client;
  }

  getUrl(): string {
    return this.supabaseUrl;
  }

  isConfigured(): boolean {
    return !!this.clientKey;
  }

  async checkConnectivity(): Promise<SupabaseHealthResult> {
    const startTime = Date.now();
    let storageOnline = false;
    let authOnline = false;

    // Probe Supabase public storage endpoint
    try {
      const storageRes = await fetch(`${this.supabaseUrl}/storage/v1/version`, { method: 'GET' });
      storageOnline = storageRes.ok;
    } catch {
      storageOnline = false;
    }

    // Probe Supabase Auth endpoint
    try {
      const authRes = await fetch(`${this.supabaseUrl}/auth/v1/health`, { method: 'GET' });
      // Supabase auth health returns 200 or 401 (needs key) which confirms service reachability
      authOnline = authRes.status === 200 || authRes.status === 400 || authRes.status === 401;
    } catch {
      authOnline = false;
    }

    const latencyMs = Date.now() - startTime;

    if (!this.clientKey) {
      return {
        connected: storageOnline || authOnline,
        url: this.supabaseUrl,
        configured: false,
        latencyMs,
        storageOnline,
        authOnline,
        message: 'Supabase project endpoint is reachable and healthy, but SUPABASE_SERVICE_ROLE_KEY is required for privileged database queries and RLS bypass.',
      };
    }

    try {
      if (!this.client) {
        throw new Error('Supabase client not initialized');
      }

      // Safe query that executes against information_schema or a light probe
      const { data, error } = await this.client
        .from('health_records')
        .select('id')
        .limit(1);

      if (error && error.code !== 'PGRST116' && error.code !== '42P01') {
        // 42P01 means table does not exist yet, which still proves valid database authorization
        throw error;
      }

      return {
        connected: true,
        url: this.supabaseUrl,
        configured: Boolean(this.clientKey),
        latencyMs,
        storageOnline,
        authOnline,
        message: this.serviceRoleKey
          ? 'Successfully authenticated and connected to Supabase PostgreSQL database with service-role access.'
          : 'Successfully connected to Supabase with the public key. Supply SUPABASE_SERVICE_ROLE_KEY for privileged operations.',
      };
    } catch (err: any) {
      this.logger.error(`Supabase connectivity check error: ${err.message}`);
      return {
        connected: false,
        url: this.supabaseUrl,
        configured: true,
        latencyMs,
        storageOnline,
        authOnline,
        message: 'Supabase project is reachable, but query failed with provided credentials.',
        error: err.message,
      };
    }
  }
}
