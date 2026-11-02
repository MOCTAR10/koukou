import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, Matches } from 'class-validator';

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const INVALID = 'Date invalide (format AAAA-MM-JJ).';

/** Optional reporting period; an invalid date used to reach SQL and return 500. */
export class MetricsPeriodQueryDto {
  @ApiPropertyOptional({ example: '2026-11-01' })
  @IsOptional()
  @Matches(DAY, { message: INVALID })
  @IsDateString({ strict: true }, { message: INVALID })
  from?: string;

  @ApiPropertyOptional({ example: '2026-11-30' })
  @IsOptional()
  @Matches(DAY, { message: INVALID })
  @IsDateString({ strict: true }, { message: INVALID })
  to?: string;
}
