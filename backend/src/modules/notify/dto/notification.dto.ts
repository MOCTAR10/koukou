import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

export class ListNotificationsDto {
  @ApiPropertyOptional({ description: 'true : non lues seulement' })
  @IsOptional()
  @Transform(({ value }) =>
    value === 'true' ? true : value === 'false' ? false : value,
  )
  @IsBoolean({ message: 'unread doit valoir true ou false.' })
  unread?: boolean;

  @ApiPropertyOptional({ description: 'Plus anciennes que cette date (pagination)' })
  @IsOptional()
  @IsDateString({}, { message: 'before doit être une date ISO.' })
  before?: string;

  @ApiPropertyOptional({ default: 50, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'limit doit être un entier.' })
  @Min(1, { message: 'limit doit valoir au moins 1.' })
  @Max(200, { message: 'limit vaut au plus 200.' })
  limit?: number;
}

export class DeliveredNotificationsDto {
  @ApiProperty({ type: [String] })
  @IsArray({ message: 'ids doit être une liste.' })
  @ArrayMaxSize(200, { message: '200 notifications au plus.' })
  @IsUUID('4', { each: true, message: 'Identifiant de notification invalide.' })
  ids: string[];
}
