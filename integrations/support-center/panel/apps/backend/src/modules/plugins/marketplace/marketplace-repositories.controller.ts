import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';

import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { Permissions } from '@/rbac/decorators/permissions.decorator';
import { PermissionsGuard } from '@/rbac/guards/permissions.guard';

import { CreateMarketplaceRepositoryDto } from './dto/create-marketplace-repository.dto';
import { UpdateMarketplaceRepositoryDto } from './dto/update-marketplace-repository.dto';
import { MarketplaceRepositoriesService } from './marketplace-repositories.service';
import { MarketplaceCommunityRegistryService } from './marketplace-community-registry.service';
import { MarketplaceRegistryService } from './marketplace-registry.service';
import { NativePluginCatalogService } from './native/native-plugin-catalog.service';

@Controller('admin/plugins/marketplace/repositories')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Permissions('marketplace:manage')
export class MarketplaceRepositoriesController {
  constructor(
    private readonly repositoriesService: MarketplaceRepositoriesService,
    private readonly communityRegistryService: MarketplaceCommunityRegistryService,
    private readonly officialRegistryService: MarketplaceRegistryService,
    private readonly nativeCatalog: NativePluginCatalogService,
  ) {}

  @Get()
  @Permissions('plugin:read')
  @Header('Cache-Control', 'no-store')
  list() {
    return this.repositoriesService.list();
  }

  @Get(':id')
  @Permissions('plugin:read')
  @Header('Cache-Control', 'no-store')
  getById(@Param('id') id: string) {
    return this.repositoriesService.getById(id);
  }

  @Get(':id/plugins')
  @Permissions('plugin:read')
  @Header('Cache-Control', 'no-store')
  async listPlugins(
    @Param('id') id: string,
    @Query('refresh') refresh?: string,
  ) {
    const repository = await this.repositoriesService.getById(id);

    if (repository.isOfficial) {
      const [registry, nativeCatalog] = await Promise.all([
        this.officialRegistryService.getOfficialRegistry(refresh === 'true'),
        this.nativeCatalog.getCatalog(refresh === 'true'),
      ]);
      return { ...registry, nativeCatalog };
    }

    return this.communityRegistryService.getRegistry(repository.url);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Header('Cache-Control', 'no-store')
  create(@Body() dto: CreateMarketplaceRepositoryDto) {
    return this.repositoriesService.create(dto);
  }

  @Patch(':id')
  @Header('Cache-Control', 'no-store')
  update(@Param('id') id: string, @Body() dto: UpdateMarketplaceRepositoryDto) {
    return this.repositoriesService.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Header('Cache-Control', 'no-store')
  async remove(@Param('id') id: string): Promise<void> {
    await this.repositoriesService.remove(id);
  }
}
