import { Body, Controller, Get, Put } from '@nestjs/common';
import { PreferencesService } from './preferences.service';
import { UpsertPreferencesDto } from './dto';

@Controller('preferences')
export class PreferencesController {
  constructor(private prefs: PreferencesService) {}

  @Get() get() { return this.prefs.get(); }
  @Put() save(@Body() dto: UpsertPreferencesDto) { return this.prefs.save(dto); }
}
