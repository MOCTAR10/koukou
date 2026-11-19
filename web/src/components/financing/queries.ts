import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../../api/client';
import type {
  ConsentsView,
  ConsentTemplate,
  ConsentTemplatesView,
  CreateFinancingFileBody,
  Farm360,
  FinancingFarmOption,
  FarmFinancials,
  FarmConsent,
  FarmFinancingView,
  FinancingFile,
  FinancingFilePage,
  FinancingRequirement,
  LegalBasisRow,
  PortfolioView,
  RequirementConfig,
  UpdateFinancingFileBody,
  VisitSummary,
} from '../../api/types-financing';
import { filesQuery, type FileFilters } from './financingLogic';

const BASE = '/programme/financing';

/** A refusal (no right, farm outside the perimeter) is the answer, not a hiccup. */
const noRetryOnRefusal = (count: number, err: unknown) => !(err instanceof ApiError && [401, 403, 404].includes(err.status)) && count < 2;

// Query keys. Programme-wide lists start with `financing-…`; what belongs to one farm carries `farmId` second.
export const KEYS = {
  portfolio: ['financing-portfolio'] as const,
  files: ['financing-files'] as const,
  file: (id: string) => ['financing-file', id] as const,
  requirements: ['financing-requirements'] as const,
  templates: ['financing-templates'] as const,
  consents: ['financing-consents'] as const,
  overview: (farmId: string) => ['financing-overview', farmId] as const,
  legal: ['financing-legal-basis'] as const,
  financials: (farmId: string, from: string, to: string) => ['financing-financials', farmId, from, to] as const,
  farmSide: (farmId: string) => ['farm-financing', farmId] as const,
};

export function usePortfolio(enabled = true) {
  return useQuery({ queryKey: KEYS.portfolio, queryFn: () => api.get<PortfolioView>(`${BASE}/portfolio`), enabled, retry: noRetryOnRefusal });
}

export function useFinancingFiles(filters: FileFilters, enabled = true) {
  const qs = filesQuery(filters);
  return useQuery({
    queryKey: [...KEYS.files, qs],
    queryFn: () => api.get<FinancingFilePage>(`${BASE}/files${qs}`),
    placeholderData: keepPreviousData,
    enabled,
    retry: noRetryOnRefusal,
  });
}

export function useFinancingFile(id: string | null) {
  return useQuery({
    queryKey: KEYS.file(id ?? ''),
    queryFn: () => api.get<FinancingFile>(`${BASE}/files/${id}`),
    enabled: !!id,
    retry: noRetryOnRefusal,
  });
}

/** The farm's last technical visits, to pick the field check of a tranche. */
export function useFileVisits(fileId: string, enabled = true) {
  return useQuery({
    queryKey: ['financing-file-visits', fileId],
    queryFn: () => api.get<VisitSummary[]>(`${BASE}/files/${fileId}/visits`),
    enabled,
    retry: noRetryOnRefusal,
  });
}

export function useRequirements(enabled = true) {
  return useQuery({ queryKey: KEYS.requirements, queryFn: () => api.get<FinancingRequirement[]>(`${BASE}/requirements`), enabled, retry: noRetryOnRefusal });
}

export function useConsentTemplates(enabled = true) {
  return useQuery({ queryKey: KEYS.templates, queryFn: () => api.get<ConsentTemplatesView>(`${BASE}/consent-templates`), enabled, retry: noRetryOnRefusal });
}

export interface ConsentFilters {
  status: '' | 'AUCUN' | 'ACTIF' | 'RETIRE';
  q: string;
}

export function useConsents(filters: ConsentFilters, enabled = true) {
  const qs = new URLSearchParams();
  if (filters.status) qs.set('status', filters.status);
  if (filters.q) qs.set('q', filters.q);
  const query = qs.toString();
  return useQuery({
    queryKey: [...KEYS.consents, query],
    queryFn: () => api.get<ConsentsView>(`${BASE}/consents${query ? `?${query}` : ''}`),
    placeholderData: keepPreviousData,
    enabled,
    retry: noRetryOnRefusal,
  });
}

/** The consent of one farm, read from the consents list (the route filters by name or code). */
export function useFarmConsent(farmId: string, farmCode: string, enabled = true) {
  return useQuery({
    queryKey: [...KEYS.consents, 'farm', farmId],
    queryFn: async () => {
      const view = await api.get<ConsentsView>(`${BASE}/consents?q=${encodeURIComponent(farmCode)}`);
      return view.items.find((c) => c.farmId === farmId) ?? null;
    },
    enabled,
    retry: noRetryOnRefusal,
  });
}

