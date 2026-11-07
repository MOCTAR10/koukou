import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppService } from './app.service.js';
import { Domain } from './common/decorators/domain.decorator.js';

@ApiTags('Plateforme')
@Domain('PLATEFORME')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiOperation({ summary: "Message d'accueil de l'API (sonde de disponibilité)" })
  getHello(): string {
    return this.appService.getHello();
  }
}
