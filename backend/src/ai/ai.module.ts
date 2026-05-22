import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AiController } from './ai.controller';
import { AiClientService } from './ai-client.service';
import { AiCategoriserService } from './ai-categoriser.service';
import { AiRuleDrafterService } from './ai-rule-drafter.service';

@Module({
  imports: [PrismaModule],
  controllers: [AiController],
  providers: [AiClientService, AiCategoriserService, AiRuleDrafterService],
  exports: [AiCategoriserService, AiRuleDrafterService],
})
export class AiModule {}
