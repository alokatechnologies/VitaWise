import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool, QueryResult } from 'pg';

export interface DatabaseHealthResult {
  connected: boolean;
  configured: boolean;
  latencyMs: number | null;
  serverTime?: string;
  postgresVersion?: string;
  pgvectorInstalled?: boolean;
  message: string;
  error?: string;
}

export interface SchemaInspectionResult {
  inspectedAt: string;
  tables: Array<{
    tableName: string;
    tableSchema: string;
    columnCount: number;
    rowCountEstimate: number;
  }>;
  extensions: string[];
  message: string;
}

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name);
  private pool: Pool | null = null;
  private readonly connectionString: string | null;

  constructor(private readonly configService: ConfigService) {
    this.connectionString = this.configService.get<string>('database.url');

    if (this.connectionString) {
      try {
        this.pool = new Pool({
          connectionString: this.connectionString,
          ssl: {
            rejectUnauthorized: false, // Required for Supabase SSL connections
          },
          max: 10,
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 5000,
        });
        this.logger.log('PostgreSQL connection pool initialized for Supabase database');
      } catch (err: any) {
        this.logger.error(`Failed to initialize Postgres pool: ${err.message}`);
      }
    } else {
      this.logger.warn('DATABASE_URL is not set. Direct PostgreSQL pool is unconfigured.');
    }
  }

  isConfigured(): boolean {
    return !!this.pool;
  }

  async query<T = any>(text: string, params?: any[]): Promise<QueryResult<T>> {
    if (!this.pool) {
      throw new Error('Database pool not configured. Please supply DATABASE_URL.');
    }
    return this.pool.query<T>(text, params);
  }

  async checkConnectivity(): Promise<DatabaseHealthResult> {
    if (!this.pool) {
      return {
        connected: false,
        configured: false,
        latencyMs: null,
        message: 'PostgreSQL direct pool is not configured. Supply DATABASE_URL in .env to enable direct relational queries.',
      };
    }

    const start = Date.now();
    try {
      // Execute safe non-destructive query
      const result = await this.pool.query('SELECT NOW() as server_time, version() as version;');
      const latencyMs = Date.now() - start;

      // Check for pgvector extension
      let pgvectorInstalled = false;
      try {
        const extResult = await this.pool.query("SELECT extname FROM pg_extension WHERE extname = 'vector';");
        pgvectorInstalled = extResult.rows.length > 0;
      } catch {
        pgvectorInstalled = false;
      }

      return {
        connected: true,
        configured: true,
        latencyMs,
        serverTime: result.rows[0]?.server_time,
        postgresVersion: result.rows[0]?.version?.split(' ')?.[0] + ' ' + result.rows[0]?.version?.split(' ')?.[1],
        pgvectorInstalled,
        message: 'Successfully executed safe query against PostgreSQL database.',
      };
    } catch (err: any) {
      this.logger.error(`PostgreSQL connectivity error: ${err.message}`);
      return {
        connected: false,
        configured: true,
        latencyMs: Date.now() - start,
        message: 'Failed to connect to PostgreSQL database using DATABASE_URL.',
        error: err.message,
      };
    }
  }

  async inspectSchema(): Promise<SchemaInspectionResult> {
    if (!this.pool) {
      return {
        inspectedAt: new Date().toISOString(),
        tables: [],
        extensions: [],
        message: 'Cannot inspect schema: DATABASE_URL is not set.',
      };
    }

    try {
      const tablesQuery = `
        SELECT 
          table_schema, 
          table_name,
          COUNT(column_name) as column_count
        FROM information_schema.columns
        WHERE table_schema NOT IN ('information_schema', 'pg_catalog')
        GROUP BY table_schema, table_name
        ORDER BY table_schema, table_name;
      `;
      const tablesRes = await this.pool.query(tablesQuery);

      const extQuery = `SELECT extname FROM pg_extension;`;
      const extRes = await this.pool.query(extQuery);

      return {
        inspectedAt: new Date().toISOString(),
        tables: tablesRes.rows.map((r: any) => ({
          tableSchema: r.table_schema,
          tableName: r.table_name,
          columnCount: parseInt(r.column_count, 10),
          rowCountEstimate: 0,
        })),
        extensions: extRes.rows.map((r: any) => r.extname),
        message: `Inspected database: found ${tablesRes.rows.length} user tables and ${extRes.rows.length} extensions.`,
      };
    } catch (err: any) {
      return {
        inspectedAt: new Date().toISOString(),
        tables: [],
        extensions: [],
        message: `Schema inspection failed: ${err.message}`,
      };
    }
  }

  async onModuleDestroy() {
    if (this.pool) {
      await this.pool.end();
      this.logger.log('PostgreSQL pool drained and closed.');
    }
  }
}
