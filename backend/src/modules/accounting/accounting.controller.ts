import { Body, Controller, Get, Param, Post, Query, Res } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';
import type { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { Permissions } from '../../common/decorators/permissions.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { UserRole } from '../../common/enums/role.enum.js';
import { CsvService } from '../../common/services/csv.service.js';
import { PdfService } from '../../common/services/pdf.service.js';
import { AccountingService } from './accounting.service.js';
import { CreateRegularisationDto } from './dto/accounting.dto.js';
import type { AccountSoldes } from './accounting.service.js';

@ApiTags('Comptabilité SYSCOHADA')
@Controller('farms/:farmId/accounting')
export class AccountingController {
  constructor(
    private readonly accountingService: AccountingService,
    private readonly pdfService: PdfService,
    private readonly csvService: CsvService,
  ) {}

  private periodLabel(from?: string, to?: string): string {
    if (from && to) return `Période : ${from} → ${to}`;
    if (from) return `Depuis le ${from}`;
    if (to) return `Jusqu'au ${to}`;
    return 'Toute la période';
  }

  @Post('init')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @Permissions('compta:ecritures')
  @ApiOperation({
    summary:
      'Initialise la comptabilité : plan comptable OHADA + repasse de tout l’historique (ventes, paiements, caisse, dépenses, intrants). Idempotent.',
  })
  @ApiParam({ name: 'farmId' })
  initialize(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
  ) {
    return this.accountingService.initialize(user, farmId);
  }

  @Post('entries')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @Permissions('compta:ecritures')
  @ApiOperation({
    summary: 'Écriture de régularisation manuelle (écriture équilibrée).',
  })
  @ApiParam({ name: 'farmId' })
  createRegularisation(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Body() dto: CreateRegularisationDto,
  ) {
    return this.accountingService.createRegularisation(user, farmId, dto);
  }

  @Get('journal')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @Permissions('compta:rapports')
  @ApiOperation({ summary: 'Journal — toutes les écritures chronologiques.' })
  @ApiParam({ name: 'farmId' })
  @ApiQuery({ name: 'from', required: false, example: '2026-08-01' })
  @ApiQuery({ name: 'to', required: false, example: '2026-08-31' })
  journal(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.accountingService.journal(user, farmId, from, to);
  }

  @Get('grand-livre')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @Permissions('compta:rapports')
  @ApiOperation({ summary: 'Grand livre — mouvements détaillés par compte.' })
  @ApiParam({ name: 'farmId' })
  @ApiQuery({ name: 'from', required: false, example: '2026-08-01' })
  @ApiQuery({ name: 'to', required: false, example: '2026-08-31' })
  @ApiQuery({ name: 'accountCode', required: false, example: '571' })
  grandLivre(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('accountCode') accountCode?: string,
  ) {
    return this.accountingService.grandLivre(
      user,
      farmId,
      from,
      to,
      accountCode,
    );
  }

  @Get('balance')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @Permissions('compta:rapports')
  @ApiOperation({ summary: 'Balance d’essai — soldes de tous les comptes.' })
  @ApiParam({ name: 'farmId' })
  @ApiQuery({ name: 'from', required: false, example: '2026-08-01' })
  @ApiQuery({ name: 'to', required: false, example: '2026-08-31' })
  balance(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.accountingService.balance(user, farmId, from, to);
  }

  @Get('compte-resultat')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @Permissions('compta:rapports')
  @ApiOperation({
    summary: 'Compte de résultat — charges (classe 6) vs produits (classe 7).',
  })
  @ApiParam({ name: 'farmId' })
  @ApiQuery({ name: 'from', required: false, example: '2026-08-01' })
  @ApiQuery({ name: 'to', required: false, example: '2026-08-31' })
  compteResultat(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.accountingService.compteResultat(user, farmId, from, to);
  }

  @Get('bilan')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @Permissions('compta:rapports')
  @ApiOperation({ summary: 'Bilan — actif / passif / résultat.' })
  @ApiParam({ name: 'farmId' })
  @ApiQuery({ name: 'from', required: false, example: '2026-08-01' })
  @ApiQuery({ name: 'to', required: false, example: '2026-08-31' })
  bilan(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.accountingService.bilan(user, farmId, from, to);
  }

  @Get('stock')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @Permissions('compta:rapports')
  @ApiOperation({
    summary:
      'Stock provende valorisé (classe 3) : disponible comptable par lot × coût unitaire.',
  })
  @ApiParam({ name: 'farmId' })
  stock(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
  ) {
    return this.accountingService.stockProvende(user, farmId);
  }

  @Get('exercices')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @Permissions('compta:rapports')
  @ApiOperation({ summary: 'Exercices comptables de la ferme.' })
  @ApiParam({ name: 'farmId' })
  exercices(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
  ) {
    return this.accountingService.exercices(user, farmId);
  }

  @Post('exercices/:exerciceId/close')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @Permissions('compta:ecritures')
  @ApiOperation({
    summary:
      'Clôture un exercice passé : stock final (311/603), résultat rapporté à nouveau (129/12), ouverture de l’exercice suivant.',
  })
  @ApiParam({ name: 'farmId' })
  @ApiParam({ name: 'exerciceId' })
  cloturer(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Param('exerciceId') exerciceId: string,
  ) {
    return this.accountingService.cloturer(user, farmId, exerciceId);
  }

  @Get('export')
  @Roles(UserRole.PROPRIETAIRE, UserRole.ELEVEUR)
  @Permissions('compta:rapports')
  @ApiOperation({
    summary:
      'Export PDF ou CSV du rapport demandé (journal, grand-livre, balance, compte-resultat, bilan).',
  })
  @ApiParam({ name: 'farmId' })
  @ApiQuery({ name: 'report', required: true, enum: ['journal', 'grand-livre', 'balance', 'compte-resultat', 'bilan'] })
  @ApiQuery({ name: 'format', required: false, enum: ['pdf', 'csv'], description: 'Défaut : pdf' })
  @ApiQuery({ name: 'from', required: false, example: '2026-08-01' })
  @ApiQuery({ name: 'to', required: false, example: '2026-08-31' })
  async export(
    @CurrentUser() user: AuthUser,
    @Param('farmId') farmId: string,
    @Query('report') report: string,
    @Query('format') format: string | undefined,
    @Res() res: Response,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const kind = report ?? 'journal';
    const fmt = format === 'csv' ? 'csv' : 'pdf';
    const farm = await this.accountingService.findFarm(user, farmId);

    if (fmt === 'csv') {
      const csv = await this.buildCsv(user, farmId, kind, from, to);
      res.set({
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="koukou-${kind}-${from ?? 'all'}-${to ?? 'now'}.csv"`,
      });
      res.send(csv);
      return;
    }

    const reportData = await this.buildPdfData(user, farmId, kind, from, to);
    const pdf = await this.pdfService.createAccountingPdf({
      farmName: farm.name,
      title:
        kind === 'journal'
          ? 'Journal comptable'
          : kind === 'grand-livre'
            ? 'Grand livre'
            : kind === 'balance'
              ? 'Balance d’essai'
              : kind === 'compte-resultat'
                ? 'Compte de résultat'
                : 'Bilan',
      period: this.periodLabel(from, to),
      generatedAtLabel: new Date().toLocaleString('fr-FR'),
      sections: reportData.sections,
      totals: reportData.totals,
    });
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="koukou-${kind}-${from ?? 'all'}-${to ?? 'now'}.pdf"`,
    });
    res.send(pdf);
  }

  private async buildPdfData(
    user: AuthUser,
    farmId: string,
    kind: string,
    from?: string,
    to?: string,
  ) {
    if (kind === 'journal') {
      const journal = await this.accountingService.journal(user, farmId, from, to);
      return {
        sections: [
          {
            title: 'Journal',
            columns: ['Date', 'Référence', 'Libellé', 'Débit (FCFA)', 'Crédit (FCFA)'],
            rows: journal.entries.flatMap((e) =>
              e.lines.map((l) => [
                e.entryDate,
                e.reference,
                `${e.label}${l.accountCode ? ` · ${l.accountCode}` : ''}`,
                l.debitFcfa ? String(l.debitFcfa) : '',
                l.creditFcfa ? String(l.creditFcfa) : '',
              ]),
            ),
            totals: [
              {
                label: 'Total journal',
                value: `${journal.totals.debit} / ${journal.totals.credit} FCFA`,
              },
            ],
          },
        ],
        totals: [
          {
            label: 'Nombre d’écritures',
            value: String(journal.entries.length),
          },
        ],
      };
    }

    if (kind === 'balance') {
      const balance = await this.accountingService.balance(user, farmId, from, to);
      return {
        sections: balance.byClasse.map((group) => ({
          title: `Classe ${group.classe}`,
          columns: ['Compte', 'Libellé', 'Débit (FCFA)', 'Crédit (FCFA)', 'Solde (FCFA)'],
          rows: group.accounts.map((a: AccountSoldes) => [
            a.code,
            a.label,
            String(a.debitTotalFcfa),
            String(a.creditTotalFcfa),
            `${a.soldeFcfa >= 0 ? '' : '-'}${Math.abs(a.soldeFcfa)}`,
          ]),
        })),
        totals: [
          {
            label: 'Total général',
            value: `${balance.totals.totalDebit} / ${balance.totals.totalCredit} FCFA`,
          },
        ],
      };
    }

    if (kind === 'compte-resultat') {
      const resultat = await this.accountingService.compteResultat(user, farmId, from, to);
      return {
        sections: [
          {
            title: 'Charges (classe 6)',
            columns: ['Compte', 'Libellé', 'Montant (FCFA)'],
            rows: resultat.charges.map((a: AccountSoldes) => [
              a.code,
              a.label,
              String(a.soldeFcfa),
            ]),
            totals: [
              { label: 'Total charges', value: String(resultat.totalCharges) },
            ],
          },
          {
            title: 'Produits (classe 7)',
            columns: ['Compte', 'Libellé', 'Montant (FCFA)'],
            rows: resultat.produits.map((a: AccountSoldes) => [
              a.code,
              a.label,
              String(a.soldeFcfa),
            ]),
            totals: [
              { label: 'Total produits', value: String(resultat.totalProduits) },
            ],
          },
        ],
        totals: [
          {
            label: 'Résultat net',
            value: `${resultat.resultatNegatif ? '-' : ''}${Math.abs(resultat.resultatFcfa)} FCFA`,
          },
        ],
      };
    }

    if (kind === 'bilan') {
      const bilan = await this.accountingService.bilan(user, farmId, from, to);
      return {
        sections: [
          {
            title: 'Actif',
            columns: ['Compte', 'Libellé', 'Solde (FCFA)'],
            rows: bilan.actif.map((a: AccountSoldes) => [
              a.code,
              a.label,
              String(a.soldeFcfa),
            ]),
            totals: [
              { label: 'Total actif', value: String(bilan.totalActif) },
            ],
          },
          {
            title: 'Passif externe',
            columns: ['Compte', 'Libellé', 'Solde (FCFA)'],
            rows: bilan.passif.map((a: AccountSoldes) => [
              a.code,
              a.label,
              String(-a.soldeFcfa),
            ]),
            totals: [
              {
                label: 'Total passif externe',
                value: String(bilan.totalPassifExterne),
              },
            ],
          },
          {
            title: 'Capitaux propres',
            columns: ['Compte', 'Libellé', 'Solde (FCFA)'],
            rows: [
              ...bilan.capitaux.map((a: AccountSoldes) => [
                a.code,
                a.label,
                String(-a.soldeFcfa),
              ]),
              [
                'Résultat net',
                '',
                `${bilan.resultatNegatif ? '-' : ''}${Math.abs(bilan.resultatFcfa)}`,
              ],
            ],
            totals: [
              {
                label: 'Total capitaux propres',
                value: String(bilan.totalCapitaux),
              },
            ],
          },
        ],
        totals: [
          {
            label: 'Total bilan',
            value: `${bilan.totalActif} FCFA`,
          },
          {
            label: 'Écart bilan',
            value: String(bilan.ecartFcfa),
          },
        ],
      };
    }

    // grand-livre (défaut)
    const livre = await this.accountingService.grandLivre(user, farmId, from, to);
    return {
      sections: livre.map((account) => ({
        title: `${account.account} — ${account.label ?? ''}`,
        columns: ['Date', 'Référence', 'Libellé', 'Débit (FCFA)', 'Crédit (FCFA)'],
        rows: account.mouvements.map((m) => [
          m.date,
          m.reference,
          m.label,
          m.debitFcfa ? String(m.debitFcfa) : '',
          m.creditFcfa ? String(m.creditFcfa) : '',
        ]),
        totals: [
          {
            label: 'Solde',
            value: `${account.soldeFcfa >= 0 ? '' : '-'}${Math.abs(account.soldeFcfa)} FCFA`,
          },
        ],
      })),
      totals: [
        {
          label: 'Comptes avec mouvements',
          value: String(livre.filter((a) => a.mouvements.length > 0).length),
        },
      ],
    };
  }

  private async buildCsv(
    user: AuthUser,
    farmId: string,
    kind: string,
    from?: string,
    to?: string,
  ): Promise<Buffer> {
    if (kind === 'journal') {
      const journal = await this.accountingService.journal(user, farmId, from, to);
      const rows = journal.entries.flatMap((e) =>
        e.lines.map((l) => ({
          date: e.entryDate,
          reference: e.reference,
          label: e.label,
          account: l.accountCode,
          debit: l.debitFcfa,
          credit: l.creditFcfa,
        })),
      );
      return this.csvService.toCsvObject(
        ['Date', 'Référence', 'Libellé', 'Compte', 'Débit', 'Crédit'],
        rows,
      );
    }

    const soldes = await this.accountingService.soldes(user, farmId, from, to);

    if (kind === 'grand-livre') {
      const livre = await this.accountingService.grandLivre(user, farmId, from, to);
      const rows = livre.flatMap((account) =>
        account.mouvements.map((m) => ({
          compte: account.account,
          libelle_compte: account.label ?? '',
          date: m.date,
          reference: m.reference,
          libelle: m.label,
          debit: m.debitFcfa,
          credit: m.creditFcfa,
          solde: account.soldeFcfa,
        })),
      );
      return this.csvService.toCsvObject(
        ['Compte', 'Libellé compte', 'Date', 'Référence', 'Libellé', 'Débit', 'Crédit', 'Solde'],
        rows,
      );
    }

    const headers = ['Compte', 'Libellé', 'Débit', 'Crédit', 'Solde'];
    const rows = soldes.map((s) => ({
      compte: s.code,
      libelle: s.label,
      debit: s.debitTotalFcfa,
      credit: s.creditTotalFcfa,
      solde: s.soldeFcfa,
    }));
    if (kind === 'compte-resultat') {
      return this.csvService.toCsvObject(
        headers,
        rows.filter((r) => r.compte.startsWith('6') || r.compte.startsWith('7')),
      );
    }
    if (kind === 'bilan') {
      return this.csvService.toCsvObject(
        headers,
        rows.filter((r) => !r.compte.startsWith('6') && !r.compte.startsWith('7')),
      );
    }
    return this.csvService.toCsvObject(headers, rows);
  }
}