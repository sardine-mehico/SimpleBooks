import { Body, Controller, Get, Put } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PreferencesService } from './preferences.service';
import { UpsertPreferencesDto, UpsertTermsDto } from './dto';
import { Capability } from '../auth/roles.decorator';

@ApiTags('preferences')
@Controller('preferences')
export class PreferencesController {
  constructor(private prefs: PreferencesService) {}

  @Get() get() { return this.prefs.get(); }
  @Put() save(@Body() dto: UpsertPreferencesDto) { return this.prefs.save(dto); }

  // Narrow Terms endpoints — gated by `settings.terms` so bookkeepers can
  // edit even though they don't have full `settings.preferences`. Accountants
  // are explicitly denied (see capabilities.ts).
  @Get('terms')
  @Capability('settings.terms')
  async getTerms() {
    const text = await this.prefs.getDefaultInvoiceTerms();
    return { defaultInvoiceTerms: text };
  }

  @Put('terms')
  @Capability('settings.terms')
  async saveTerms(@Body() dto: UpsertTermsDto) {
    const text = dto.defaultInvoiceTerms ?? null;
    const row = await this.prefs.setDefaultInvoiceTerms(text === '' ? null : text);
    return { defaultInvoiceTerms: row.defaultInvoiceTerms };
  }
}
