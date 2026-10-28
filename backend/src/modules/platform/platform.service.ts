import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PaymentMethod } from '../../common/enums/payment-method.enum.js';
import { UserRole } from '../../common/enums/role.enum.js';
import { BatchType } from '../../common/enums/batch-type.enum.js';
import { Species } from '../../common/enums/species.enum.js';
import { Alert } from '../alerts/entities/alert.entity.js';
import { RuleRegistry } from '../alerts/entities/rule-registry.entity.js';
import { ProductionBatch } from '../batches/entities/production-batch.entity.js';
import { Breed } from '../breeds/entities/breed.entity.js';
import { Customer } from '../finance/entities/customer.entity.js';
import { Payment } from '../finance/entities/payment.entity.js';
import { PaymentMethodConfig } from '../finance/entities/payment-method.entity.js';
import { Sale } from '../finance/entities/sale.entity.js';
import { SanitaryProtocol } from '../sanitary/entities/sanitary-protocol.entity.js';
import { FarmsService } from '../farms/farms.service.js';
import { User } from '../users/entities/user.entity.js';
import { sharedOrFarm } from '../../common/utils/farm-scope.js';

export interface PublicUser {
  id: string;
  phone: string;
  email: string | null;
  fullName: string;
  role: UserRole;
  active: boolean;
}

