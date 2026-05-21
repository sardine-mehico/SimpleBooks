import { IsString, IsUUID, IsOptional } from 'class-validator';

// /commit accepts multipart: a file + these JSON-ish form fields.
// `mapping` arrives as a JSON-stringified ColumnMapping (because multipart
// fields are strings); the controller JSON.parses it before passing in.
export class CommitImportDto {
  @IsUUID() accountId!: string;
  @IsString() fileSha256!: string;
  @IsString() mapping!: string;
  @IsString() @IsOptional() filename?: string;
}
