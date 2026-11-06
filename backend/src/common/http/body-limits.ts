import type { INestApplication } from '@nestjs/common';
import express, {
  type NextFunction,
  type Request,
  type Response,
} from 'express';

/**
 * Request body limits. Nest's JSON parser keeps Express's default (100 KB)
 * everywhere, except the province boundary upload: a province outline in
 * GeoJSON easily weighs several hundred kilobytes (CDC n° 1-2, contours
 * loaded by the administration).
 */
export const GEOMETRY_BODY_LIMIT = '5mb';

/** `PUT /programme/provinces/:code/geometry`. */
export const GEOMETRY_ROUTE = /^\/programme\/provinces\/[^/]+\/geometry\/?$/;

/**
 * Registers the larger JSON parser for the geometry route only. Call it
 * before `app.init()` / `listen()`: it runs before Nest's own JSON parser,
 * which then sees the body already parsed and skips it. The function is
 * named so Nest still registers its default parser (it looks for a
 * middleware named `jsonParser`).
 */
export function applyBodyLimits(app: INestApplication): void {
  const geometryParser = express.json({ limit: GEOMETRY_BODY_LIMIT });
  app.use(function geometryJsonParser(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    if (req.method === 'PUT' && GEOMETRY_ROUTE.test(req.path)) {
      geometryParser(req, res, next);
      return;
    }
    next();
  });
}
