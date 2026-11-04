import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { configuration } from './config/configuration';
import { validateEnvironment } from './config/env.validation';
import { SupabaseModule } from './modules/supabase/supabase.module';
import { DatabaseModule } from './modules/database/database.module';
import { HealthModule } from './modules/health/health.module';
import { QueueModule } from './modules/queue/queue.module';
import { AuthModule } from './modules/auth/auth.module';
import { ClinicalModule } from './modules/clinical/clinical.module';
import { AiModule } from './modules/ai/ai.module';
import { StorageModule } from './modules/storage/storage.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { RequiredModule } from './modules/required/required.module';
import { FamilyModule } from './modules/family/family.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../.env', '.env'],
      load: [configuration],
      validate: validateEnvironment,
    }),
    SupabaseModule,
    DatabaseModule,
    QueueModule,
    HealthModule,
    AuthModule,
    ClinicalModule,
    AiModule,
    StorageModule,
    RealtimeModule,
    RequiredModule,
    FamilyModule,
  ],
})
export class AppModule {}
