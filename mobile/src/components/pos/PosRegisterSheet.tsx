import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { Banknote, Check, ReceiptText, UserRound, Wallet, X } from 'lucide-react-native';

import { AppText } from '../ui/AppText';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { Sheet } from '../ui/Sheet';
import { ClientPickerSheet } from '../capture/ClientPickerSheet';
import type { InvoiceFields } from '@/api/mutations';
import type { Customer, Promotion } from '@/api/types';
import type { SendResult } from '@/offline';
import { customerTypeLabel } from '@/constants/customers';
import { color, palette, radii, spacing, fmt, fmtFcfa } from '@/constants/theme';

import { findPromotion, totalsFor } from './helpers';
import type { PosLine } from './types';

interface PosRegisterSheetProps {
  visible: boolean;
  farmId: string;
  lines: PosLine[];
  promotions: Promotion[];
  pdvName: string;
  pointOfSaleId?: string;
  onSell: (input: {
    invoice?: InvoiceFields;
    promoCode?: string;
    pointOfSaleId?: string;
    paymentMode?: 'CASH' | 'CREDIT';
  }) => Promise<SendResult>;
  onSettled?: () => void;
  onShowReceipt?: (saleRef: string) => void;
  onClose: () => void;
}

const QUICK_CASH = [1000, 2000, 5000, 10000, 20000, 50000];

