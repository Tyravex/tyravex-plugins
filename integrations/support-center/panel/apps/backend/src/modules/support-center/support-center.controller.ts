import { SupportRateLimitFilter } from './mutations/support-rate-limit.exception';
import {
  Body,
  Headers,
  Controller,
  Get,
  Header,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
  UseFilters,
} from '@nestjs/common';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import {
  SupportCenterService,
  type SupportActor,
} from './support-center.service';
import {
  CreateSupportTicketDto,
  SupportAccessRequestDto,
  SupportGrantDecisionDto,
  SupportMessageDto,
  SupportStatusDto,
  SupportWorkspaceDto,
} from './support-center.dto';
import {
  SupportListQueryDto,
  SupportViewQueryDto,
} from './workflow/support-workflow.dto';

@Controller('support')
@UseGuards(JwtAuthGuard)
@UseFilters(SupportRateLimitFilter)
export class SupportCenterController {
  constructor(private readonly support: SupportCenterService) {}
  @Get('availability') @Header('Cache-Control', 'no-store') availability() {
    return this.support.availability();
  }
  @Get('services') @Header('Cache-Control', 'no-store') services(
    @Req() req: { user: SupportActor },
    @Query() query: SupportViewQueryDto,
  ) {
    return this.support.services(req.user, query.staff === 'true');
  }
  @Get('tickets') @Header('Cache-Control', 'no-store') list(
    @Req() req: { user: SupportActor },
    @Query() query: SupportListQueryDto,
  ) {
    return this.support.list(req.user, query.staff === 'true', query);
  }
  @Post('tickets') create(
    @Req() req: { user: SupportActor },
    @Body() body: CreateSupportTicketDto,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.support.create(req.user, body, key);
  }
  @Get('tickets/:id') @Header('Cache-Control', 'no-store') detail(
    @Req() req: { user: SupportActor },
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: SupportViewQueryDto,
  ) {
    return this.support.detail(id, req.user, query);
  }
  @Post('tickets/:id/messages') message(
    @Req() req: { user: SupportActor },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SupportMessageDto,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.support.message(id, req.user, body.body, key);
  }
  @Post('tickets/:id/status') status(
    @Req() req: { user: SupportActor },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SupportStatusDto,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.support.changeStatus(id, req.user, body.status, key);
  }
  @Post('tickets/:id/access') access(
    @Req() req: { user: SupportActor },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SupportAccessRequestDto,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.support.requestAccess(id, req.user, body, key);
  }
  @Post('tickets/:id/access/:grantId') decision(
    @Req() req: { user: SupportActor },
    @Param('id', ParseUUIDPipe) id: string,
    @Param('grantId', ParseUUIDPipe) grantId: string,
    @Body() body: SupportGrantDecisionDto,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.support.decide(id, grantId, req.user, body.decision, key);
  }
  @Post('tickets/:id/workspace') workspace(
    @Req() req: { user: SupportActor },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SupportWorkspaceDto,
  ) {
    return this.support.execute(id, req.user, body);
  }
}
