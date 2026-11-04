import { Controller, Post, Body, UseGuards, Req } from '@nestjs/common';
import { AiService, AiAssessmentRequestDto } from './ai.service';
import { SupabaseAuthGuard } from '../auth/auth.guard';

@Controller('api/v1/ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('assess')
  @UseGuards(SupabaseAuthGuard)
  async assess(@Req() req: any, @Body() dto: AiAssessmentRequestDto) {
    return this.aiService.runAssessment(req.user.id, dto);
  }

  @Post('consult')
  @UseGuards(SupabaseAuthGuard)
  async consult(@Body() body: { prompt?: string; lang?: 'en' | 'te'; track?: string }) {
    return this.aiService.consult(body.prompt || '', body.lang || 'en', body.track || 'pcos');
  }
}
