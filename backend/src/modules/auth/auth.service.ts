import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { UserRole } from '../../common/enums/role.enum.js';
import { User } from '../users/entities/user.entity.js';
import { Farm } from '../farms/entities/farm.entity.js';
import { FarmsService } from '../farms/farms.service.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';

const DEFAULT_FARM_CITY = 'Libreville';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepo: Repository<User>,
    @InjectRepository(Farm)
    private readonly farmsRepo: Repository<Farm>,
    private readonly jwtService: JwtService,
    private readonly farmsService: FarmsService,
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
    await this.usersRepo.save(user);

    await this.ensureOwnerFarm(user, dto.farmName, dto.farmCity);

    return this.buildAuthResponse(user);
  }

  async login(dto: LoginDto) {
    const phone = dto.phone.trim().toLowerCase();
    const user = await this.usersRepo.findOne({ where: { phone } });
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
    await this.ensureOwnerFarm(user);
    return this.buildAuthResponse(user);
  }

  /** Un Propriétaire dispose toujours d'une ferme : crée la ferme par défaut sinon.
   *  Le nom saisie à l'inscription prime ; à défaut on retombe sur « Ferme de <nom> »
   *  (les farms déjà créées gardent leur nom — renommable via PATCH /farms/:farmId). */
  private async ensureOwnerFarm(user: User, farmName?: string, farmCity?: string) {
    if (user.role !== UserRole.PROPRIETAIRE) return;
    const count = await this.farmsRepo.count({ where: { ownerId: user.id } });
    if (count > 0) return;
    await this.farmsService.create(user, {
      name: farmName?.trim() || `Ferme de ${user.fullName}`,
      administrativeCity: farmCity?.trim() || DEFAULT_FARM_CITY,
    });
  }

  private buildAuthResponse(user: User) {
    const payload = { sub: user.id, role: user.role };
    const accessToken = this.jwtService.sign(payload);
    return {
      accessToken,
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
