import {
  Controller,
  Get,
  Post,
  Patch,
  Put,
  Delete,
  Param,
  Query,
  Body,
  Res,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';
import { AdminService } from './admin.service';
import {
  CreateAdminOutletDto,
  UpdateOutletStatusDto,
  UpdateOutletSettingsDto,
  UpdateCustomerDto,
  GetLogsQueryDto,
  DeleteLogsDto,
  SaveBillingPriceDto,
  CreateDiscountDto,
  CreateTicketDto,
  UpdateTicketDto,
} from './dto/admin.dto';

@Controller('admin')
export class AdminController {
  private readonly logger = new Logger(AdminController.name);

  constructor(private readonly adminService: AdminService) {}

  // ─── Outlets ───────────────────────────────────────────────────────────────

  @Get('outlets')
  async getOutlets(@Res() res: Response) {
    try {
      const data = await this.adminService.getOutlets();
      return res.status(HttpStatus.OK).json(data);
    } catch (err: any) {
      this.logger.error('[AdminController] getOutlets failed', { error: err.message });
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ error: 'Failed to fetch outlets' });
    }
  }

  @Post('outlets')
  async createOutlet(@Body() dto: CreateAdminOutletDto, @Res() res: Response) {
    try {
      const result = await this.adminService.createOutlet(dto);
      return res.status(HttpStatus.CREATED).json(result);
    } catch (err: any) {
      this.logger.error('[AdminController] createOutlet failed', { error: err.message });
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ error: 'Failed to create outlet' });
    }
  }

  @Delete('outlets/:id')
  async deleteOutlet(@Param('id') id: string, @Res() res: Response) {
    try {
      const result = await this.adminService.deleteOutlet(id);
      return res.status(HttpStatus.OK).json(result);
    } catch (err: any) {
      this.logger.error('[AdminController] deleteOutlet failed', { error: err.message });
      if (err.status === 404 || err.message?.includes('not found')) {
        return res.status(HttpStatus.NOT_FOUND).json({ error: err.message || `Outlet ${id} not found` });
      }
      if (err.status === 400) {
        return res.status(HttpStatus.BAD_REQUEST).json({ error: err.message });
      }
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ error: 'Failed to delete outlet' });
    }
  }

  @Patch('outlets/:id/status')
  async updateOutletStatus(@Param('id') id: string, @Body() dto: UpdateOutletStatusDto, @Res() res: Response) {
    try {
      const result = await this.adminService.updateOutletStatus(id, dto);
      return res.status(HttpStatus.OK).json(result);
    } catch (err: any) {
      this.logger.error('[AdminController] updateOutletStatus failed', { error: err.message });
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ error: 'Failed to update outlet status' });
    }
  }

  @Patch('outlets/:id/settings')
  async updateOutletSettings(@Param('id') id: string, @Body() dto: UpdateOutletSettingsDto, @Res() res: Response) {
    try {
      const result = await this.adminService.updateOutletSettings(id, dto);
      return res.status(HttpStatus.OK).json(result);
    } catch (err: any) {
      this.logger.error('[AdminController] updateOutletSettings failed', { error: err.message });
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ error: 'Failed to update outlet settings' });
    }
  }

  // ─── Customers ─────────────────────────────────────────────────────────────

  @Get('customers')
  async getCustomers(@Res() res: Response) {
    try {
      const data = await this.adminService.getCustomers();
      return res.status(HttpStatus.OK).json(data);
    } catch (err: any) {
      this.logger.error('[AdminController] getCustomers failed', { error: err.message });
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ error: 'Failed to fetch customers' });
    }
  }

  @Get('customers/:id')
  async getCustomerById(@Param('id') id: string, @Res() res: Response) {
    try {
      const customer = await this.adminService.getCustomerById(id);
      return res.status(HttpStatus.OK).json(customer);
    } catch (err: any) {
      this.logger.error('[AdminController] getCustomerById failed', { error: err.message });
      if (err.status === 404) return res.status(HttpStatus.NOT_FOUND).json({ error: err.message });
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ error: 'Failed to fetch customer details' });
    }
  }

  @Patch('customers/:id')
  async updateCustomer(@Param('id') id: string, @Body() dto: UpdateCustomerDto, @Res() res: Response) {
    try {
      const result = await this.adminService.updateCustomer(id, dto);
      return res.status(HttpStatus.OK).json(result);
    } catch (err: any) {
      this.logger.error('[AdminController] updateCustomer failed', { error: err.message });
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ error: 'Failed to update customer' });
    }
  }

  // ─── Insights & Diagnostics ────────────────────────────────────────────────

  @Get('credits')
  async getCreditsSummary(@Res() res: Response) {
    try {
      const data = await this.adminService.getCreditsSummary();
      return res.status(HttpStatus.OK).json(data);
    } catch (err: any) {
      this.logger.error('[AdminController] getCreditsSummary failed', { error: err.message });
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ error: 'Failed to fetch credits summary' });
    }
  }

  @Get('usage-insights')
  async getUsageInsights(@Res() res: Response) {
    try {
      const data = await this.adminService.getUsageInsights();
      return res.status(HttpStatus.OK).json(data);
    } catch (err: any) {
      this.logger.error('[AdminController] getUsageInsights failed', { error: err.message });
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ error: 'Failed to fetch usage insights' });
    }
  }

  @Get('reputation-insights')
  async getReputationInsights(@Res() res: Response) {
    try {
      const data = await this.adminService.getReputationInsights();
      return res.status(HttpStatus.OK).json(data);
    } catch (err: any) {
      this.logger.error('[AdminController] getReputationInsights failed', { error: err.message });
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ error: 'Failed to fetch reputation insights' });
    }
  }

  @Get('billing/diagnostics')
  async getBillingDiagnostics(@Res() res: Response) {
    try {
      const data = await this.adminService.getBillingDiagnostics();
      return res.status(HttpStatus.OK).json(data);
    } catch (err: any) {
      this.logger.error('[AdminController] getBillingDiagnostics failed', { error: err.message });
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ error: 'Failed to fetch billing diagnostics' });
    }
  }

  @Get('billing/prices')
  async getBillingPrices(@Res() res: Response) {
    try {
      const data = await this.adminService.getBillingPrices();
      return res.status(HttpStatus.OK).json(data);
    } catch (err: any) {
      this.logger.error('[AdminController] getBillingPrices failed', { error: err.message });
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ error: 'Failed to fetch billing prices' });
    }
  }

  @Post('billing/prices')
  async saveBillingPrice(@Body() dto: SaveBillingPriceDto, @Res() res: Response) {
    try {
      const result = await this.adminService.saveBillingPrice(dto);
      return res.status(HttpStatus.OK).json(result);
    } catch (err: any) {
      this.logger.error('[AdminController] saveBillingPrice failed', { error: err.message });
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ error: 'Failed to save billing price' });
    }
  }

  // ─── Logs & Maintenance ────────────────────────────────────────────────────

  @Get('logs')
  async getSystemLogs(@Query() query: GetLogsQueryDto, @Res() res: Response) {
    try {
      const data = await this.adminService.getSystemLogs(query);
      return res.status(HttpStatus.OK).json(data);
    } catch (err: any) {
      this.logger.error('[AdminController] getSystemLogs failed', { error: err.message });
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ error: 'Failed to fetch system logs' });
    }
  }

  @Delete('logs/delete-old')
  async deleteOldLogsPath(@Body() dto: DeleteLogsDto, @Res() res: Response) {
    try {
      const result = await this.adminService.deleteOldLogs(dto.limit);
      return res.status(HttpStatus.OK).json(result);
    } catch (err: any) {
      this.logger.error('[AdminController] deleteOldLogsPath failed', { error: err.message });
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ error: 'Failed to delete logs' });
    }
  }

  @Delete('logs')
  async deleteOldLogs(@Body() dto: DeleteLogsDto, @Res() res: Response) {
    try {
      const result = await this.adminService.deleteOldLogs(dto.limit);
      return res.status(HttpStatus.OK).json(result);
    } catch (err: any) {
      this.logger.error('[AdminController] deleteOldLogs failed', { error: err.message });
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ error: 'Failed to delete logs' });
    }
  }

  @Post('trigger-cron')
  async triggerCronJobs(@Res() res: Response) {
    try {
      const result = await this.adminService.triggerCronJobs();
      return res.status(HttpStatus.OK).json(result);
    } catch (err: any) {
      this.logger.error('[AdminController] triggerCronJobs failed', { error: err.message });
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ error: 'Failed to trigger cron jobs' });
    }
  }

  // ─── Places API Integration ────────────────────────────────────────────────

  @Get('places/autocomplete')
  async getPlacesAutocomplete(@Query('input') input: string, @Res() res: Response) {
    try {
      const data = await this.adminService.getPlacesAutocomplete(input || '');
      return res.status(HttpStatus.OK).json(data);
    } catch (err: any) {
      this.logger.error('[AdminController] getPlacesAutocomplete failed', { error: err.message });
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ error: 'Places autocomplete failed' });
    }
  }

  @Get('places/details')
  async getPlaceDetails(@Query('placeId') placeId: string, @Res() res: Response) {
    try {
      const data = await this.adminService.getPlaceDetails(placeId);
      return res.status(HttpStatus.OK).json(data);
    } catch (err: any) {
      this.logger.error('[AdminController] getPlaceDetails failed', { error: err.message });
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ error: 'Place details lookup failed' });
    }
  }
}

