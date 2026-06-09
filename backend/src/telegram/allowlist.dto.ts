import { IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';

export class CreateAllowlistDto {
  @IsString()
  @MinLength(3)
  @MaxLength(33)
  @Matches(/^@?[A-Za-z0-9_]{3,32}$/, { message: 'username must be 3-32 chars, letters/digits/underscore only' })
  username!: string;

  // FK to the SimpleBooks user the bot will act as for this Telegram
  // handle. Bot rejects commands from rows with no linked user.
  @IsUUID() userId!: string;

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

// Every field optional — PATCH semantics. Username + userId are still
// validated when present.
export class UpdateAllowlistDto {
  @IsString()
  @IsOptional()
  @MinLength(3)
  @MaxLength(33)
  @Matches(/^@?[A-Za-z0-9_]{3,32}$/, { message: 'username must be 3-32 chars, letters/digits/underscore only' })
  username?: string;

  @IsOptional() @IsUUID() userId?: string;

  @IsString() @IsOptional() @MaxLength(120) botName?: string;
  @IsString() @IsOptional() @MaxLength(255) botToken?: string;
  @IsString() @IsOptional() @MaxLength(280) note?: string;
}
