import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsIn,
  IsInt,
  IsObject,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { SUPPORT_SCOPES } from '@shared/types';

export class CreateSupportTicketDto {
  @IsString() @MinLength(1) @MaxLength(100) serviceId!: string;
  @IsString() @MinLength(3) @MaxLength(160) subject!: string;
  @IsString() @MinLength(3) @MaxLength(8000) body!: string;
}
export class SupportMessageDto {
  @IsString() @MinLength(1) @MaxLength(8000) body!: string;
}
export class SupportStatusDto {
  @IsIn(['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED']) status!: string;
}
export class SupportAccessRequestDto {
  @IsString() @MinLength(10) @MaxLength(1000) reason!: string;
  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsIn(SUPPORT_SCOPES, { each: true })
  scopes!: string[];
  @IsInt() @Min(15) @Max(240) durationMinutes!: number;
}
export class SupportGrantDecisionDto {
  @IsIn(['APPROVE', 'REJECT', 'REVOKE']) decision!: string;
}
export class SupportWorkspaceDto {
  @IsUUID() grantId!: string;
  @IsIn(['runtime.status', 'files.list', 'files.read', 'files.write'])
  operation!: string;
  @IsObject() args!: Record<string, unknown>;
}
