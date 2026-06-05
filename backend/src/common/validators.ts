import {
  ValidatorConstraint,
  ValidatorConstraintInterface,
  ValidationArguments,
} from 'class-validator';

@ValidatorConstraint({ name: 'nonEmptyHtml', async: false })
export class IsNonEmptyHtml implements ValidatorConstraintInterface {
  validate(value: unknown) {
    if (typeof value !== 'string') return false;
    return value.replace(/<[^>]*>/g, '').replace(/ /g, ' ').trim().length > 0;
  }
  defaultMessage(args: ValidationArguments) {
    return `${args.property} must contain non-whitespace content`;
  }
}

// class-transformer's @Type(() => Number) coerces empty string to 0. This
// keeps empty / null as undefined so @IsNumber() can reject them properly.
export function toNumberOrUndefined({ value }: { value: unknown }) {
  if (value === '' || value === null || value === undefined) return undefined;
  const n = Number(value);
  return Number.isNaN(n) ? value : n;
}
