import { Module } from '@nestjs/common';
import { ServicesModule } from '@/modules/services/services.module';
import { SupportCenterController } from './support-center.controller';
import { SupportCenterService } from './support-center.service';
import { SupportWorkflowController } from './workflow/support-workflow.controller';
import { SupportWorkflowService } from './workflow/support-workflow.service';
import { SupportConsentService } from './access/support-consent.service';
import { SupportConsentController } from './access/support-consent.controller';
import { NotificationsModule } from '@/modules/notifications/notifications.module';
import { SupportMutationService } from './mutations/support-mutation.service';

@Module({
  imports: [ServicesModule, NotificationsModule],
  controllers: [
    SupportCenterController,
    SupportWorkflowController,
    SupportConsentController,
  ],
  providers: [
    SupportMutationService,
    SupportCenterService,
    SupportWorkflowService,
    SupportConsentService,
  ],
})
export class SupportCenterModule {}
