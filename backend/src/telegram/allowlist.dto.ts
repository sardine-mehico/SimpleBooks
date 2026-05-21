import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateAllowlistDto {
  @IsString()
  @MinLength(3)
  @MaxLength(33)
  @Matches(/^@?[A-Za-z0-9_]{3,32}$/, { message: 'username must be 3-32 chars, letters/digits/underscore only' })
  username!: string;

  @IsString()
  @IsOptional()
  @MaxLength(120)
  user?: string;

  @IsString()
  @IsOptional()
  @MaxLength(120)
  botName?: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  botToken?: string;

  @IsString()
  @IsOptional()
  @MaxLength(280)
  note?: string;
}
