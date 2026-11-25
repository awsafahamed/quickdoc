import {
  Body,
  BadRequestException,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import { SupportService } from './support.service';

type AuthenticatedRequest = { user: { id: string; roles: string[] } };

class CustomerTicketDto {
  @IsString()
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @Length(3, 160)
  subject!: string;

  @IsString()
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @Length(1, 5000)
  body!: string;

  @IsOptional()
  @IsUUID()
  orderId?: string;
}

class TicketMessageDto {
  @IsString()
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value)
  @Length(1, 5000)
  body!: string;
}

class AdminTicketUpdateDto {
  @IsOptional()
  @IsIn(['OPEN', 'IN_PROGRESS', 'WAITING_FOR_CUSTOMER', 'RESOLVED', 'CLOSED'])
  status?: 'OPEN' | 'IN_PROGRESS' | 'WAITING_FOR_CUSTOMER' | 'RESOLVED' | 'CLOSED';

  @IsOptional()
  @IsIn(['LOW', 'NORMAL', 'HIGH', 'URGENT'])
  priority?: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

  @ValidateIf((_object, value) => value !== undefined && value !== null)
  @IsUUID()
  assignedAdminId?: string | null;
}

class AdminTicketReplyDto extends TicketMessageDto {
  @IsOptional()
  @IsBoolean()
  internalNote = false;
}

class AdminTicketListQueryDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 25;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;

  @IsOptional()
  @IsIn(['OPEN', 'IN_PROGRESS', 'WAITING_FOR_CUSTOMER', 'RESOLVED', 'CLOSED'])
  status?: string;
}

@Controller('customer/support')
@UseGuards(AuthGuard('jwt'))
export class CustomerSupportController {
  constructor(private readonly support: SupportService) {}

  private assertCustomer(request: AuthenticatedRequest) {
    if (!request.user.roles.includes('CUSTOMER')) {
      throw new ForbiddenException('Customer account access is required');
    }
  }

  @Get()
  list(@Req() request: AuthenticatedRequest) {
    this.assertCustomer(request);
    return this.support.listCustomerTickets(request.user.id).then((data) => ({ data }));
  }

  @Post()
  create(@Req() request: AuthenticatedRequest, @Body() dto: CustomerTicketDto) {
    this.assertCustomer(request);
    return this.support.createCustomerTicket(request.user.id, dto).then((data) => ({ data }));
  }

  @Get(':id')
  get(@Param('id', new ParseUUIDPipe()) id: string, @Req() request: AuthenticatedRequest) {
    this.assertCustomer(request);
    return this.support.getCustomerTicket(id, request.user.id).then((data) => ({ data }));
  }

  @Post(':id/messages')
  reply(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Req() request: AuthenticatedRequest,
    @Body() dto: TicketMessageDto,
  ) {
    this.assertCustomer(request);
    return this.support.replyAsCustomer(id, request.user.id, dto.body).then((data) => ({ data }));
  }
}

@Controller('admin/support')
@UseGuards(AuthGuard('jwt'))
export class AdminSupportController {
  constructor(private readonly support: SupportService) {}

  private assertAdmin(request: AuthenticatedRequest) {
    if (!request.user.roles.includes('ADMIN')) {
      throw new ForbiddenException('Administrator access is required');
    }
  }

  @Get()
  list(@Query() query: AdminTicketListQueryDto, @Req() request: AuthenticatedRequest) {
    this.assertAdmin(request);
    return this.support.listAdminTickets(query);
  }

  @Get(':id')
  get(@Param('id', new ParseUUIDPipe()) id: string, @Req() request: AuthenticatedRequest) {
    this.assertAdmin(request);
    return this.support.getAdminTicket(id).then((data) => ({ data }));
  }

  @Patch(':id')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: AdminTicketUpdateDto,
    @Req() request: AuthenticatedRequest,
  ) {
    this.assertAdmin(request);
    if (dto.status === undefined && dto.priority === undefined && dto.assignedAdminId === undefined) {
      throw new BadRequestException('Provide a status, priority, or assignee to update');
    }
    return this.support.updateAdminTicket(id, request.user.id, dto).then((data) => ({ data }));
  }

  @Post(':id/messages')
  reply(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body() dto: AdminTicketReplyDto,
    @Req() request: AuthenticatedRequest,
  ) {
    this.assertAdmin(request);
    return this.support.replyAsAdmin(id, request.user.id, dto.body, dto.internalNote).then((data) => ({ data }));
  }
}
