export const uid = () => Math.random().toString(36).slice(2, 10);
export const nowIso = () => new Date().toISOString();
