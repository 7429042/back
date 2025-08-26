import { StatusType } from './schemas/application.schema';

export const STATUS_TRANSITIONS: Record<StatusType, StatusType[]> = {
  [StatusType.NEW]: [StatusType.IN_REVIEW],
  [StatusType.IN_REVIEW]: [StatusType.APPROVED, StatusType.REJECTED],
  [StatusType.APPROVED]: [],
  [StatusType.REJECTED]: [],
};

export function canTransition(current: StatusType, next: StatusType): boolean {
  return STATUS_TRANSITIONS[current]?.includes(next) ?? false;
}