export function PosRegisterSheet({
  visible,
  farmId,
  lines,
  promotions,
  pdvName,
  pointOfSaleId,
  onSell,
  onSettled,
  onShowReceipt,
  onClose,
}: PosRegisterSheetProps) {
  const [promoCode, setPromoCode] = useState('');
  const [tendered, setTendered] = useState(0);
  const [paymentMode, setPaymentMode] = useState<'CASH' | 'CREDIT'>('CASH');
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selling, setSelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sold, setSold] = useState<{ ref: string; queued: boolean; credit: boolean } | null>(null);

  useEffect(() => {
    if (!visible) return;
    setPromoCode('');
    setTendered(0);
    setPaymentMode('CASH');
    setCustomer(null);
    setPickerOpen(false);
    setSelling(false);
    setError(null);
    setSold(null);
  }, [visible]);

  const sub = totalsFor(lines, null).subtotalFcfa;
  const promo = findPromotion(promotions, promoCode, sub);
  const totals = totalsFor(lines, promo);
  const change = tendered - totals.totalFcfa;
  const isCredit = paymentMode === 'CREDIT';
  const creditDue = customer?.balance?.outstandingFcfa ?? 0;
  const canSell = isCredit
    ? totals.totalFcfa > 0 && customer !== null
    : totals.totalFcfa > 0 && tendered >= totals.totalFcfa;

  const security = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  };

  const invoice = (): InvoiceFields | undefined => {
    if (customer) return { customerId: customer.id };
    return undefined;
  };

  const sell = async () => {
    if (!canSell) {
      if (isCredit) {
        if (totals.totalFcfa > 0 && !customer) {
          setError('Sélectionnez un client enregistré pour vendre à crédit.');
        }
      } else if (totals.totalFcfa > 0 && tendered > 0 && tendered < totals.totalFcfa) {
        setError('La somme versée est inférieure au total.');
      }
      return;
    }
    setSelling(true);
    setError(null);
    try {
      const result = await onSell({
        invoice: invoice(),
        promoCode: promoCode.trim(),
        pointOfSaleId,
        paymentMode,
      });
      security();
      onSettled?.();
      setSold({
        ref: result.status === 'sent' ? (result.reference ?? 'VTE') : 'PEND',
        queued: result.status !== 'sent',
        credit: isCredit,
      });
      if (result.status !== 'sent') setTimeout(onClose, 1600);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur lors de l’encaissement.');
      setSelling(false);
    }
  };

  if (sold) {
    return (
      <Sheet visible={visible} onClose={onClose}>
        <View style={styles.savedWrap}>
          <View style={styles.checkCircle}>
            <Check size={54} color={palette.green[600]} strokeWidth={3} />
          </View>
          <AppText size="h3" weight="bold" color="text">
            {sold.credit ? 'Vente à crédit' : 'Vente encaissée'}
          </AppText>
          <AppText size="caption" color="muted">
            {sold.ref} · {pdvName}
          </AppText>
          <AppText size="caption" color="faint">
            {sold.queued
              ? 'En attente de synchronisation'
              : sold.credit
                ? `À crédit · ${customer?.fullName ?? 'client'}`
                : 'Encaissée espèces · caisse journalière'}
          </AppText>
          {!sold.queued ? (
            <View style={{ width: '100%', gap: spacing.sm, marginTop: spacing.md }}>
              <Button
                label="Voir le reçu"
                tone="accent"
                icon={ReceiptText}
                onPress={() => onShowReceipt?.(sold.ref)}
              />
              <Button label="Fermer" tone="ghost" onPress={onClose} />
            </View>
          ) : null}
        </View>
      </Sheet>
    );
  }

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Encaissement"
      subtitle={isCredit ? 'Vente à crédit · crédit client' : 'Espèces · caisse journalière'}
      icon={isCredit ? <Wallet size={22} color={color.brand[600]} /> : <Banknote size={22} color={color.green[600]} />}
      accentColor={isCredit ? color.brand[500] : color.green[500]}>
      <View style={{ gap: spacing.lg }}>
        <View style={styles.modeRow}>
          <Pressable
            onPress={() => {
              setPaymentMode('CASH');
              setError(null);
            }}
            style={[styles.modeBtn, !isCredit && styles.modeBtnActive]}
            accessibilityRole="button">
            <Banknote size={16} color={!isCredit ? color.surface : color.brand[700]} />
            <AppText size="small" weight="bold" style={{ color: !isCredit ? color.surface : color.brand[700] }}>
              Espèces
            </AppText>
          </Pressable>
          <Pressable
            onPress={() => {
              setPaymentMode('CREDIT');
              setError(null);
            }}
            style={[styles.modeBtn, isCredit && styles.modeBtnActive]}
            accessibilityRole="button">
            <Wallet size={16} color={isCredit ? color.surface : color.brand[700]} />
            <AppText size="small" weight="bold" style={{ color: isCredit ? color.surface : color.brand[700] }}>
              Crédit
            </AppText>
          </Pressable>
        </View>

        <Card tone={totals.discountFcfa > 0 ? 'green' : 'default'} style={{ gap: spacing.sm }}>
          <View style={styles.totalHead}>
            <View style={{ flex: 1 }}>
              <AppText size="label" color="muted">
                TOTAL À ENCAISSER
              </AppText>
              <AppText size="h1" weight="bold" color="accent">
                {fmt(totals.totalFcfa)} FCFA
              </AppText>
            </View>
            <ReceiptText size={26} color={color.green[600]} />
          </View>
          <View style={styles.detailRow}>
            <AppText size="small" color="muted">
              Sous-total
            </AppText>
            <AppText size="small" weight="semibold" color="text">
              {fmt(totals.subtotalFcfa)} FCFA
            </AppText>
          </View>
          {totals.discountFcfa > 0 ? (
            <View style={styles.detailRow}>
              <AppText size="small" color="success">
                Remise ({promo?.label ?? promoCode})
              </AppText>
              <AppText size="small" weight="semibold" color="success">
                − {fmt(totals.discountFcfa)} FCFA
              </AppText>
            </View>
          ) : null}
        </Card>

        <View>
          <AppText size="label" color="muted">
            CODE PROMO — OPTIONNEL
          </AppText>
          <TextInput
            value={promoCode}
            onChangeText={(t) => {
              setPromoCode(t.toUpperCase());
              setError(null);
            }}
            placeholder="Ex. BIENVENUE10"
            placeholderTextColor={color.ink[300]}
            autoCapitalize="characters"
            autoCorrect={false}
            style={[styles.input, { marginTop: 6 }]}
          />
          {promo ? (
            <AppText size="small" color="success" style={{ marginTop: 4 }}>
              {promo.label} appliquée · remise {promo.type === 'PCT' ? `${promo.value} %` : `${fmt(promo.value)} FCFA`}
            </AppText>
          ) : promoCode.trim() ? (
            <AppText size="small" color="danger" style={{ marginTop: 4 }}>
              Code invalide ou minimum non atteint.
            </AppText>
          ) : null}
        </View>

        {!isCredit ? (
          <Card tone="default" style={{ gap: spacing.sm }}>
            <View style={styles.sectionHead}>
              <AppText size="label" color="muted">
                ESPÈCES REÇUES
              </AppText>
              {tendered > 0 ? (
                <AppText size="caption" weight="semibold" color="brand">
                  {fmt(tendered)} FCFA
                </AppText>
              ) : null}
            </View>
            <View style={styles.cashRow}>
              <TextInput
                value={tendered > 0 ? String(tendered) : ''}
                onChangeText={(t) => {
                  const n = parseInt(t.replace(/\D/g, ''), 10);
                  setTendered(Number.isFinite(n) ? n : 0);
                  setError(null);
                }}
                placeholder="Montant reçu (FCFA)"
                placeholderTextColor={color.ink[300]}
                keyboardType="number-pad"
                style={[styles.input, { flex: 1 }]}
              />
              {totals.totalFcfa > 0 ? (
                <Pressable onPress={() => setTendered(totals.totalFcfa)} style={styles.exactBtn} accessibilityRole="button">
                  <AppText size="small" weight="bold" color="brand">
                    Exact
                  </AppText>
                </Pressable>
              ) : null}
            </View>
            <View style={styles.quickWrap}>
              {QUICK_CASH.map((n) => {
                const active = tendered === n;
                return (
                  <Pressable
                    key={n}
                    onPress={() => {
                      setTendered(n);
                      setError(null);
                    }}
                    style={({ pressed }) => [styles.quick, active && styles.quickActive, pressed && { opacity: 0.7 }]}
                    accessibilityRole="button">
                    <AppText size="small" weight="bold" color={active ? 'surface' : 'ink'}>
                      {fmt(n)}
                    </AppText>
                  </Pressable>
                );
              })}
            </View>
            {tendered > 0 && tendered < totals.totalFcfa ? (
              <View style={styles.detailRow}>
                <AppText size="small" color="muted">
                  Reste à payer
                </AppText>
                <AppText size="small" weight="semibold" color="accent">
                  {fmt(totals.totalFcfa - tendered)} FCFA
                </AppText>
              </View>
            ) : null}
            <View style={styles.changeRow}>
              <AppText size="caption" color="muted">
                MONNAIE À RENDRE
              </AppText>
              <AppText size="h3" weight="bold" color={tendered === 0 ? 'faint' : change >= 0 ? 'success' : 'danger'}>
                {tendered > 0 ? `${fmt(Math.max(change, 0))} FCFA` : '—'}
              </AppText>
            </View>
            {tendered > 0 && change < 0 ? (
              <AppText size="small" color="danger">
                Il manque {fmt(-change)} FCFA.
              </AppText>
            ) : null}
          </Card>
        ) : (
          <Card tone="brand" style={{ gap: spacing.sm }}>
            <View style={styles.sectionHead}>
              <AppText size="label" color="brand">
                MISE À CRÉDIT
              </AppText>
              <Wallet size={16} color={color.brand[600]} />
            </View>
            <View style={styles.detailRow}>
              <AppText size="small" color="muted">
                Montant de la vente
              </AppText>
              <AppText size="small" weight="semibold" color="text">
                {fmt(totals.totalFcfa)} FCFA
              </AppText>
            </View>
            <View style={styles.detailRow}>
              <AppText size="small" color="muted">
                Déjà dû
              </AppText>
              <AppText size="small" weight="semibold" color={creditDue > 0 ? 'danger' : 'muted'}>
                {fmt(creditDue)} FCFA
              </AppText>
            </View>
            <View style={styles.sectionDivider} />
            <View style={styles.changeRow}>
              <AppText size="caption" color="muted">
                NOUVEAU SOLDE DÛ
              </AppText>
              <AppText size="h3" weight="bold" color="brand">
                {fmt(creditDue + totals.totalFcfa)} FCFA
              </AppText>
            </View>
            {customer ? null : (
              <AppText size="small" color="muted">
                Choisissez un client ci-dessous pour enregistrer la dette.
              </AppText>
            )}
          </Card>
        )}

        <Card tone="default" style={{ gap: spacing.sm }}>
          <AppText size="label" color="muted">
            {isCredit ? 'CLIENT — REQUIS (VENTE À CRÉDIT)' : 'CLIENT — OPTIONNEL (TROUVÉ OU CRÉÉ PAR TÉLÉPHONE)'}
          </AppText>
          {customer ? (
            <View style={styles.custRow}>
              <View style={styles.custIcon}>
                <UserRound size={16} color={color.brand[700]} />
              </View>
              <View style={{ flex: 1, gap: 1 }}>
                <AppText size="body" weight="semibold" color="text" numberOfLines={1}>
                  {customer.fullName}
                </AppText>
                <AppText size="caption" color="muted" numberOfLines={1}>
                  {[customer.code, customerTypeLabel(customer.type), customer.phone].filter(Boolean).join(' · ')}
                </AppText>
                {isCredit ? (
                  <AppText size="caption" color={creditDue > 0 ? 'danger' : 'muted'} numberOfLines={1}>
                    {creditDue > 0 ? `Déjà dû : ${fmtFcfa(creditDue)} FCFA` : 'Aucune dette en cours'}
                  </AppText>
                ) : null}
              </View>
              <Pressable
                onPress={() => {
                  setCustomer(null);
                  setError(null);
                }}
                hitSlop={8}
                style={styles.custClear}
                accessibilityRole="button">
                <X size={16} color={color.ink[400]} />
              </Pressable>
            </View>
          ) : (
            <>
              <Pressable
                onPress={() => {
                  setPickerOpen(true);
                  setError(null);
                }}
                style={({ pressed }) => [styles.pickBtn, pressed && { opacity: 0.7 }]}
                accessibilityRole="button">
                <UserRound size={15} color={color.brand[600]} />
                <AppText size="small" weight="bold" color="brand">
                  Choisir un client
                </AppText>
              </Pressable>
              <AppText size="caption" color="muted">
                {isCredit
                  ? 'Requise pour enregistrer la dette — recherche par nom, code ou téléphone.'
                  : 'Facultatif — recherche par nom, code ou téléphone.'}
              </AppText>
            </>
          )}
        </Card>

        {error ? (
          <AppText size="small" color="danger">
            {error}
          </AppText>
        ) : null}

        <Button
          label={isCredit ? `Vendre à crédit ${fmt(totals.totalFcfa)} FCFA` : `Encaisser ${fmt(totals.totalFcfa)} FCFA`}
          tone={isCredit ? 'brand' : 'success'}
          icon={isCredit ? Wallet : Check}
          loading={selling}
          disabled={!canSell || selling}
          onPress={() => void sell()}
        />
        <AppText size="caption" color="faint" style={{ textAlign: 'center' }}>
          {pdvName} · Espèces ou crédit client · Mobile Money bientôt disponible
        </AppText>
      </View>
      <ClientPickerSheet
        visible={pickerOpen}
        farmId={farmId}
        selectedId={customer?.id}
        creditMode={isCredit}
        onSelect={(c) => setCustomer(c)}
        onClose={() => setPickerOpen(false)}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  modeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  modeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 44,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: color.brand[200],
    backgroundColor: color.brand[50],
  },
  modeBtnActive: {
    backgroundColor: color.brand[600],
    borderColor: color.brand[600],
  },
  savedWrap: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.huge,
  },
  checkCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: palette.green[50],
    alignItems: 'center',
    justifyContent: 'center',
  },
  totalHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sectionDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: palette.border,
    marginVertical: 2,
  },
  exactBtn: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radii.md,
    backgroundColor: color.brand[50],
    borderWidth: 1,
    borderColor: color.brand[200],
  },
  input: {
    height: 44,
    borderWidth: 1,
    borderColor: palette.border,
    borderRadius: radii.md,
    paddingHorizontal: 12,
    fontSize: 15,
    color: color.ink[800],
    backgroundColor: color.surface,
  },
  cashRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  quickWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  quick: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: radii.md,
    backgroundColor: color.brand[50],
    borderWidth: 1,
    borderColor: color.brand[100],
  },
  quickActive: {
    backgroundColor: color.brand[600],
    borderColor: color.brand[600],
  },
  changeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: palette.border,
    paddingTop: 10,
    marginTop: 4,
  },
  pickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radii.md,
    backgroundColor: color.brand[50],
    borderWidth: 1,
    borderColor: color.brand[200],
  },
  custRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: color.brand[200],
    backgroundColor: color.brand[50],
  },
  custIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: color.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  custClear: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: color.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
});