import React, { useState } from 'react';
import { View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CalendarClock, Pause, Pencil, Plus, Send, Store, X } from 'lucide-react-native';

import { farmListingAction, fetchFarmListings, moveListingDate, type FarmMarketListing } from '@/api/market';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip, type ChipTone } from '@/components/ui/Chip';
import { EmptyState } from '@/components/ui/EmptyState';
import { confirm, toast } from '@/components/ui/Feedback';
import { Sheet } from '@/components/ui/Sheet';
import { Spinner } from '@/components/ui/Spinner';
import { fmtFcfa } from '@/constants/theme';
import { ListingSheet } from './ListingSheet';
import { dayLabel, listingTitle, unitName } from './rules';
import { DateField, HIDDEN_REASON, invalidateFarmMarket, Labeled, ListingThumb, marketError, Notice } from './shared';

const STATUS: Record<FarmMarketListing['status'], { label: string; tone: ChipTone }> = {
  DRAFT: { label: 'Brouillon', tone: 'neutral' },
  PUBLISHED: { label: 'Publiée', tone: 'green' },
  PAUSED: { label: 'Suspendue', tone: 'amber' },
  CLOSED: { label: 'Clôturée', tone: 'neutral' },
};

function MoveDateSheet({ farmId, listing, onClose }: { farmId: string; listing: FarmMarketListing; onClose: () => void }) {
  const client = useQueryClient();
  const [readyDate, setReadyDate] = useState(listing.readyDate ?? '');
  const [error, setError] = useState<string | null>(null);
  const move = useMutation({
    mutationFn: () => moveListingDate(farmId, listing.id, readyDate),
    onSuccess: () => {
      invalidateFarmMarket(client, farmId);
      onClose();
    },
    onError: (e) => setError(marketError(e)),
  });
  return (
    <Sheet visible title="Déplacer la date" onClose={onClose} footer={<Button label="Déplacer" disabled={!readyDate} loading={move.isPending} onPress={() => move.mutate()} />}>
      <View style={{ gap: 12 }}>
        <AppText size="small" color="muted">
          Les commandes en cours passent à la nouvelle date. Chaque acheteur le voit et peut annuler s’il ne peut plus attendre.
        </AppText>
        <Labeled label="Nouvelle date de disponibilité">
          <DateField value={readyDate} onChange={setReadyDate} minimumDate={new Date(Date.now() + 24 * 60 * 60 * 1000)} placeholder="Nouvelle date" />
        </Labeled>
        {error ? <Notice tone="danger">{error}</Notice> : null}
      </View>
    </Sheet>
  );
}

/** `readOnly` (POUFA lot A droits): an institution granted MARCHE reads the listings, no action. */
export function FarmListingsPanel({ farmId, readOnly = false }: { farmId: string; readOnly?: boolean }) {
  const client = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<FarmMarketListing | null>(null);
  const [moving, setMoving] = useState<FarmMarketListing | null>(null);
  const query = useQuery({ queryKey: ['market-farm-listings', farmId], queryFn: () => fetchFarmListings(farmId) });
  const action = useMutation({
    mutationFn: ({ id, verb }: { id: string; verb: 'publish' | 'pause' | 'close' }) => farmListingAction(farmId, id, verb),
    onSuccess: () => invalidateFarmMarket(client, farmId),
    onError: (e) => toast.error('Action impossible', marketError(e)),
  });
  const listings = query.data ?? [];

  const close = async (l: FarmMarketListing) => {
    const ok = await confirm({
      title: 'Clôturer l’annonce ?',
      message: 'Elle quitte le marché et ne pourra plus être republiée. Les commandes déjà acceptées restent en place.',
      cancelLabel: 'Retour',
      confirmLabel: 'Clôturer',
      destructive: true,
    });
    if (ok) action.mutate({ id: l.id, verb: 'close' });
  };

  return (
    <View style={{ gap: 10 }}>
      {readOnly ? null : <Button label="Nouvelle annonce" icon={Plus} onPress={() => setCreating(true)} />}
      {query.isLoading ? <Spinner label="Chargement…" /> : null}
      {query.error && listings.length === 0 ? <Notice tone="danger">{marketError(query.error)}</Notice> : null}
      {!query.isLoading && !query.error && listings.length === 0 ? (
        <EmptyState icon={Store} title="Aucune annonce" description="Publiez votre stock, ou des oiseaux bientôt prêts en précommande." />
      ) : null}
      {listings.map((l) => {
        const status = STATUS[l.status];
        const open = l.status !== 'CLOSED';
        // A published listing that buyers can't see: the farm must know why.
        const hidden = l.status === 'PUBLISHED' && l.hiddenReason ? HIDDEN_REASON[l.hiddenReason] : null;
        return (
          <Card key={l.id} style={{ gap: 10 }}>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <ListingThumb listing={l} size={56} />
              <View style={{ flex: 1, gap: 4 }}>
                <AppText size="bodyM" weight="semibold">{listingTitle(l)}</AppText>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  <Chip label={status.label} tone={status.tone} />
                  {l.kind === 'PRE' ? <Chip label="Précommande" tone="brand" /> : null}
                </View>
              </View>
            </View>
            <AppText size="small" color="muted">
              {l.batchName ? `${l.batchName} · ` : ''}
              {fmtFcfa(l.unitPriceFcfa)} / {unitName(l.product)} · {l.availableQuantity} disponibles sur {l.quantityPublished}
              {l.readyDate ? ` · prêts le ${dayLabel(l.readyDate)}` : ''}
              {l.depositPct ? ` · acompte ${l.depositPct} %` : ''}
            </AppText>
            {hidden ? <Notice tone="warning" icon={AlertTriangle}>{hidden}</Notice> : null}
            {open && !readOnly ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {l.status === 'PUBLISHED' ? (
                  <Button label="Suspendre" icon={Pause} tone="ghost" size="sm" block={false} onPress={() => action.mutate({ id: l.id, verb: 'pause' })} />
                ) : (
                  <Button label="Publier" icon={Send} size="sm" block={false} onPress={() => action.mutate({ id: l.id, verb: 'publish' })} />
                )}
                <Button label="Modifier" icon={Pencil} tone="ghost" size="sm" block={false} onPress={() => setEditing(l)} />
                {l.kind === 'PRE' && l.status !== 'DRAFT' ? (
                  <Button label="Déplacer la date" icon={CalendarClock} tone="ghost" size="sm" block={false} onPress={() => setMoving(l)} />
                ) : null}
                <Button label="Clôturer" icon={X} tone="ghost" size="sm" block={false} onPress={() => void close(l)} />
              </View>
            ) : null}
          </Card>
        );
      })}
      {creating ? <ListingSheet farmId={farmId} onClose={() => setCreating(false)} /> : null}
      {editing ? <ListingSheet farmId={farmId} listing={editing} onClose={() => setEditing(null)} /> : null}
      {moving ? <MoveDateSheet farmId={farmId} listing={moving} onClose={() => setMoving(null)} /> : null}
    </View>
  );
}
