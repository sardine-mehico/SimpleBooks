import { IsBoolean, IsEmail, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import type { UserRole } from '@prisma/client';

const ROLE_VALUES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'API_USER'] as const;

export class CreateUserDto {
  @IsString() @MinLength(2) @MaxLength(64) username!: string;
  @IsString() @MinLength(1) @MaxLength(120) displayName!: string;
  @IsOptional() @IsEmail() email?: string;
  @IsEnum(ROLE_VALUES) role!: UserRole;
  // API_USER rows authenticate via ApiKey; password is optional in that case.
  @IsOptional() @IsString() @MinLength(8) @MaxLength(128) password?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateUserDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) displayName?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsEnum(ROLE_VALUES) role?: UserRole;
  // Setting a password rotates it; absent leaves the existing hash alone.
  @IsOptional() @IsString() @MinLength(8) @MaxLength(128) password?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
