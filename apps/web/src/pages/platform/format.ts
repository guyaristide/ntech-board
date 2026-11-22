import { ApiError } from '../../model/api';

/** Message d'une erreur de l'API, en clair. */
export const message = (e: unknown) =>
  e instanceof ApiError ? (e.message ?? e.code) : 'Erreur réseau, réessayez.';

export const day = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
