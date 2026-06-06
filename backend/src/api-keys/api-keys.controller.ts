import { Body, Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ApiKeysService } from './api-keys.service';
import { CreateApiKeyDto } from './dto';
import { AdminOnly } from '../auth/roles.decorator';

@ApiTags('api-keys')
@AdminOnly()
@Controller('api-keys')
export class ApiKeysController {
  constructor(private service: ApiKeysService) {}

  @Get()
  list() {
    return this.service.list();
  }

  @Post()
  @HttpCode(201)
  create(@Body() dto: CreateApiKeyDto) {
    return this.service.create(dto);
  }

  @Delete(':id')
  revoke(@Param('id') id: string) {
    return this.service.revoke(id);
  }
}
