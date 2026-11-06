import { keepPreviousData, useQuery, type QueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../api/client';
import type { ImportJob, ImportJobStatus, ImportJobSummary, ImportJobType, ImportRowsPage, ImportTemplate, RecoveryReport } from '../../api/types-admin';

export function useImportTemplates() {
  return useQuery({
    queryKey: ['import-templates'],
    queryFn: () => api.get<ImportTemplate[]>('/programme/imports/templates'),
    staleTime: 30 * 60_000,
  });
}

export function useImportJobs(filters: { type: ImportJobType | ''; status: ImportJobStatus | '' }) {
  const q = new URLSearchParams({ ...(filters.type ? { type: filters.type } : {}), ...(filters.status ? { status: filters.status } : {}) }).toString();
  return useQuery({
    queryKey: ['import-jobs', q],
    queryFn: () => api.getFresh<ImportJobSummary[]>(`/programme/imports${q ? `?${q}` : ''}`),
  });
}

/** A job: always the server's current state (steps depend on it). */
export function useImportJob(id: string) {
  return useQuery({
    queryKey: ['import-job', id],
    queryFn: () => api.getFresh<ImportJob>(`/programme/imports/${id}`),
    retry: (count, err) => !(err instanceof ApiError && (err.status === 404 || err.status === 403)) && count < 2,
  });
}

export function useImportRows(id: string, qs: string, version: string) {
  return useQuery({
    // `version`: the job's last change, so the rows follow every step.
    queryKey: ['import-rows', id, qs, version],
    queryFn: () => api.getFresh<ImportRowsPage>(`/programme/imports/${id}/rows${qs}`),
    placeholderData: keepPreviousData,
  });
}

export function useImportReport(id: string, version: string, enabled: boolean) {
  return useQuery({
    queryKey: ['import-report', id, version],
    queryFn: () => api.getFresh<RecoveryReport>(`/programme/imports/${id}/report`),
    enabled,
  });
}

/** Stores a step's answer (the job) and refreshes the list, rows and report. */
export function storeJob(queryClient: QueryClient, job: ImportJob): void {
  queryClient.setQueryData(['import-job', job.id], job);
  void queryClient.invalidateQueries({ queryKey: ['import-jobs'] });
  void queryClient.invalidateQueries({ queryKey: ['import-rows', job.id] });
  void queryClient.invalidateQueries({ queryKey: ['import-report', job.id] });
}

/** A 409 means the job moved on (another tab, another person): read its current state. */
export function reloadOnConflict(queryClient: QueryClient, id: string, err: unknown): void {
  if (err instanceof ApiError && err.status === 409) void queryClient.invalidateQueries({ queryKey: ['import-job', id] });
}

/** Changes of a job that the rows and the report depend on. */
export function jobVersion(job: Pick<ImportJob, 'status' | 'controlledAt' | 'dryRunAt' | 'validatedAt' | 'integratedAt' | 'rejectedAt' | 'analysedAt'>): string {
  return [job.status, job.analysedAt, job.controlledAt, job.dryRunAt, job.validatedAt, job.integratedAt, job.rejectedAt].join('|');
}
