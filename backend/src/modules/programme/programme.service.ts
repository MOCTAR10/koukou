import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Program } from './entities/program.entity.js';
import { requireProgramCode } from './program-code.js';

/**
 * The programme served by this instance, named by `PROGRAM_CODE`
 * (mandatory: the constructor stops the boot without it). Its row is seeded
 * at boot by `ProgrammeSeedService`.
 */
@Injectable()
export class ProgrammeService {
  private cached: Program | null = null;
  private readonly code: string;

  constructor(
    config: ConfigService,
    @InjectRepository(Program) private readonly programs: Repository<Program>,
  ) {
    this.code = requireProgramCode(config.get<string>('PROGRAM_CODE'));
  }

  /** The configured programme code. */
  configuredCode(): string {
    return this.code;
  }

  /**
   * The current programme.
   * @throws Error when its row is missing (the boot seed creates it)
   */
  async current(): Promise<Program> {
    if (this.cached) return this.cached;
    const program = await this.programs.findOne({ where: { code: this.code } });
    if (!program) {
      throw new Error(
        `Programme ${this.code} absent de la base : il est créé au démarrage par ProgrammeSeedService.`,
      );
    }
    this.cached = program;
    return program;
  }
}
