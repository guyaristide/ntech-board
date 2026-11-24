import type { SlackEventGroup, SlackLinkRequest, SlackStatus } from '@board/shared';
import { api } from './api';

/** Liaison Slack du projet (Réglages › Intégrations) et liaison d'un compte Slack à un membre. */
export const slack = {
  status: () => api.get<SlackStatus>('/slack'),
  save: (patch: { webhook?: string; signingSecret?: string; events?: SlackEventGroup[] }) =>
    api.put<SlackStatus>('/slack', patch),
  test: () => api.post<{ ok: boolean; message: string }>('/slack/test'),
  linkRequest: (token: string) => api.get<SlackLinkRequest>(`/slack/link/${encodeURIComponent(token)}`),
  confirmLink: (token: string) => api.post<{ ok: true }>(`/slack/link/${encodeURIComponent(token)}`),
};
