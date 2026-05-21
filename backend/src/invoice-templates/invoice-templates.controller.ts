import { Controller, Get, Param } from '@nestjs/common';
import { InvoiceTemplatesService } from './invoice-templates.service';

// Catalogue is seeded and immutable post-seed. The write endpoints
// (POST/PATCH/DELETE) were removed when the Settings/Invoice Templates page
// was retired. Only the list/get endpoints remain for any future internal
// callers that need to enumerate the catalogue.
@Controller('invoice-templates')
export class InvoiceTemplatesController {
  constructor(private svc: InvoiceTemplatesService) {}

  @Get() list() { return this.svc.list(); }
  @Get(':id') get(@Param('id') id: string) { return this.svc.get(id); }
}
