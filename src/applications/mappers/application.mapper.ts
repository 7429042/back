import {
  ApplicationItemResponseDto,
  ApplicationResponseDto,
  ApplicationStatusHistoryItemDto,
  UpdateStatusResponseDto,
} from '../dto/application-response.dto';
import { StatusType } from '../schemas/application.schema';

// Приводим вход к безопасным типам (без any)
type ApplicationItemLike = {
  program: unknown;
  titleAtApplication?: unknown;
  quantity?: unknown;
  startDate?: unknown;
  endDate?: unknown;
};

type ApplicationLike = {
  _id?: unknown;
  id?: unknown;
  user?: unknown;
  items?: unknown;
  status?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
};

function toIsoOrNull(d?: unknown): string | null {
  if (!d) return null;
  if (d instanceof Date) {
    const t = d.getTime();
    return Number.isFinite(t) ? new Date(t).toISOString() : null;
  }
  if (typeof d === 'string') {
    const date = new Date(d);
    const t = date.getTime();
    return Number.isFinite(t) ? new Date(t).toISOString() : null;
  }
  return null;
}

export function mapApplication(app: unknown): ApplicationResponseDto {
  const a = app as ApplicationLike;

  const rawItems: ApplicationItemLike[] = Array.isArray(a.items)
    ? (a.items as ApplicationItemLike[])
    : [];

  const items: ApplicationItemResponseDto[] = rawItems.map((it) => ({
    programId: String(it.program),
    title:
      typeof it.titleAtApplication === 'string' ? it.titleAtApplication : '',
    quantity: typeof it.quantity === 'number' ? it.quantity : 1,
    startDate: toIsoOrNull(it.startDate),
    endDate: toIsoOrNull(it.endDate),
  }));

  return {
    id: String(a?._id ?? a?.id),
    userId: String(a?.user),
    items,
    status: (a?.status ?? 'new') as StatusType,
    createdAt: toIsoOrNull(a?.createdAt) ?? new Date().toISOString(),
    updatedAt: toIsoOrNull(a?.updatedAt) ?? new Date().toISOString(),
  };
}

export function mapStatusHistory(
  list: unknown[],
): ApplicationStatusHistoryItemDto[] {
  if (!Array.isArray(list)) return [];
  const rows = list as Array<Record<string, unknown>>;
  return rows.map((h) => ({
    from: h?.from as StatusType,
    to: h?.to as StatusType,
    changedAt: toIsoOrNull(h?.changedAt) ?? new Date().toISOString(),
    byUser: String(h?.byUser),
    comment: typeof h?.comment === 'string' ? h.comment : null,
  }));
}

// Маппер результата изменения статуса
export function mapUpdateStatusResult(res: {
  id: unknown;
  status: unknown;
  allowedNext: unknown;
  lastHistory?: unknown; // было: Record<string, unknown> | null
}): UpdateStatusResponseDto {
  type HistoryLike = {
    from?: unknown;
    to?: unknown;
    changedAt?: unknown;
    byUser?: unknown;
    comment?: unknown;
  };

  const last = res?.lastHistory as HistoryLike | undefined;

  const mappedLast: ApplicationStatusHistoryItemDto | null = last
    ? {
        from: last.from as StatusType,
        to: last.to as StatusType,
        changedAt: toIsoOrNull(last.changedAt) ?? new Date().toISOString(),
        byUser: String(last.byUser),
        comment: typeof last.comment === 'string' ? last.comment : null,
      }
    : null;

  return {
    id: String(res.id),
    status: res.status as StatusType,
    allowedNext: Array.isArray(res.allowedNext)
      ? (res.allowedNext as StatusType[])
      : [],
    lastHistory: mappedLast,
  };
}
