export interface AttendanceRecord {
  tenantId: string;
  /** yyyymmdd */
  day: string;
  learnerId: string;
  present: boolean;
  markedBy?: string;
  /** ISO-8601; the clock of whichever client marked it — drives LWW merge. */
  updatedAt: string;
}
