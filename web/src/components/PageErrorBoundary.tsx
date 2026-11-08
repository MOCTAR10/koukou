import { Component, type ErrorInfo, type ReactNode } from 'react';

/** A page that throws while rendering (unexpected server data) shows a message, not a white screen. */
export class PageErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Page error', error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="mx-auto max-w-md rounded-xl border border-red-200 bg-red-50 p-6 text-center text-sm text-red-800">
        <p className="text-base font-semibold">Cette page n’a pas pu s’afficher.</p>
        <p className="mt-1">Vos saisies déjà enregistrées ne sont pas perdues. Rechargez la page ; si le problème continue, prévenez le support.</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="mt-4 rounded-lg bg-red-700 px-4 py-2 font-semibold text-white hover:bg-red-800"
        >
          Recharger
        </button>
      </div>
    );
  }
}
