import { Type } from 'class-transformer';
import {
  ArrayMinSize, IsArray, IsBoolean, IsEnum, IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength, ValidateNested,
} from 'class-validator';

export enum RuleStateDto    { USER = 'USER', AI_DRAFTED = 'AI_DRAFTED', APPROVED = 'APPROVED', DENIED = 'DENIED' }
export enum RuleFieldDto    { DESCRIPTION = 'DESCRIPTION', AMOUNT = 'AMOUNT', VENDOR = 'VENDOR', ACCOUNT = 'ACCOUNT' }
export enum RuleOperatorDto {
  CONTAINS = 'CONTAINS', EQUALS = 'EQUALS', STARTS_WITH = 'STARTS_WITH', ENDS_WITH = 'ENDS_WITH',
  GT = 'GT', LT = 'LT', BETWEEN = 'BETWEEN', IN = 'IN',
}

export class RuleConditionDto {
  @IsEnum(RuleFieldDto) field!: RuleFieldDto;
  @IsEnum(RuleOperatorDto) operator!: RuleOperatorDto;
  @IsString() value!: string;
  @IsString() @IsOptional() value2?: string;
  @IsArray() @IsString({ each: true }) @IsOptional() valueList?: string[];
}

export class CreateRuleDto {
  @IsString() @MinLength(1) @MaxLength(200) name!: string;
  @IsUUID() categoryId!: string;
  @IsUUID() @IsOptional() vendorId?: string;
  @IsString() @IsOptional() @MaxLength(2000) noteOnApply?: string;
  @IsBoolean() @IsOptional() isActive?: boolean;
  @IsArray() @ValidateNested({ each: true }) @Type(() => RuleConditionDto) @ArrayMinSize(1) conditions!: RuleConditionDto[];
}

export class UpdateRuleDto {
  @IsString() @IsOptional() @MinLength(1) @MaxLength(200) name?: string;
  @IsUUID() @IsOptional() categoryId?: string;
  @IsUUID() @IsOptional() vendorId?: string;
  @IsString() @IsOptional() @MaxLength(2000) noteOnApply?: string;
  @IsBoolean() @IsOptional() isActive?: boolean;
  @IsArray() @ValidateNested({ each: true }) @Type(() => RuleConditionDto) @ArrayMinSize(1) @IsOptional() conditions?: RuleConditionDto[];
}

export class MoveRuleDto {
  @IsIn(['up', 'down']) direction!: 'up' | 'down';
}

export class SetRuleStateDto {
  @IsEnum(RuleStateDto) state!: RuleStateDto;
}

export class ToggleRuleActiveDto {
  @IsBoolean() isActive!: boolean;
}
