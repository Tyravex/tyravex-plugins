import { SupportRateLimitFilter } from '../mutations/support-rate-limit.exception';
import {
  Body,
  Headers,
  Controller,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
  UseGuards,
  UseFilters,
} from '@nestjs/common';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import type { SupportActor } from '../support-context';
import { SupportConsentService } from './support-consent.service';
import { SupportOwnerAccessDto } from './support-consent.dto';

@Controller('support')
@UseGuards(JwtAuthGuard)
@UseFilters(SupportRateLimitFilter)
export class SupportConsentController {
  constructor(private readonly consent: SupportConsentService) {}

  @Post('tickets/:id/owner-access')
  grant(
    @Req() req: { user: SupportActor },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SupportOwnerAccessDto,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.consent.grantToAssignee(id, req.user, body, key);
  }
}
