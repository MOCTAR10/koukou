import { Injectable } from '@nestjs/common';

/**
 * Seam for the official sanitary alerts (lot L5, `SanitaryAlert`): only an
 * alert the veterinary authority has **published** is counted in the
 * dashboards, the map and the reports (CDC §8 « Une alerte n'est publiée que
 * par l'autorité vétérinaire »). Fermia's advisory alerts are counted apart.
 *
 * Until L5 is merged the default source answers nothing. To plug L5 in,
 * replace the `PUBLISHED_ALERT_SOURCE` provider of `ReportingModule`
 * (`useClass: NoPublishedAlertSource`) with L5's implementation of
 * {@link PublishedAlertSource} (import its module there).
 */
export const PUBLISHED_ALERT_SOURCE = Symbol('PUBLISHED_ALERT_SOURCE');

/** One published sanitary alert, as the steering needs it. */
export interface PublishedSanitaryAlert {
  id: string;
  /** Province the alert concerns (null: national alert). */
  provinceId: string | null;
  /** Farm concerned, when the alert is about one farm. */
  farmId: string | null;
  /** Severity label of L5 (free text here; counted, never interpreted). */
  severity: string | null;
  publishedAt: Date;
}

export interface PublishedAlertQuery {
  programId: string;
  /**
   * Provinces of the viewer's scope (null = the whole programme). National
   * alerts (`provinceId` null) are returned whatever the provinces.
   */
  provinceIds: readonly string[] | null;
  /** Published at or after `from`, strictly before `to`. */
  from: Date;
  to: Date;
}

export interface PublishedAlertSource {
  /** Published alerts of the programme in the window, within the provinces. */
  published(query: PublishedAlertQuery): Promise<PublishedSanitaryAlert[]>;
  /** False while no sanitary module provides published alerts. */
  readonly available: boolean;
}

/** Default source until L5 lands: no published alert. */
@Injectable()
export class NoPublishedAlertSource implements PublishedAlertSource {
  readonly available = false;

  published(): Promise<PublishedSanitaryAlert[]> {
    return Promise.resolve([]);
  }
}
