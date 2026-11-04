export interface VitaWiseConfig {
  port: number;
  environment: string;
  supabase: {
    url: string;
    serviceRoleKey: string | null;
    anonKey: string | null;
  };
  database: {
    url: string | null;
  };
  ai: {
    geminiApiKey: string | null;
  };
  redis: {
    url: string | null;
    enabled: boolean;
  };
}

export const configuration = (): VitaWiseConfig => {
  const redisUrl = process.env.REDIS_URL?.trim() || null;
  return {
    port: parseInt(process.env.PORT || '3000', 10),
    environment: process.env.NODE_ENV || 'development',
    supabase: {
      url: process.env.SUPABASE_URL || 'https://zvxqvelosmswdwntnpbe.supabase.co',
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || null,
      anonKey: process.env.SUPABASE_ANON_KEY || null,
    },
    database: {
      url: process.env.DATABASE_URL || null,
    },
    ai: {
      geminiApiKey: process.env.GEMINI_API_KEY || null,
    },
    redis: {
      url: redisUrl,
      enabled: Boolean(redisUrl && redisUrl.length > 0),
    },
  };
};
