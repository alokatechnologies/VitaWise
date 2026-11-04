import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class RealtimeService {
  private readonly logger = new Logger(RealtimeService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly supabaseService: SupabaseService,
  ) {}

  async getRealtimeStatus() {
    const pubQuery = `
      SELECT schemaname, tablename 
      FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime'
      ORDER BY tablename;
    `;
    const res = await this.databaseService.query(pubQuery);

    return {
      status: 'active',
      publication: 'supabase_realtime',
      enabledTablesCount: res.rows.length,
      enabledTables: res.rows.map(r => r.tablename),
      websocketEndpoint: `${this.supabaseService.getUrl()}/realtime/v1/websocket`,
      architecture: 'User Action -> NestJS API -> Supabase PostgreSQL -> Realtime Replication Slot -> Android/Web Client Listener',
      channelsSupported: [
        'nutrition_logs:user_id=eq.{id}',
        'symptom_logs:user_id=eq.{id}',
        'cycle_logs:user_id=eq.{id}',
        'goals:user_id=eq.{id}',
        'notifications:user_id=eq.{id}',
      ],
    };
  }
}
