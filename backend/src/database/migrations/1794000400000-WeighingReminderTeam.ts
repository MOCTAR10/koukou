import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * POUFA lot A (CDC n° 8 « rappel en cas de retard »): the late-weighing
 * reminder of the farm goes to the whole team (owner + every active member,
 * ELEVEUR members included, who do the weighing), not only the managers.
 * Rules seeded before keep any audience an administrator chose: only the
 * untouched default (FARM_MANAGERS) moves to FARM_TEAM. New programmes get
 * FARM_TEAM from `notify/data/default-rules.ts`.
 */
export class WeighingReminderTeam1794000400000 implements MigrationInterface {
  name = 'WeighingReminderTeam1794000400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE notification_rules
          SET audience = 'FARM_TEAM',
              label = 'Ferme (toute l''équipe) : rappel de pesée en retard'
        WHERE code = 'FERME_PESEE_RETARD' AND audience = 'FARM_MANAGERS'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE notification_rules
          SET audience = 'FARM_MANAGERS',
              label = 'Ferme : rappel de pesée en retard'
        WHERE code = 'FERME_PESEE_RETARD' AND audience = 'FARM_TEAM'`,
    );
  }
}
