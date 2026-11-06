import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    setupFiles: ['./test/e2e-setup.ts'],
    // Les specs e2e bootent chacune une app Nest qui lance `synchronize` sur la même
    // base ; on force une exécution séquentielle pour éviter les courses de migration.
    fileParallelism: false,
    maxWorkers: 1,
    minWorkers: 1,
    // Each spec boots the whole app and builds its data through the registry
    // (admin, farm, activate-owner, logins: several bcrypt rounds): 10 s is
    // too tight for a beforeAll on a loaded machine.
    hookTimeout: 60_000,
  },
});
