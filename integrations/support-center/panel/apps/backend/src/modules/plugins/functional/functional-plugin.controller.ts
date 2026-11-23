import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { IsBoolean, IsString, MaxLength } from 'class-validator';
import { JwtAuthGuard } from '@/modules/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '@/rbac/guards/permissions.guard';
import { Permissions } from '@/rbac/decorators/permissions.decorator';
import { FunctionalPluginInstallerService } from './functional-plugin-installer.service';
import { PluginRoleManagementService } from '@/rbac/plugin-roles/plugin-role-management.service';

class InstallLocalPluginDto {
  @IsString() @MaxLength(100) confirmation!: string;
}
class UninstallLocalPluginDto extends InstallLocalPluginDto {
  @IsBoolean() deleteData!: boolean;
}
class BindPluginRoleDto {
  @IsString() @MaxLength(100) roleId!: string;
  @IsString() @MaxLength(100) confirmation!: string;
}

@Controller('admin/local-plugins')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class FunctionalPluginController {
  constructor(
    private readonly installer: FunctionalPluginInstallerService,
    private readonly roles: PluginRoleManagementService,
  ) {}
  @Get('tyravex.support-center/role-candidates')
  @Header('Cache-Control', 'no-store')
  @Permissions('plugin:read', 'role:read')
  roleCandidates() {
    return this.roles.candidates();
  }
  @Post('tyravex.support-center/ticket-role')
  @Permissions('plugin:read', 'plugin:manage', 'role:read', 'role:manage')
  enableTicketRole(
    @Req() req: { user: { id: number } },
    @Body() body: BindPluginRoleDto,
  ) {
    return this.roles.enableTicketManagement(
      body.roleId,
      req.user.id,
      body.confirmation,
    );
  }
  @Post('tyravex.support-center/managed-role')
  @Permissions('plugin:read', 'plugin:manage', 'role:read', 'role:manage')
  bindRole(
    @Req() req: { user: { id: number } },
    @Body() body: BindPluginRoleDto,
  ) {
    return this.roles.bind(body.roleId, req.user.id, body.confirmation);
  }
  @Get()
  @Header('Cache-Control', 'no-store')
  @Permissions('plugin:read')
  catalog() {
    return this.installer.localCatalog();
  }
  @Post(':id/install') @Permissions('plugin:read', 'plugin:manage') install(
    @Req() req: { user: { id: number } },
    @Param('id') id: string,
    @Body() body: InstallLocalPluginDto,
  ) {
    return this.installer.install(id, req.user.id, body.confirmation);
  }
  @Post(':id/upgrade') @Permissions('plugin:read', 'plugin:manage') upgrade(
    @Req() req: { user: { id: number } },
    @Param('id') id: string,
    @Body() body: InstallLocalPluginDto,
  ) {
    return this.installer.upgrade(id, req.user.id, body.confirmation);
  }
  @Post(':id/uninstall') @Permissions('plugin:read', 'plugin:delete') uninstall(
    @Req() req: { user: { id: number } },
    @Param('id') id: string,
    @Body() body: UninstallLocalPluginDto,
  ) {
    return this.installer.uninstall(
      id,
      req.user.id,
      body.confirmation,
      body.deleteData,
    );
  }
}
