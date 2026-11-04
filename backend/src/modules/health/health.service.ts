import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { DatabaseService } from '../database/database.service';
import { QueueService } from '../queue/queue.service';

@Injectable()
export class HealthService {
  private readonly startTime = Date.now();

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly databaseService: DatabaseService,
    private readonly queueService: QueueService,
  ) {}

  async getHealthStatus() {
    const supabaseCheck = await this.supabaseService.checkConnectivity();
    const databaseCheck = await this.databaseService.checkConnectivity();
    const queueCheck = this.queueService.getHealth();

    return {
      status: 'ok',
      service: 'VitaWise Health Intelligence Engine',
      version: '1.2.0',
      uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
      timestamp: new Date().toISOString(),
      platform: 'VitaWise Health Intelligence Platform',
      tracksSupported: [
        'Track 1: PCOS Awareness & Women Wellness',
        'Track 2: National Nutrition Week',
      ],
      connectivity: {
        supabase: {
          status: supabaseCheck.connected ? 'online' : 'unreachable',
          configured: supabaseCheck.configured,
          url: supabaseCheck.url,
          storageOnline: supabaseCheck.storageOnline,
          authOnline: supabaseCheck.authOnline,
          latencyMs: supabaseCheck.latencyMs,
          message: supabaseCheck.message,
        },
        database: {
          status: databaseCheck.connected ? 'online' : (databaseCheck.configured ? 'error' : 'unconfigured'),
          configured: databaseCheck.configured,
          latencyMs: databaseCheck.latencyMs,
          serverTime: databaseCheck.serverTime || null,
          postgresVersion: databaseCheck.postgresVersion || null,
          pgvectorInstalled: databaseCheck.pgvectorInstalled || false,
          message: databaseCheck.message,
          error: databaseCheck.error || null,
        },
        queue: queueCheck,
      },
      aiOrchestration: 'Deterministic Rules + RAG (pgvector) + Gemini 3.6 Flash',
      androidApkReady: true,
    };
  }

  async getDatabaseHealth() {
    const databaseCheck = await this.databaseService.checkConnectivity();
    const supabaseCheck = await this.supabaseService.checkConnectivity();
    const schemaInspection = await this.databaseService.inspectSchema();

    return {
      status: databaseCheck.connected && supabaseCheck.connected ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      supabase: {
        url: supabaseCheck.url,
        configured: supabaseCheck.configured,
        storageEndpointOnline: supabaseCheck.storageOnline,
        authEndpointOnline: supabaseCheck.authOnline,
        latencyMs: supabaseCheck.latencyMs,
        message: supabaseCheck.message,
      },
      postgres: {
        configured: databaseCheck.configured,
        connected: databaseCheck.connected,
        latencyMs: databaseCheck.latencyMs,
        serverTime: databaseCheck.serverTime || null,
        postgresVersion: databaseCheck.postgresVersion || null,
        pgvectorInstalled: databaseCheck.pgvectorInstalled || false,
        message: databaseCheck.message,
        error: databaseCheck.error || null,
      },
      schema: {
        tablesCount: schemaInspection.tables.length,
        tables: schemaInspection.tables,
        extensions: schemaInspection.extensions,
        summary: schemaInspection.message,
      },
    };
  }
}