// Separate controller for root /api/discounts and /api/tickets requested by admin frontend pages
@Controller()
export class DiscountsAndTicketsController {
  private readonly logger = new Logger(DiscountsAndTicketsController.name);

  constructor(private readonly adminService: AdminService) {}

  @Get('discounts')
  async getDiscounts(@Res() res: Response) {
    try {
      const data = await this.adminService.getDiscounts();
      return res.status(HttpStatus.OK).json(data);
    } catch (err: any) {
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ error: 'Failed to fetch discounts' });
    }
  }

  @Post('discounts')
  async createDiscount(@Body() dto: CreateDiscountDto, @Res() res: Response) {
    try {
      const result = await this.adminService.createDiscount(dto);
      return res.status(HttpStatus.CREATED).json(result);
    } catch (err: any) {
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ error: 'Failed to create discount' });
    }
  }

  @Get('tickets')
  async getTickets(@Res() res: Response) {
    try {
      const data = await this.adminService.getTickets();
      return res.status(HttpStatus.OK).json(data);
    } catch (err: any) {
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ error: 'Failed to fetch tickets' });
    }
  }

  @Post('tickets')
  async createTicket(@Body() dto: CreateTicketDto, @Res() res: Response) {
    try {
      const result = await this.adminService.createTicket(dto);
      return res.status(HttpStatus.CREATED).json(result);
    } catch (err: any) {
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ error: 'Failed to create ticket' });
    }
  }

  @Put('tickets/:id')
  async updateTicket(@Param('id') id: string, @Body() dto: UpdateTicketDto, @Res() res: Response) {
    try {
      const result = await this.adminService.updateTicket(id, dto);
      return res.status(HttpStatus.OK).json(result);
    } catch (err: any) {
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ error: 'Failed to update ticket' });
    }
  }
}
