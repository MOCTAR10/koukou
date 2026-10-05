import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class RegularisationLineDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(8)
  account: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  label?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  debitFcfa?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  creditFcfa?: number;
}

export class CreateRegularisationDto {
  @IsString()
  @IsNotEmpty()
  date: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  label: string;

  @ArrayMinSize(2)
  @Type(() => RegularisationLineDto)
  lines: RegularisationLineDto[];
}