export function useFarm360(farmId: string) {
  return useQuery({
    queryKey: KEYS.overview(farmId),
    queryFn: () => api.get<Farm360>(`${BASE}/farms/${farmId}/overview`),
    retry: noRetryOnRefusal,
  });
}

export function useLegalBasis() {
  return useQuery({ queryKey: KEYS.legal, queryFn: () => api.get<LegalBasisRow[]>(`${BASE}/legal-basis`), staleTime: 30 * 60_000, retry: noRetryOnRefusal });
}

export function useFarmSearch(q: string, enabled = true) {
  return useQuery({
    queryKey: ['financing-farms', q],
    queryFn: () => api.get<FinancingFarmOption[]>(`${BASE}/farms?q=${encodeURIComponent(q)}`),
    placeholderData: keepPreviousData,
    enabled,
    retry: false,
  });
}

/** Financial statements of a farm over a period (needs COMPTABILITE: Consulter besides the financing domain). */
export function useFarmFinancials(farmId: string, from: string, to: string, enabled = true) {
  return useQuery({
    queryKey: KEYS.financials(farmId, from, to),
    queryFn: () => api.get<FarmFinancials>(`${BASE}/farms/${farmId}/financials?from=${from}&to=${to}`),
    enabled: enabled && !!farmId && !!from && !!to,
    retry: noRetryOnRefusal,
  });
}

export const financialsPdfUrl = (farmId: string, from: string, to: string): string => `${BASE}/farms/${farmId}/financials/pdf?from=${from}&to=${to}`;

/** The farmer's side: answers only to the farm's owner or manager, 403/404 otherwise (the menu entry then hides). */
export function useFarmFinancing(farmId: string | null, enabled = true) {
  return useQuery({
    queryKey: KEYS.farmSide(farmId ?? ''),
    queryFn: () => api.get<FarmFinancingView>(`/farms/${farmId}/financing`),
    enabled: enabled && !!farmId,
    retry: noRetryOnRefusal,
    staleTime: 60_000,
  });
}

// ── Invalidation ───────────────────────────────────────────────────────────

/** After a write on a file: the file itself, the lists, the portfolio and every 360° (amounts moved). */
export function invalidateFinancing(qc: QueryClient, opts: { fileId?: string; consent?: boolean } = {}): void {
  const keys: unknown[][] = [[...KEYS.files], [...KEYS.portfolio], ['financing-overview']];
  if (opts.fileId) keys.push([...KEYS.file(opts.fileId)]);
  // A consent given or withdrawn reopens or closes the « consentement » line of every file of the farm.
  if (opts.consent) keys.push([...KEYS.consents], [...KEYS.templates], ['farm-financing'], ['financing-file']);
  for (const queryKey of keys) void qc.invalidateQueries({ queryKey });
}

/** A write that answers with the whole file: store it, refresh the rest. */
function storeFile(qc: QueryClient, file: FinancingFile): void {
  qc.setQueryData(KEYS.file(file.id), file);
  invalidateFinancing(qc, { fileId: file.id });
}

export function useCreateFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateFinancingFileBody) => api.post<FinancingFile>(`${BASE}/files`, body),
    onSuccess: (file) => storeFile(qc, file),
  });
}

export function useUpdateFile(fileId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: UpdateFinancingFileBody) => api.patch<FinancingFile>(`${BASE}/files/${fileId}`, body),
    onSuccess: (file) => storeFile(qc, file),
  });
}

/**
 * POST on a sub-route of a file that answers with the file (step, schedule, disbursements, repayments,
 * documents, review…). A `FormData` goes through `upload`.
 */
export function useFileAction<B = unknown>(fileId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ path, body }: { path: string; body?: B | FormData }) => {
      const url = `${BASE}/files/${fileId}/${path}`;
      return body instanceof FormData ? api.upload<FinancingFile>(url, body) : api.post<FinancingFile>(url, body);
    },
    onSuccess: (file) => storeFile(qc, file),
  });
}

type RequirementBody = Partial<Omit<FinancingRequirement, 'id' | 'code'>> & Partial<Pick<RequirementConfig, 'providedBy' | 'formats' | 'validityMonths'>>;

