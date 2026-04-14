function isOverdue(dueDate?: string, status?: string) {
  if (!dueDate) return false;
  if (status === 'completed') return false;

  return new Date(dueDate).getTime() < Date.now();
}
export function getLastContactedDate(
  activities: {
    type: string;
    created_at: string;
  }[]
): Date | null {
  const contactTypes = ['call', 'meeting', 'email'];

  const latest = activities
    .filter(a => contactTypes.includes(a.type))
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() -
        new Date(a.created_at).getTime()
    )[0];

  return latest ? new Date(latest.created_at) : null;
}
