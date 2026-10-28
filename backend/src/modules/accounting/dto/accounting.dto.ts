import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
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
  @IsDateString({}, { message: 'Date invalide (format AAAA-MM-JJ).' })
  date: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  label: string;

  // Without @ValidateNested the line validators never ran: negative debit /
  // credit pairs passed the zero-sum balance check.
  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => RegularisationLineDto)
  lines: RegularisationLineDto[];
}