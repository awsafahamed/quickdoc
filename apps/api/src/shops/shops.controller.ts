import { Controller, Get, Param, Query } from '@nestjs/common';
import { ShopsService } from './shops.service';

@Controller('shops')
export class ShopsController {
  constructor(private readonly shops: ShopsService) {}

  @Get()
  async list(
    @Query('search') search?: string,
    @Query('paperSize') paperSize?: string,
    @Query('colour') colour?: string,
  ) {
    return { data: await this.shops.findEligible(search, paperSize, colour) };
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return { data: this.shops.findById(id) };
  }
}
