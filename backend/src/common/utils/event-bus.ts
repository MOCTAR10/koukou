import { EventEmitter } from 'node:events';

export interface BatchClosedEvent {
  farmId: string;
  batchId: string;
}

export interface DailyEntryCreatedEvent {
  farmId: string;
  batchId: string;
  entryDate: string;
}

export interface SaleChangedEvent {
  farmId: string;
}

/**
 * Bus d'événements in-process minimal : permet aux modules de s'abonner à des
 * moments clés sans créer de dépendances circulaires (ex. clôture d'un lot →
 * évaluation du P&L / alertes de rentabilité).
 */
export const KOUKOU_EVENTS = {
  BATCH_CLOSED: 'batch.closed',
  DAILY_ENTRY_CREATED: 'daily.entry.created',
  SALE_CHANGED: 'sale.changed',
} as const;

class FermiaBus extends EventEmitter {}

export const koukouBus = new FermiaBus();
koukouBus.setMaxListeners(50);
