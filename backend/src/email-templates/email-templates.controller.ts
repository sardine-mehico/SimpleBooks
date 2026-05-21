import { Controller, Get, Param } from '@nestjs/common';
import { EmailTemplatesService } from './email-templates.service';

// Catalogue is seeded and immutable post-seed. The write endpoints
// (POST/PATCH/DELETE) were removed when the Settings/Email Templates page
// was retired — the Send Invoice dialog reads templates via /send-context,
// so only the list/get endpoints remain.
@Controller('email-templates')
export class EmailTemplatesController {
  constructor(private svc: EmailTemplatesService) {}

  @Get() list() { return this.svc.list(); }
  @Get(':id') get(@Param('id') id: string) { return this.svc.get(id); }
}
