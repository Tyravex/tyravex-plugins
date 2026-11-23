import { IsInt, Max, Min } from 'class-validator';
import { SupportAccessRequestDto } from '../support-center.dto';

export class SupportOwnerAccessDto extends SupportAccessRequestDto {
  @IsInt() @Min(1) @Max(2147483647) staffId!: number;
}
