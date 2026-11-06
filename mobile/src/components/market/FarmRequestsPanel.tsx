import React, { useState } from 'react';
import { View } from 'react-native';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter, type Href } from 'expo-router';
import { AlertTriangle, CalendarClock, Check, ExternalLink, Store, X } from 'lucide-react-native';

import { acceptMarketOrder, extendMarketDeposit, rejectMarketOrder, type FarmMarketOrder, type MarketOrderState } from '@/api/market';
import { AppText } from '@/components/ui/AppText';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { confirm, toast } from '@/components/ui/Feedback';
import { Sheet } from '@/components/ui/Sheet';
import { Spinner } from '@/components/ui/Spinner';
import { TextField } from '@/components/ui/TextField';
import { customerTypeLabel } from '@/constants/customers';
import { color, fmtFcfa } from '@/constants/theme';
import { dateTimeLabel, dayLabel, timeLeft, unitName } from './rules';
import { invalidateFarmMarket, Labeled, marketError, MarketStatusChip, Notice, PillRow, useNow } from './shared';

type Filter = 'REQUESTED' | 'ACCEPTED' | 'OTHER';

function matches(state: MarketOrderState, filter: Filter): boolean {
  if (filter === 'OTHER') return state !== 'REQUESTED' && state !== 'ACCEPTED';
  return state === filter;
}

function RejectSheet({ onSubmit, busy, onClose }: { onSubmit: (reason: string) => void; busy: boolean; onClose: () => void }) {
  const [reason, setReason] = useState('');
  return (
    <Sheet visible title="Refuser la demande" onClose={onClose} footer={<Button label="Refuser" tone="danger" loading={busy} onPress={() => onSubmit(reason.trim())} />}>
      <Labeled label="Motif (facultatif)" hint="L’acheteur le verra.">
        <TextField value={reason} onChangeText={setReason} multiline maxLength={300} accessibilityLabel="Motif" />
      </Labeled>
    </Sheet>
  );
}

