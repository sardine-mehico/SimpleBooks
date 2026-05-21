import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateAccountTypeDto {
  @IsString() @MinLength(1) @MaxLength(60) name!: string;
  @IsBoolean() @IsOptional() isActive?: boolean;
}

export class UpdateAccountTypeDto {
  @IsString() @IsOptional() @MinLength(1) @MaxLength(60) name?: string;
  @IsBoolean() @IsOptional() isActive?: boolean;
}
