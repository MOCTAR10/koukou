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
  },
});
