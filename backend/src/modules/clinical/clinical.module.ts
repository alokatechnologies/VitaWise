import { Module } from '@nestjs/common';
import { ClinicalService } from './clinical.service';
import { ClinicalController } from './clinical.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [ClinicalController],
  providers: [ClinicalService],
  exports: [ClinicalService],
})
export class ClinicalModule {}
