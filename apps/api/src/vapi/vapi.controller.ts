import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { VapiAuthGuard } from './vapi-auth.guard';
import { VapiService } from './vapi.service';
import { VapiWebhookPayload } from './vapi.types';

@ApiTags('vapi')
@ApiBearerAuth()
@UseGuards(VapiAuthGuard)
@Controller('vapi')
export class VapiController {
  constructor(private readonly vapiService: VapiService) {}

  @Post('tools')
  @HttpCode(200)
  @ApiOperation({ summary: 'Handle Vapi custom tool calls' })
  handleTools(@Body() body: VapiWebhookPayload) {
    return this.vapiService.handleTools(body);
  }

  @Post('webhook')
  @HttpCode(200)
  @ApiOperation({ summary: 'Handle Vapi webhook events' })
  handleWebhook(@Body() body: VapiWebhookPayload) {
    return this.vapiService.handleWebhook(body);
  }
}
