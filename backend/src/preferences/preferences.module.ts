import { Global, Module } from '@nestjs/common';
import { PreferencesController } from './preferences.controller';
import { PreferencesService } from './preferences.service';

// @Global so any module (recurring, dashboards, future cron jobs) can inject
// PreferencesService without importing PreferencesModule explicitly.
@Global()
@Module({
  controllers: [PreferencesController],
  providers: [PreferencesService],
  exports: [PreferencesService],
})
export class PreferencesModule {}
