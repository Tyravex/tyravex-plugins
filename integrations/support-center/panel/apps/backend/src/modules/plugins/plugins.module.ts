import {
  Module,
  RequestMethod,
  type MiddlewareConsumer,
  type NestModule,
} from '@nestjs/common';
import { raw } from 'express';
import { PluginUpdaterController } from './updates/plugin-updater.controller';
import { PluginUpdaterService } from './updates/plugin-updater.service';
import { PluginCatalogUpdateController } from './updates/catalog/plugin-catalog-update.controller';
import { PluginCatalogUpdateService } from './updates/catalog/plugin-catalog-update.service';
import { PluginPackageDownloadService } from './updates/catalog/plugin-package-download.service';
import { FunctionalPluginController } from './functional/functional-plugin.controller';
import { FunctionalPluginInstallerService } from './functional/functional-plugin-installer.service';
import { NativePluginCatalogService } from './marketplace/native/native-plugin-catalog.service';

import { PrismaModule } from '@/prisma/prisma.module';
import { RbacModule } from '@/rbac/rbac.module';

import { MarketplaceController } from './marketplace/marketplace.controller';
import { MarketplaceRegistryService } from './marketplace/marketplace-registry.service';
import { MarketplaceRepositoriesController } from './marketplace/marketplace-repositories.controller';
import { MarketplaceRepositoriesService } from './marketplace/marketplace-repositories.service';
import { MarketplaceCommunityRegistryService } from './marketplace/marketplace-community-registry.service';

import { PluginInstallerService } from './installation/plugin-installer.service';
import { PluginsController } from './plugins.controller';
import { PluginsService } from './plugins.service';

import { PluginLifecycleController } from './lifecycle/plugin-lifecycle.controller';
import { PluginLifecycleService } from './lifecycle/plugin-lifecycle.service';

import { PluginCleanupClaimService } from './recovery/plugin-cleanup-claim.service';
import { PluginRecoveryCoordinatorService } from './recovery/plugin-recovery-coordinator.service';
import { PluginRecoveryFilesystemLockService } from './recovery/plugin-recovery-filesystem-lock.service';
import { PluginRecoveryLockService } from './recovery/plugin-recovery-lock.service';
import { PluginUninstallationCleanupService } from './recovery/plugin-uninstallation-cleanup.service';
import { PluginUninstallationRecovery } from './recovery/plugin-uninstallation-recovery';
import { PluginUninstallerController } from './uninstallation/plugin-uninstaller.controller';
import { PluginUninstallerService } from './uninstallation/plugin-uninstaller.service';

export const MAX_PLUGIN_UPLOAD_BYTES = 20 * 1024 * 1024;

@Module({
  imports: [PrismaModule, RbacModule],

  controllers: [
    FunctionalPluginController,
    MarketplaceController,
    MarketplaceRepositoriesController,

    PluginsController,
    PluginUpdaterController,
    PluginCatalogUpdateController,
    PluginLifecycleController,
    PluginUninstallerController,
  ],

  providers: [
    FunctionalPluginInstallerService,
    NativePluginCatalogService,
    MarketplaceRegistryService,
    MarketplaceRepositoriesService,
    MarketplaceCommunityRegistryService,

    PluginsService,
    PluginInstallerService,
    PluginUpdaterService,
    PluginCatalogUpdateService,
    PluginPackageDownloadService,
    PluginLifecycleService,
    PluginUninstallerService,

    PluginUninstallationRecovery,
    PluginUninstallationCleanupService,

    PluginRecoveryLockService,
    PluginCleanupClaimService,
    PluginRecoveryFilesystemLockService,
    PluginRecoveryCoordinatorService,
  ],

  exports: [
    PluginsService,
    PluginInstallerService,
  ],
})
export class PluginsModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(
        raw({
          type: 'application/zip',
          limit: MAX_PLUGIN_UPLOAD_BYTES,
          inflate: false,
        }),
      )
      .forRoutes({ path: 'admin/plugins/:id/update-preview', method: RequestMethod.POST }, { path: 'admin/plugins/:id/update', method: RequestMethod.POST }, {
        path: 'admin/plugins/install',
        method: RequestMethod.POST,
      });
  }
}
