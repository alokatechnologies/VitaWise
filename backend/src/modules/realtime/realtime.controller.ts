import { Controller, Get } from '@nestjs/common';
import { RealtimeService } from './realtime.service';

@Controller('api/v1/realtime')
export class RealtimeController {
  constructor(private readonly realtimeService: RealtimeService) {}

  @Get('status')
  async getStatus() {
    return this.realtimeService.getRealtimeStatus();
  }
}
