import { useState } from 'react';
import { Download } from 'lucide-react';
import { api } from '../../api/client';
import { Button, ErrorNote } from '../form';
import { SectionCard } from '../flock/shared';
import {
  EXPORT_FORMATS,
  EXPORT_LABELS,
  FORMAT_LABELS,
  exportFilename,
  exportKindsFor,
  exportPath,
  periodError,
  type ExportFormat,
  type ExportKind,
  type PilotageFilters,
} from './filters';

/**
 * CSV / Excel exports with the page's filters (`GET /pilotage/exports/…`,
 * journaled by the server). Farm and band rows are never offered to an
 * aggregate-only view; the server refuses them anyway (403, message shown).
 */
export function ExportsCard({ filters, aggregateOnly }: { filters: PilotageFilters; aggregateOnly: boolean }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const invalid = periodError(filters);
  const run = async (kind: ExportKind, format: ExportFormat) => {
    setBusy(`${kind}.${format}`);
    setError(null);
    try {
      await api.download(exportPath(kind, format, filters), exportFilename(kind, format, filters));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(null);
    }
  };
  return (
    <SectionCard
      title="Exports"
      subtitle="Avec les filtres de la page ; chaque export est inscrit au journal d’audit."
      icon={<Download />}
    >
      <div className="flex flex-wrap gap-4">
        {exportKindsFor(aggregateOnly).map((kind) => (
          <div key={kind} className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-slate-700">{EXPORT_LABELS[kind]}</span>
            {EXPORT_FORMATS.map((format) => (
              <Button key={format} tone="secondary" disabled={!!invalid} busy={busy === `${kind}.${format}`} onClick={() => void run(kind, format)}>
                <Download className="h-4 w-4" /> {FORMAT_LABELS[format]}
              </Button>
            ))}
          </div>
        ))}
      </div>
      {aggregateOnly ? (
        <p className="mt-3 text-xs text-slate-500">Votre profil porte sur des données agrégées : les exports par ferme et par bande ne vous sont pas ouverts.</p>
      ) : null}
      <div className="mt-3">
        <ErrorNote error={error} />
      </div>
    </SectionCard>
  );
}
