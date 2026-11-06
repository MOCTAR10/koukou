import {
  Controller,
  Get,
  GoneException,
  NotFoundException,
  Param,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { Domain } from '../../common/decorators/domain.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { QrScanResult } from '../../common/enums/trace.enum.js';
import { QrScansService } from './qr-scans.service.js';

export const UNKNOWN_QR_MESSAGE =
  'QR code inconnu ou invalide : ce produit ne peut pas être rattaché à un lot du programme.';
export const CLOSED_QR_MESSAGE =
  "Ce lot est clos : ce QR code n'est plus valide.";

/**
 * Public page of a lot (`/l/:code` on the web, architecture §11.3), read by
 * anyone with the QR code, without an account. Whitelisted answer (no phone,
 * precise GPS, cost nor person), mandatory « pas un certificat sanitaire »
 * mention. An unknown or badly signed QR gets the same 404 (no oracle on
 * which codes exist), a closed one 410. Every scan is journaled.
 *
 * Cached by the visitor's browser only (`private`): a shared cache would
 * hide scans from the journal, which the fraud indicators rely on.
 */
@ApiTags('Traçabilité (public)')
@Domain('TRACABILITE')
@Controller('public/lots')
export class PublicLotsController {
  constructor(private readonly scans: QrScansService) {}

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get(':code')
  @ApiOperation({
    summary:
      "Page publique d'un lot (QR code signé) : origine du produit, sans donnée personnelle",
  })
  @ApiQuery({ name: 's', required: true, description: 'Signature du QR code' })
  @ApiQuery({
    name: 'lat',
    required: false,
    description: 'Position du visiteur (facultative, avec son accord) : seule une zone de 0,1° est gardée',
  })
  @ApiQuery({ name: 'lng', required: false })
  async page(
    @Param('code') code: string,
    @Query('s') signature: string | undefined,
    @Query('lat') lat: string | undefined,
    @Query('lng') lng: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const outcome = await this.scans.scan({
      code,
      signature: typeof signature === 'string' ? signature : null,
      ip: req.ip ?? req.socket?.remoteAddress,
      userAgent: req.get('user-agent'),
      lat,
      lng,
    });
    if (outcome.result !== QrScanResult.OK) {
      res.set('Cache-Control', 'no-store');
      if (outcome.result === QrScanResult.CLOS) {
        throw new GoneException(CLOSED_QR_MESSAGE);
      }
      throw new NotFoundException(UNKNOWN_QR_MESSAGE);
    }
    res.set('Cache-Control', 'private, max-age=300');
    return outcome.view;
  }
}