@Injectable()
export class PlatformService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    @InjectRepository(ProductionBatch)
    private readonly batchRepo: Repository<ProductionBatch>,
    @InjectRepository(Sale)
    private readonly saleRepo: Repository<Sale>,
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
    @InjectRepository(Alert)
    private readonly alertRepo: Repository<Alert>,
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
    @InjectRepository(RuleRegistry)
    private readonly ruleRepo: Repository<RuleRegistry>,
    @InjectRepository(PaymentMethodConfig)
    private readonly methodRepo: Repository<PaymentMethodConfig>,
    @InjectRepository(Breed)
    private readonly breedRepo: Repository<Breed>,
    @InjectRepository(SanitaryProtocol)
    private readonly protocolRepo: Repository<SanitaryProtocol>,
    private readonly farmsService: FarmsService,
  ) {}

  // ---------- Vue d'ensemble plateforme ----------

  async metrics(from?: string, to?: string) {
    const farmsRow = await this.farmCounts();
    const usersRows = await this.usersRepo
      .createQueryBuilder('u')
      .select('u.role', 'role')
      .addSelect('COUNT(*)', 'count')
      .addSelect('COUNT(*) FILTER (WHERE NOT u.active)', 'suspended')
      .groupBy('u.role')
      .getRawMany();

    const lotsRow = await this.batchRepo
      .createQueryBuilder('b')
      .select('COUNT(*)', 'lots')
      .addSelect('COALESCE(SUM(b.quantity_alive), 0)', 'cheptel')
      .where("b.status != 'CLOTURE'")
      .getRawOne();

    const salesRow = await this.buildSaleSummaryQuery(from, to).getRawOne();
    const paidRow = await this.buildPaidQuery(from, to).getRawOne();

    const alertRows = await this.alertRepo
      .createQueryBuilder('a')
      .select('a.level', 'level')
      .addSelect('COUNT(*)', 'count')
      .where("a.status = 'ACTIVE'")
      .groupBy('a.level')
      .getRawMany();

    const customersRow = await this.customerRepo
      .createQueryBuilder('c')
      .select('COUNT(*)', 'count')
      .getRawOne();

    const byRole = usersRows.map((r) => ({
      role: r.role as UserRole,
      count: Number(r.count),
      suspended: Number(r.suspended),
    }));

    return {
      farms: {
        total: Number(farmsRow.total),
        active: Number(farmsRow.active),
      },
      users: {
        total: byRole.reduce((s, r) => s + r.count, 0),
        suspended: byRole.reduce((s, r) => s + r.suspended, 0),
        byRole,
      },
      lots: { active: Number(lotsRow.lots), cheptel: Number(lotsRow.cheptel) },
      sales: {
        count: Number(salesRow.count),
        revenueFcfa: Number(salesRow.revenue),
        discountsFcfa: Number(salesRow.discounts),
      },
      paidFcfa: Number(paidRow.paid),
      alerts: {
        total: alertRows.reduce((s, r) => s + Number(r.count), 0),
        byLevel: alertRows.map((r) => ({
          level: r.level,
          count: Number(r.count),
        })),
      },
      customersCount: Number(customersRow.count),
      period: { from: from ?? null, to: to ?? null },
    };
  }

  async metricsByFarm(from?: string, to?: string) {
    const farms = await this.farmsService.listAll();

    const lots = await this.batchRepo
      .createQueryBuilder('b')
      .select('b.farm_id', 'farmId')
      .addSelect('COUNT(*)', 'lots')
      .addSelect('COALESCE(SUM(b.quantity_alive), 0)', 'cheptel')
      .where("b.status != 'CLOTURE'")
      .groupBy('b.farm_id')
      .getRawMany();

    const sales = await this.buildSaleSummaryQuery(from, to)
      .addSelect('s.farm_id', 'farmId')
      .groupBy('s.farm_id')
      .getRawMany();

    const paid = await this.buildPaidQuery(from, to)
      .addSelect('sale.farm_id', 'farmId')
      .groupBy('sale.farm_id')
      .getRawMany();

    const alerts = await this.alertRepo
      .createQueryBuilder('a')
      .select('a.farm_id', 'farmId')
      .addSelect('COUNT(*)', 'count')
      .where("a.status = 'ACTIVE'")
      .groupBy('a.farm_id')
      .getRawMany();

    const customers = await this.customerRepo
      .createQueryBuilder('c')
      .select('c.farm_id', 'farmId')
      .addSelect('COUNT(*)', 'count')
      .groupBy('c.farm_id')
      .getRawMany();

    const sum = (rows: any[], key: string, farmId: string) =>
      rows.find((r) => r.farmId === farmId)?.[key] ?? 0;

    return farms.map((farm) => {
      return {
        farm: {
          id: farm.id,
          name: farm.name,
          administrativeCity: farm.administrativeCity ?? null,
          isVerified: farm.isVerified,
          active: farm.active,
          createdAt: farm.createdAt,
        },
        owner: farm.owner ?? null,
        lots: {
          active: Number(sum(lots, 'lots', farm.id) ?? 0),
          cheptel: Number(sum(lots, 'cheptel', farm.id) ?? 0),
        },
        sales: {
          count: Number(sum(sales, 'count', farm.id) ?? 0),
          revenueFcfa: Number(sum(sales, 'revenue', farm.id) ?? 0),
          discountsFcfa: Number(sum(sales, 'discounts', farm.id) ?? 0),
        },
        paidFcfa: Number(sum(paid, 'paid', farm.id) ?? 0),
        alertsActive: Number(sum(alerts, 'count', farm.id) ?? 0),
        customersCount: Number(sum(customers, 'count', farm.id) ?? 0),
      };
    });
  }

  private buildSaleSummaryQuery(from?: string, to?: string) {
    const q = this.saleRepo
      .createQueryBuilder('s')
      .select('COUNT(*)', 'count')
      .addSelect('COALESCE(SUM(s.total_amount_fcfa), 0)', 'revenue')
      .addSelect('COALESCE(SUM(s.discount_amount_fcfa), 0)', 'discounts')
      .where("s.status != 'CANCELLED'");
    if (from) q.andWhere('s.sale_date >= :from', { from });
    if (to) q.andWhere('s.sale_date <= :to', { to });
    return q;
  }

  private buildPaidQuery(from?: string, to?: string) {
    const q = this.paymentRepo
      .createQueryBuilder('p')
      .innerJoin(Sale, 'sale', 'sale.id = p.sale_id')
      .select('COALESCE(SUM(p.amount_fcfa), 0)', 'paid')
      .where("p.status = 'CONFIRMED'");
    if (from) q.andWhere('p.payment_date >= :from', { from });
    if (to) q.andWhere('p.payment_date <= :to', { to });
    return q;
  }

  private async farmCounts() {
    const row = await this.usersRepo.manager
      .createQueryBuilder()
      .select('COUNT(*)', 'total')
      .addSelect('COUNT(*) FILTER (WHERE active)', 'active')
      .from('farms', 'f')
      .getRawOne();
    return { total: row.total, active: row.active };
  }

  // ---------- Utilisateurs ----------

  async listUsers(): Promise<PublicUser[]> {
    const users = await this.usersRepo.find({
      order: { createdAt: 'DESC' },
    });
    return users.map((u) => ({
      id: u.id,
      phone: u.phone,
      email: u.email ?? null,
      fullName: u.fullName,
      role: u.role,
      active: u.active,
    }));
  }

  async setUserActive(userId: string, suspended: boolean): Promise<PublicUser> {
    const user = await this.usersRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('Utilisateur introuvable.');
    if (user.role === UserRole.PLATFORM_ADMIN) {
      throw new BadRequestException(
        'Un administrateur plateforme ne peut pas être suspendu.',
      );
    }
    if (user.active === (suspended ? false : true)) {
      return this.toPublicUser(user);
    }
    user.active = !suspended;
    await this.usersRepo.save(user);
    return this.toPublicUser(user);
  }

  /** Suspendre / réactiver un utilisateur. `suspended: true` suspend. */
  async suspendUser(userId: string, suspended: boolean): Promise<PublicUser> {
    return this.setUserActive(userId, suspended);
  }

  private toPublicUser(user: User): PublicUser {
    return {
      id: user.id,
      phone: user.phone,
      email: user.email ?? null,
      fullName: user.fullName,
      role: user.role,
      active: user.active,
    };
  }

  // ---------- Règles d'alertes ----------

  listRules() {
    return this.ruleRepo.find({
      where: { isActive: true },
      order: { category: 'ASC', code: 'ASC' },
    });
  }

  // ---------- Configuration (méthodes de paiement, souches, protocoles) ----------

  async setPaymentMethodEnabled(code: string, enabled: boolean) {
    const method = await this.methodRepo.findOne({
      where: { code: code as PaymentMethod },
    });
    if (!method) throw new NotFoundException('Méthode de paiement inconnue.');
    if (code === PaymentMethod.CASH && !enabled) {
      throw new BadRequestException(
        'Les espèces ne peuvent pas être désactivées (prérequis du point de vente).',
      );
    }
    method.enabled = enabled;
    return this.methodRepo.save(method);
  }

  async updateBreed(
    id: string,
    input: {
      name?: string;
      type?: BatchType;
      species?: Species;
      active?: boolean;
    },
  ) {
    const breed = await this.breedRepo.findOne({ where: { id } });
    if (!breed) throw new NotFoundException('Souche introuvable.');
    if (input.name != null && input.name !== breed.name) {
      const clash = await this.breedRepo.findOne({
        where: sharedOrFarm<Breed>(breed.farmId, { name: input.name }),
      });
      if (clash)
        throw new ConflictException(
          'Une souche porte déjà ce nom. Choisissez un autre nom.',
        );
      breed.name = input.name;
    }
    if (input.type) breed.type = input.type;
    if (input.species) breed.species = input.species;
    if (input.active != null) breed.active = input.active;
    return this.breedRepo.save(breed);
  }

  async updateProtocol(
    id: string,
    input: { name?: string; isEditable?: boolean },
  ) {
    const protocol = await this.protocolRepo.findOne({ where: { id } });
    if (!protocol)
      throw new NotFoundException('Protocole sanitaire introuvable.');
    if (input.name != null) protocol.name = input.name;
    if (input.isEditable != null) protocol.isEditable = input.isEditable;
    return this.protocolRepo.save(protocol);
  }
}
