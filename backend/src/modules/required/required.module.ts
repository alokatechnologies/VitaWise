import { Module } from '@nestjs/common';
import { RequiredController } from './required.controller';
import { RequiredService } from './required.service';

@Module({
  controllers: [RequiredController],
  providers: [RequiredService],
})
export class RequiredModule {}
