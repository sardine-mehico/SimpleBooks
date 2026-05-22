import { Module } from '@nestjs/common';
import { AiProvidersController } from './ai-providers.controller';
import { AiProvidersService } from './ai-providers.service';

@Module({
  controllers: [AiProvidersController],
  providers: [AiProvidersService],
  exports: [AiProvidersService],
})
export class AiProvidersModule {}
