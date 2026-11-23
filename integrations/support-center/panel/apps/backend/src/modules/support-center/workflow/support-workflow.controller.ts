import { SupportRateLimitFilter } from '../mutations/support-rate-limit.exception';
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
import type { SupportActor } from '../support-context';
import { SupportMessageDto } from '../support-center.dto';
import {
  SupportAssigneeDto,
  SupportCursorQueryDto,
  SupportReadDto,
  SupportViewQueryDto,
} from './support-workflow.dto';
import { SupportWorkflowService } from './support-workflow.service';

@Controller('support')
@UseGuards(JwtAuthGuard)
@UseFilters(SupportRateLimitFilter)
export class SupportWorkflowController {
  constructor(private readonly workflow: SupportWorkflowService) {}
  @Get('staff') @Header('Cache-Control', 'no-store') staff(
    @Req() req: { user: SupportActor },
  ) {
    return this.workflow.staffList(req.user);
  }
  @Get('unread') @Header('Cache-Control', 'no-store') unread(
    @Req() req: { user: SupportActor },
    @Query() query: SupportViewQueryDto,
  ) {
    return this.workflow.unread(req.user, query.staff === 'true');
  }
  @Get('services/:serviceId/access')
  @Header('Cache-Control', 'no-store')
  access(@Req() req: { user: SupportActor }, @Param('serviceId') id: string) {
    return this.workflow.activeAccess(id, req.user);
  }
  @Post('tickets/:id/claim') claim(
    @Req() req: { user: SupportActor },
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.workflow.assign(id, req.user, req.user.id, true, key);
  }
  @Post('tickets/:id/assignee') assign(
    @Req() req: { user: SupportActor },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SupportAssigneeDto,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.workflow.assign(id, req.user, body.staffId, false, key);
  }
  @Post('tickets/:id/notes') note(
    @Req() req: { user: SupportActor },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SupportMessageDto,
    @Headers('idempotency-key') key?: string,
  ) {
    return this.workflow.note(id, req.user, body.body, key);
  }
  @Post('tickets/:id/read') read(
    @Req() req: { user: SupportActor },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: SupportReadDto,
  ) {
    return this.workflow.markRead(id, req.user, body.throughMessageId);
  }
  @Get('tickets/:id/messages') @Header('Cache-Control', 'no-store') messages(
    @Req() req: { user: SupportActor },
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: SupportCursorQueryDto,
  ) {
    return this.workflow.page(id, req.user, query, 'messages');
  }
  @Get('tickets/:id/events') @Header('Cache-Control', 'no-store') events(
    @Req() req: { user: SupportActor },
    @Param('id', ParseUUIDPipe) id: string,
    @Query() query: SupportCursorQueryDto,
  ) {
    return this.workflow.page(id, req.user, query, 'events');
  }
}
