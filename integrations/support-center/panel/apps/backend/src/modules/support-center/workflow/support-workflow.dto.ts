import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class SupportViewQueryDto {
  @IsOptional() @IsIn(['true', 'false']) staff?: string;
}
export class SupportListQueryDto extends SupportViewQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100000) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit?: number;
  @IsOptional() @IsString() @MaxLength(160) q?: string;
  @IsOptional()
  @IsIn(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'])
  status?: string;
  @IsOptional() @IsString() @MaxLength(100) serviceId?: string;
  @IsOptional()
  @Matches(/^(all|me|unassigned|[1-9][0-9]{0,8})$/)
  assignee?: string;
  @IsOptional() @IsIn(['true', 'false']) unread?: string;
}
export class SupportCursorQueryDto extends SupportViewQueryDto {
  @IsOptional() @IsUUID() before?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit?: number;
}
export class SupportAssigneeDto {
  @ValidateIf((_object, value) => value !== null) @IsInt() @Min(1) staffId!:
    | number
    | null;
}
export class SupportReadDto {
  @IsUUID() throughMessageId!: string;
}
