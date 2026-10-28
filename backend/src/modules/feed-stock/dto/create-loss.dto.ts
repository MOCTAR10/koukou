import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { FeedUnit } from '../../../common/enums/food-type.enum.js';
import { FeedLossReason } from '../../../common/enums/feed-loss-reason.enum.js';
import { IdempotentDto } from '../../../common/utils/idempotency.js';

export class CreateLossDto extends IdempotentDto {
  @ApiProperty({
    description: "Lot d'intrant alimentaire affecté (traçabilité HACCP)",
  })
  @IsString()
  @IsNotEmpty({ message: 'Le lot d’intrant est obligatoire.' })
  inputLotId: string;

  @ApiProperty({ description: 'Quantité perdue', example: 3 })
  @IsNumber()
  @Min(0)
  quantity: number;

  @ApiPropertyOptional({
    enum: FeedUnit,
    description: 'Unité (SAC par défaut, KG possible)',
  })
  @IsOptional()
  @IsEnum(FeedUnit)
  unit?: FeedUnit;

  @ApiProperty({ enum: FeedLossReason, description: 'Cause de la perte' })
  @IsEnum(FeedLossReason)
  reason: FeedLossReason;

  @ApiPropertyOptional({
    description: 'Date de la perte (défaut : aujourd’hui)',
  })
  @IsOptional()
  @IsDateString()
  occurredAt?: string;

  @ApiPropertyOptional({ description: 'Remarques' })
  @IsOptional()
  @IsString()
  notes?: string;
}
