import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Program } from './entities/program.entity.js';

export const NO_PROGRAMME_MESSAGE = 'Aucun programme configuré.';

/**
 * The programme served by this instance, named by `PROGRAM_CODE`. Unset (the
 * public Fermia SaaS) = no programme: the programme layer is inert and its
 * endpoints answer 404.
 */
@Injectable()
export class ProgrammeService {
  private cached: Program | null = null;

  constructor(
    private readonly config: ConfigService,
    @InjectRepository(Program) private readonly programs: Repository<Program>,
  ) {}

  /** The configured programme code, or null when none. */
  configuredCode(): string | null {
    const code = this.config.get<string>('PROGRAM_CODE')?.trim();
    return code ? code : null;
  }

  /** The current programme, or null when none is configured (or not seeded yet). */
  async find(): Promise<Program | null> {
    const code = this.configuredCode();
    if (!code) return null;
    if (this.cached?.code === code) return this.cached;
    const program = await this.programs.findOne({ where: { code } });
    if (program) this.cached = program;
    return program;
  }

  /** @throws NotFoundException « Aucun programme configuré » */
  async current(): Promise<Program> {
    const program = await this.find();
    if (!program) throw new NotFoundException(NO_PROGRAMME_MESSAGE);
    return program;
  }
}