export function useSaveRequirement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id?: string; body: RequirementBody }) =>
      id ? api.patch<FinancingRequirement>(`${BASE}/requirements/${id}`, body) : api.post<FinancingRequirement>(`${BASE}/requirements`, body),
    onSuccess: () => {
      // The checklist of every file follows the bank's list.
      void qc.invalidateQueries({ queryKey: KEYS.requirements });
      void qc.invalidateQueries({ queryKey: ['financing-file'] });
      void qc.invalidateQueries({ queryKey: KEYS.files });
      void qc.invalidateQueries({ queryKey: KEYS.portfolio });
    },
  });
}

/** Blank form of a requirement: attach or replace (multipart), remove. */
export function useRequirementTemplate() {
  const qc = useQueryClient();
  const done = () => {
    void qc.invalidateQueries({ queryKey: KEYS.requirements });
    void qc.invalidateQueries({ queryKey: ['financing-file'] });
  };
  const attach = useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) => {
      const form = new FormData();
      form.append('file', file);
      return api.upload<FinancingRequirement>(`${BASE}/requirements/${id}/template`, form);
    },
    onSuccess: done,
  });
  const remove = useMutation({ mutationFn: (id: string) => api.del<FinancingRequirement>(`${BASE}/requirements/${id}/template`), onSuccess: done });
  return { attach, remove };
}

export const requirementTemplateUrl = (id: string): string => `${BASE}/requirements/${id}/template`;

export function useUploadTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (form: FormData) => api.upload<ConsentTemplate>(`${BASE}/consent-templates`, form),
    onSuccess: () => invalidateFinancing(qc, { consent: true }),
  });
}

export function useRecordPaperConsent(farmId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (form: FormData) => api.upload<FarmConsent>(`${BASE}/farms/${farmId}/consent`, form),
    onSuccess: () => invalidateFinancing(qc, { consent: true }),
  });
}

export function useWithdrawConsent(farmId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (reason: string) => api.post<FarmConsent>(`${BASE}/farms/${farmId}/consent/withdraw`, { reason }),
    onSuccess: () => invalidateFinancing(qc, { consent: true }),
  });
}

// ── Farmer side ────────────────────────────────────────────────────────────

export function useGiveFarmConsent(farmId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { templateId: string; signerName: string; signerQuality: string; accepted: true }) =>
      api.post<FarmFinancingView>(`/farms/${farmId}/financing/consent`, body),
    onSuccess: (view) => {
      qc.setQueryData(KEYS.farmSide(farmId), view);
      invalidateFinancing(qc, { consent: true });
    },
  });
}

export function useWithdrawFarmConsent(farmId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (reason: string) => api.post<FarmFinancingView>(`/farms/${farmId}/financing/consent/withdraw`, reason ? { reason } : {}),
    onSuccess: (view) => {
      qc.setQueryData(KEYS.farmSide(farmId), view);
      invalidateFinancing(qc, { consent: true });
    },
  });
}

/** The farmer files a document on one of his files (answers with the refreshed view). */
export function useFarmerUpload(farmId: string, fileId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (form: FormData) => api.upload<FarmFinancingView>(`/farms/${farmId}/financing/files/${fileId}/documents`, form),
    onSuccess: (view) => {
      qc.setQueryData(KEYS.farmSide(farmId), view);
      invalidateFinancing(qc, { fileId });
    },
  });
}

export const farmerDocumentUrl = (farmId: string, fileId: string, docId: string): string => `/farms/${farmId}/financing/files/${fileId}/documents/${docId}/file`;
export const farmerTemplateUrl = (farmId: string, requirementId: string): string => `/farms/${farmId}/financing/requirements/${requirementId}/template`;

// ── Files ──────────────────────────────────────────────────────────────────

/** Opens an authenticated file in a new tab (the token travels in the header, never in the URL). */
export async function openFile(path: string): Promise<void> {
  const blob = await api.blob(path);
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank');
  // Pop-up blocked: fall back on the current tab, the blob URL stays valid.
  if (!win) window.location.assign(url);
  window.setTimeout(() => URL.revokeObjectURL(url), 5 * 60_000);
}

export const documentUrl = (fileId: string, docId: string): string => `${BASE}/files/${fileId}/documents/${docId}/file`;
export const templateFileUrl = (id: string): string => `${BASE}/consent-templates/${id}/file`;
export const proofUrl = (farmId: string): string => `${BASE}/farms/${farmId}/consent/proof`;
export const exportUrl = `${BASE}/portfolio/export`;
