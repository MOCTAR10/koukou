import type { QueryClient } from '@tanstack/react-query';

/**
 * Invalide les queries serveur d'une ferme après une mutation qui a été
 * envoyée (saisie journalière, vente, soin, caisse…), pour rafraîchir les
 * écrans. Clés couvertes : advisory, batches, dashboard, batch, curve,
 * feed-stock, caisse, caisse-sessions, sanitary, prophylaxis,
 * slaughter-orders, customers, promotions, rentabilite, farm-members,
 * batch-health, pondage.
 */
export function invalidateFarmQueries(
  queryClient: QueryClient,
  options: { farmId: string; batchId?: string },
): void {
  const { farmId, batchId } = options;
  void queryClient.invalidateQueries({ queryKey: ['advisory', farmId] });
  void queryClient.invalidateQueries({ queryKey: ['batches', farmId] });
  void queryClient.invalidateQueries({ queryKey: ['dashboard', farmId] });
  void queryClient.invalidateQueries({ queryKey: ['feed-stock', farmId] });
  void queryClient.invalidateQueries({ queryKey: ['feed-stock', 'movements', farmId] });
  void queryClient.invalidateQueries({ queryKey: ['feed-products', farmId] });
  void queryClient.invalidateQueries({ queryKey: ['caisse', farmId] });
  void queryClient.invalidateQueries({ queryKey: ['caisse-sessions', farmId] });
  void queryClient.invalidateQueries({ queryKey: ['slaughter-orders', farmId] });
  void queryClient.invalidateQueries({ queryKey: ['customers', farmId] });
  void queryClient.invalidateQueries({ queryKey: ['promotions', farmId] });
  void queryClient.invalidateQueries({ queryKey: ['points-of-sale', farmId] });
  void queryClient.invalidateQueries({ queryKey: ['stock-transfers', farmId] });
  void queryClient.invalidateQueries({ queryKey: ['sales', farmId] });
  void queryClient.invalidateQueries({ queryKey: ['orders', farmId] });
  void queryClient.invalidateQueries({ queryKey: ['rentabilite', farmId] });
  void queryClient.invalidateQueries({ queryKey: ['farm-members', farmId] });
  void queryClient.invalidateQueries({ queryKey: ['tasks', farmId] });
  if (batchId) {
    void queryClient.invalidateQueries({ queryKey: ['batch', farmId, batchId] });
    void queryClient.invalidateQueries({ queryKey: ['curve', farmId, batchId] });
    void queryClient.invalidateQueries({ queryKey: ['sanitary', farmId, batchId] });
    void queryClient.invalidateQueries({ queryKey: ['prophylaxis', farmId, batchId] });
    void queryClient.invalidateQueries({ queryKey: ['treatments', farmId, batchId] });
    void queryClient.invalidateQueries({ queryKey: ['health', farmId, batchId] });
    void queryClient.invalidateQueries({ queryKey: ['batch-health', farmId, batchId] });
    void queryClient.invalidateQueries({ queryKey: ['pondage', farmId, batchId] });
    void queryClient.invalidateQueries({ queryKey: ['health-events', farmId, batchId] });
    void queryClient.invalidateQueries({ queryKey: ['rentabilite-batch', farmId, batchId] });
  }
}