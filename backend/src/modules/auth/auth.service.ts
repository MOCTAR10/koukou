import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { DataSource, Repository } from 'typeorm';
import { AuthUser } from '../../common/decorators/current-user.decorator.js';
import { CustomerType } from '../../common/enums/customer-type.enum.js';
import { UserRole } from '../../common/enums/role.enum.js';
import { BuyerProfile } from '../users/entities/buyer-profile.entity.js';
import { User } from '../users/entities/user.entity.js';
import { Farm } from '../farms/entities/farm.entity.js';
import { FarmsService } from '../farms/farms.service.js';
import {
  BecomeFarmerDto,
  BuyerProfileDto,
  RegisterBuyerDto,
} from './dto/buyer.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { VerifyOtpDto } from './dto/verify-otp.dto.js';
import {
  INSTITUTION_SESSION_SECONDS,
  LoginChallengeService,
  institutionOtpMode,
} from './login-challenge.service.js';
import { NO_MEMBERSHIP_MESSAGE } from '../access/access-rules.js';
import { ScopeResolver } from '../access/scope-resolver.service.js';

const DEFAULT_FARM_CITY = 'Libreville';
import { isUniqueViolation } from '../../common/utils/idempotency.js';
import { normalizePhone } from '../../common/utils/phone.js';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    @InjectRepository(Farm)
    private readonly farmsRepo: Repository<Farm>,
    @InjectRepository(BuyerProfile)
    private readonly buyerProfileRepo: Repository<BuyerProfile>,
    private readonly dataSource: DataSource,
    private readonly jwtService: JwtService,
    private readonly farmsService: FarmsService,
    private readonly challenges: LoginChallengeService,
    private readonly scope: ScopeResolver,
    private readonly config: ConfigService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.usersRepo.findOne({
      where: { phone: dto.phone },
    });
    if (existing) {
      throw new ConflictException(
        'Un compte existe déjà avec ce numéro de téléphone.',
      );
    }

    const codeHash = await bcrypt.hash(dto.code, 10);
    const user = this.usersRepo.create({
      phone: dto.phone,
      fullName: dto.fullName,
      passwordHash: codeHash,
      role: UserRole.PROPRIETAIRE,
    });
    try {
      await this.usersRepo.save(user);
    } catch (err) {
      // Two concurrent registrations: the unique index decides.
      if (isUniqueViolation(err)) {
        throw new ConflictException(
          'Un compte existe déjà avec ce numéro de téléphone.',
        );
      }
      throw err;
    }

    await this.ensureOwnerFarm(user, dto.farmName, dto.farmCity);

    return this.buildAuthResponse(user);
  }

  /** A buyer has an account and a profile, but no farm. */
  async registerBuyer(dto: RegisterBuyerDto) {
    const taken = await this.usersRepo.exists({ where: { phone: dto.phone } });
    if (taken) {
      throw new ConflictException(
        'Un compte existe déjà avec ce numéro de téléphone.',
      );
    }
    const passwordHash = await bcrypt.hash(dto.code, 10);
    try {
      const user = await this.dataSource.transaction(async (em) => {
        const created = await em.getRepository(User).save(
          em.getRepository(User).create({
            phone: dto.phone,
            fullName: dto.fullName,
            passwordHash,
            role: UserRole.ACHETEUR,
          }),
        );
        await em.getRepository(BuyerProfile).save(
          em.getRepository(BuyerProfile).create({
            userId: created.id,
            type: dto.type ?? CustomerType.PARTICULIER,
            organizationName: dto.organizationName ?? null,
            city: dto.city ?? null,
          }),
        );
        return created;
      });
      return this.buildAuthResponse(user);
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException(
          'Un compte existe déjà avec ce numéro de téléphone.',
        );
      }
      throw err;
    }
  }

  /**
   * A phone number holds one account, so a buyer who starts farming upgrades
   * that account rather than registering again. The conditional update lets
   * only one of two concurrent calls through. The buyer profile stays: an
   * owner can keep buying.
   */
  async becomeFarmer(authUser: AuthUser, dto: BecomeFarmerDto) {
    const claimed = await this.usersRepo.update(
      { id: authUser.id, role: UserRole.ACHETEUR },
      { role: UserRole.PROPRIETAIRE },
    );
    if (!claimed.affected) {
      throw new BadRequestException('Ce compte n’est pas un compte acheteur.');
    }
    const user = await this.usersRepo.findOneByOrFail({ id: authUser.id });
    await this.ensureOwnerFarm(user, dto.farmName, dto.farmCity);
    return this.buildAuthResponse(user);
  }

  getBuyerProfile(user: AuthUser) {
    return this.buyerProfileRepo.findOne({ where: { userId: user.id } });
  }

  async saveBuyerProfile(user: AuthUser, dto: BuyerProfileDto) {
    await this.buyerProfileRepo.upsert(
      {
        userId: user.id,
        type: dto.type,
        organizationName: dto.organizationName ?? null,
        city: dto.city ?? null,
      },
      ['userId'],
    );
    return this.getBuyerProfile(user);
  }

  async login(dto: LoginDto) {
    // Accounts created before phone normalization may still hold spaces.
    const raw = dto.phone.trim();
    const user = await this.usersRepo.findOne({
      where: [{ phone: normalizePhone(raw) }, { phone: raw }],
    });
    const ok = await bcrypt.compare(
      dto.code,
      user ? user.passwordHash : DUMMY_PASSWORD_HASH,
    );
    if (!user || !ok) {
      throw new UnauthorizedException(
        'Identifiants invalides. Vérifiez le numéro de téléphone et le code.',
      );
    }
    if (user.active === false) {
      throw new UnauthorizedException(
        'Ce compte a été suspendu. Contactez l’administrateur.',
      );
    }
    if (user.role === UserRole.OPERATEUR) {
      throw new UnauthorizedException(
        'Les comptes opérateurs ne sont pas encore ouverts.',
      );
    }
    if (user.role === UserRole.INSTITUTION) {
      await this.assertMembership(user);
      // Strengthened login (INSTITUTION_OTP=sms): the token comes with the
      // SMS code (POST /auth/login/otp), never with the phone + code alone.
      if (institutionOtpMode(this.config) === 'sms') {
        return this.challenges.start(user);
      }
      return this.buildAuthResponse(user, false);
    }
    await this.ensureOwnerFarm(user);
    return this.buildAuthResponse(user);
  }

  /** Second step of an institutional login: the SMS code opens an 8 h session. */
  async verifyOtp(dto: VerifyOtpDto) {
    if (institutionOtpMode(this.config) !== 'sms') {
      throw new BadRequestException(
        'La connexion par code SMS n’est pas activée sur cette instance.',
      );
    }
    const user = await this.challenges.verify(dto.challengeId, dto.code);
    await this.assertMembership(user);
    return this.buildAuthResponse(user, true);
  }

  private async assertMembership(user: User): Promise<void> {
    if (!(await this.scope.accessOf(user.id))) {
      throw new UnauthorizedException(NO_MEMBERSHIP_MESSAGE);
    }
  }

  /** Un Propriétaire dispose toujours d'une ferme : crée la ferme par défaut sinon.
   *  Le nom saisie à l'inscription prime ; à défaut on retombe sur « Ferme de <nom> »
   *  (les farms déjà créées gardent leur nom — renommable via PATCH /farms/:farmId). */
  private async ensureOwnerFarm(
    user: User,
    farmName?: string,
    farmCity?: string,
  ) {
    if (user.role !== UserRole.PROPRIETAIRE) return;
    const count = await this.farmsRepo.count({ where: { ownerId: user.id } });
    if (count > 0) return;
    await this.farmsService.create(user, {
      name: farmName?.trim() || `Ferme de ${user.fullName}`,
      administrativeCity: farmCity?.trim() || DEFAULT_FARM_CITY,
    });
  }

  /** `mfa`: the SMS code step was passed (checked by JwtStrategy when on). */
  private buildAuthResponse(user: User, mfa = false) {
    const institution = user.role === UserRole.INSTITUTION;
    // An institutional session lasts 8 h instead of the default one.
    const accessToken = institution
      ? this.jwtService.sign(
          { sub: user.id, role: user.role, ...(mfa ? { mfa: true } : {}) },
          { expiresIn: INSTITUTION_SESSION_SECONDS },
        )
      : this.jwtService.sign({ sub: user.id, role: user.role });
    return {
      accessToken,
      ...(institution ? { expiresIn: INSTITUTION_SESSION_SECONDS } : {}),
      user: {
        id: user.id,
        phone: user.phone,
        email: user.email ?? null,
        fullName: user.fullName,
        role: user.role,
      },
    };
  }
}

const DUMMY_PASSWORD_HASH = bcrypt.hashSync('kudummy-identity-check', 10);
