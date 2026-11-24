import { Body, Controller, Post } from '@nestjs/common';
import { PrintQuoteDto } from './print-quote.dto';
import { PrintPricingService } from './print-pricing.service';

@Controller('print')
export class PrintController {
  constructor(private readonly pricing: PrintPricingService) {}

  @Post('quote')
  createQuote(@Body() request: PrintQuoteDto) {
    return {
      data: this.pricing.calculate(request),
    };
  }
}