export function FarmRequestsPanel({
  farmId,
  orders,
  isLoading,
  error,
}: {
  farmId: string;
  orders: FarmMarketOrder[];
  isLoading: boolean;
  error: unknown;
}) {
  const router = useRouter();
  const client = useQueryClient();
  const now = useNow();
  const [filter, setFilter] = useState<Filter>('REQUESTED');
  const [rejecting, setRejecting] = useState<FarmMarketOrder | null>(null);

  // A refusal often means the state moved (expired, withdrawn): show what it is now.
  const fail = (e: unknown) => {
    toast.error('Action impossible', marketError(e));
    invalidateFarmMarket(client, farmId);
  };
  const accept = useMutation({
    mutationFn: (id: string) => acceptMarketOrder(farmId, id),
    onSuccess: () => invalidateFarmMarket(client, farmId),
    onError: fail,
  });
  const reject = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => rejectMarketOrder(farmId, id, reason || undefined),
    onSuccess: () => {
      setRejecting(null);
      invalidateFarmMarket(client, farmId);
    },
    onError: fail,
  });
  const extend = useMutation({
    mutationFn: (id: string) => extendMarketDeposit(farmId, id),
    onSuccess: () => invalidateFarmMarket(client, farmId),
    onError: fail,
  });

  const askAccept = async (o: FarmMarketOrder) => {
    const ok = await confirm({
      title: 'Accepter la demande ?',
      message: `Une commande de ${o.quantity} ${unitName(o.product, o.quantity)} (${fmtFcfa(o.totalFcfa)}) est créée et le stock est réservé.${
        o.depositRequiredFcfa > 0 ? ` L’acheteur aura 24 h pour vous remettre ${fmtFcfa(o.depositRequiredFcfa)} d’acompte, puis la commande sera annulée automatiquement.` : ''
      }`,
      cancelLabel: 'Retour',
      confirmLabel: 'Accepter',
    });
    if (ok) accept.mutate(o.id);
  };

  const askExtend = async (o: FarmMarketOrder) => {
    const ok = await confirm({
      title: 'Prolonger le délai de 24 h ?',
      message: 'Possible une seule fois par commande, si l’acheteur a besoin de plus de temps ou a déjà payé.',
      cancelLabel: 'Retour',
      confirmLabel: 'Prolonger',
    });
    if (ok) extend.mutate(o.id);
  };

  const count = (f: Filter) => orders.filter((o) => matches(o.state, f)).length;
  const rows = orders.filter((o) => matches(o.state, filter));

  return (
    <View style={{ gap: 10 }}>
      <PillRow<Filter>
        value={filter}
        onChange={setFilter}
        options={[
          { key: 'REQUESTED', label: `À traiter (${count('REQUESTED')})` },
          { key: 'ACCEPTED', label: `Acceptées (${count('ACCEPTED')})` },
          { key: 'OTHER', label: `Autres (${count('OTHER')})` },
        ]}
      />
      {isLoading ? <Spinner label="Chargement…" /> : null}
      {error && orders.length === 0 ? <Notice tone="danger">{marketError(error)}</Notice> : null}
      {!isLoading && !error && rows.length === 0 ? <EmptyState icon={Store} title="Aucune demande" description="Rien à afficher ici." /> : null}
      {rows.map((o) => {
        const requestLeft = o.requestExpiresAt ? timeLeft(o.requestExpiresAt, now) : null;
        const depositLeft = o.depositDueAt ? timeLeft(o.depositDueAt, now) : null;
        return (
          <Card key={o.id} style={{ gap: 8 }}>
            <View style={{ gap: 4, alignItems: 'flex-start' }}>
              <AppText size="bodyM" weight="semibold">{o.buyer.organizationName ?? o.buyer.fullName}</AppText>
              <AppText size="caption" color="muted">
                {o.buyer.type ? customerTypeLabel(o.buyer.type) : 'Acheteur'}
                {o.buyer.city ? ` · ${o.buyer.city}` : ''}
              </AppText>
              <MarketStatusChip status={o.status} />
            </View>
            <AppText size="small">
              {o.quantity} {unitName(o.product, o.quantity)}
              {o.batchName ? ` · ${o.batchName}` : ''} · {fmtFcfa(o.totalFcfa)}
            </AppText>
            <AppText size="small" color="muted">
              {o.fulfilment === 'DELIVERY' ? `Livraison : ${o.address ?? ''}` : 'Retrait à la ferme'}
            </AppText>
            <AppText size="caption" color="muted">
              Demandé le {dateTimeLabel(o.createdAt)}
              {o.readyDate ? ` · prêts le ${dayLabel(o.readyDate)}` : ''}
              {o.desiredDate ? ` · souhaité le ${dayLabel(o.desiredDate)}` : ''}
              {o.contactPhone ? ` · ${o.contactPhone}` : ''}
            </AppText>
            {o.note ? <AppText size="small" color="muted" style={{ fontStyle: 'italic' }}>« {o.note} »</AppText> : null}

            {o.oversold ? (
              <Notice tone="danger" icon={AlertTriangle}>Stock insuffisant : il y a moins d’oiseaux que ce qui a été accepté. Prévenez l’acheteur, vous pourrez livrer moins.</Notice>
            ) : null}
            {o.cancelRequestedAt ? (
              <Notice tone="warning" icon={AlertTriangle}>L’acheteur demande l’annulation. Convenez du remboursement avec lui, puis annulez depuis la commande.</Notice>
            ) : null}
            {o.status === 'AWAITING_DEPOSIT' ? (
              <AppText size="small" style={{ color: color.accent[700] }}>
                Acompte attendu : {fmtFcfa(o.depositRequiredFcfa)}
                {depositLeft ? `, reste ${depositLeft}.` : ', délai dépassé : annulation automatique imminente.'} Enregistrez-le depuis la commande dès réception.
              </AppText>
            ) : null}
            {o.depositShortFcfa > 0 ? (
              <AppText size="small" style={{ color: color.accent[700] }}>
                Acompte partiel : il manque {fmtFcfa(o.depositShortFcfa)}. La commande ne sera pas annulée automatiquement.
              </AppText>
            ) : null}
            {o.state === 'REQUESTED' && requestLeft ? <AppText size="caption" color="faint">Sans réponse d’ici {requestLeft}, la demande expire.</AppText> : null}

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {o.state === 'REQUESTED' ? (
                <>
                  <Button label="Accepter" icon={Check} size="sm" block={false} loading={accept.isPending && accept.variables === o.id} onPress={() => void askAccept(o)} />
                  <Button label="Refuser" icon={X} tone="ghost" size="sm" block={false} onPress={() => setRejecting(o)} />
                </>
              ) : null}
              {o.status === 'AWAITING_DEPOSIT' && !o.depositExtendedAt ? (
                <Button label="Prolonger de 24 h" icon={CalendarClock} tone="ghost" size="sm" block={false} onPress={() => void askExtend(o)} />
              ) : null}
              {o.orderId ? (
                <Button label={`Ouvrir ${o.orderReference ?? 'la commande'}`} icon={ExternalLink} tone="ghost" size="sm" block={false} onPress={() => router.push(`/commande/${o.orderId}` as Href)} />
              ) : null}
            </View>
          </Card>
        );
      })}
      {rejecting ? (
        <RejectSheet busy={reject.isPending} onSubmit={(reason) => reject.mutate({ id: rejecting.id, reason })} onClose={() => setRejecting(null)} />
      ) : null}
    </View>
  );
}
