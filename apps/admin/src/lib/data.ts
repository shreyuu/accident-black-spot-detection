import 'server-only';

import { Timestamp } from 'firebase-admin/firestore';

import {
  COLLECTIONS,
  type AdminAuditAction,
  type BlackSpotCategory,
  type IncidentSeverity,
  type IncidentType,
  type ReportStatus,
  type RiskLevel,
} from '@accident-black-spot-detection/shared-types';

import { serverEnv } from '@/lib/env';
import { getAdminFirestore } from '@/lib/firebaseAdmin';
import { toPublicReporter, type PublicReporter } from '@/lib/reporterPrivacy';

/**
 * Server-side reads for the dashboard.
 *
 * Everything returned from here is **plain, serialisable data** — no Firestore
 * `Timestamp` instances, no document references. Server components hand these
 * objects to client components, and a class instance cannot cross that boundary;
 * it fails at runtime with an unhelpful serialisation error rather than at
 * compile time. Converting once, here, keeps that mistake out of the pages.
 */

/** How many rows a queue page shows. Bounded so one query stays cheap. */
export const PAGE_SIZE = 50;

function toIso(value: unknown): string | null {
  return value instanceof Timestamp ? value.toDate().toISOString() : null;
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asNumber(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export interface ReportRow {
  id: string;
  /**
   * The reporter, pseudonymised.
   *
   * There is deliberately **no `reporterId`** on this type. These rows are
   * handed to client components, and Next.js serialises a client component's
   * props into the HTML — so a raw uid here is a uid in the page source of every
   * moderator's browser, which is precisely what `firestore.rules` refuses to
   * any client and what the Admin SDK path has to refuse for itself. See
   * `lib/reporterPrivacy.ts`.
   *
   * Its absence from the type is the control: reintroducing the uid requires
   * editing this interface, at which point somebody is reading this comment.
   */
  reporter: PublicReporter;
  type: IncidentType;
  severity: IncidentSeverity;
  status: ReportStatus;
  description: string;
  latitude: number;
  longitude: number;
  imageUrls: string[];
  moderationNotes: string | null;
  occurredAt: string | null;
  createdAt: string | null;
}

export interface BlackSpotRow {
  id: string;
  name: string;
  category: BlackSpotCategory;
  riskLevel: RiskLevel;
  latitude: number;
  longitude: number;
  radiusM: number;
  verified: boolean;
  active: boolean;
  source: string;
  reportCount: number;
  createdAt: string | null;
}

export interface AuditRow {
  id: string;
  actorEmail: string;
  actorRole: string;
  action: AdminAuditAction;
  targetType: string;
  targetId: string;
  summary: string;
  createdAt: string | null;
}

/**
 * Reports awaiting a decision, oldest first.
 *
 * Oldest first on purpose: a queue served newest-first quietly abandons the
 * reports nobody got to, and the person who waited longest is the one most
 * entitled to an answer. Uses the `status + createdAt` index added in Phase 5.
 */
export async function fetchPendingReports(actorUid: string): Promise<ReportRow[]> {
  const snapshot = await getAdminFirestore()
    .collection(COLLECTIONS.incidentReports)
    .where('status', '==', 'pending')
    .orderBy('createdAt', 'asc')
    .limit(PAGE_SIZE)
    .get();

  return snapshot.docs.map((document) => toReportRow(document.id, document.data(), actorUid));
}

/** Recently decided reports, so a moderator can see the effect of their work. */
export async function fetchDecidedReports(actorUid: string): Promise<ReportRow[]> {
  const snapshot = await getAdminFirestore()
    .collection(COLLECTIONS.incidentReports)
    .where('status', 'in', ['approved', 'rejected'])
    .orderBy('createdAt', 'desc')
    .limit(20)
    .get();

  return snapshot.docs.map((document) => toReportRow(document.id, document.data(), actorUid));
}

/**
 * One Firestore document as a row safe to render.
 *
 * `actorUid` is required rather than optional on purpose: "is this the signed-in
 * moderator's own report" can only be answered where both real uids are in
 * scope, and that is here, on the server. Making it optional would let a caller
 * build a row that silently reported every report as somebody else's — and a
 * moderator would then be offered the controls to approve their own.
 */
function toReportRow(id: string, data: Record<string, unknown>, actorUid: string): ReportRow {
  const notes = asString(data.moderationNotes);

  return {
    id,
    reporter: toPublicReporter(asString(data.reporterId), actorUid, serverEnv.reporterSalt),
    type: asString(data.type, 'other') as IncidentType,
    severity: asString(data.severity, 'low') as IncidentSeverity,
    status: asString(data.status, 'pending') as ReportStatus,
    description: asString(data.description),
    latitude: asNumber(data.latitude),
    longitude: asNumber(data.longitude),
    imageUrls: Array.isArray(data.imageUrls)
      ? data.imageUrls.filter((url): url is string => typeof url === 'string')
      : [],
    moderationNotes: notes.length > 0 ? notes : null,
    // `reviewedBy` is deliberately not carried. It is the deciding moderator's
    // uid, nothing renders it, and it would ride into the page source alongside
    // the reporter's — the audit log is where "who decided what" belongs, and it
    // shows an email to moderators only.
    occurredAt: toIso(data.occurredAt),
    createdAt: toIso(data.createdAt),
  };
}

/**
 * Every black spot, published or not.
 *
 * Unlike the mobile app's query this deliberately does **not** filter on
 * `verified && active`: managing the unpublished and withdrawn ones is the
 * purpose of the screen. It is also why only an admin may open it.
 */
export async function fetchAllBlackSpots(): Promise<BlackSpotRow[]> {
  const snapshot = await getAdminFirestore()
    .collection(COLLECTIONS.blackSpots)
    .orderBy('createdAt', 'desc')
    .limit(PAGE_SIZE)
    .get();

  return snapshot.docs.map((document) => {
    const data = document.data();
    return {
      id: document.id,
      name: asString(data.name, '(unnamed)'),
      category: asString(data.category, 'accident') as BlackSpotCategory,
      riskLevel: asString(data.riskLevel, 'low') as RiskLevel,
      latitude: asNumber(data.latitude),
      longitude: asNumber(data.longitude),
      radiusM: asNumber(data.radiusM),
      verified: data.verified === true,
      active: data.active === true,
      source: asString(data.source, 'manual'),
      reportCount: asNumber(data.reportCount),
      createdAt: toIso(data.createdAt),
    };
  });
}

/** The audit trail, newest first. */
export async function fetchAuditLog(): Promise<AuditRow[]> {
  const snapshot = await getAdminFirestore()
    .collection(COLLECTIONS.adminAuditLogs)
    .orderBy('createdAt', 'desc')
    .limit(PAGE_SIZE)
    .get();

  return snapshot.docs.map((document) => {
    const data = document.data();
    return {
      id: document.id,
      actorEmail: asString(data.actorEmail, '(unknown)'),
      actorRole: asString(data.actorRole),
      action: asString(data.action) as AdminAuditAction,
      targetType: asString(data.targetType),
      targetId: asString(data.targetId),
      summary: asString(data.summary),
      createdAt: toIso(data.createdAt),
    };
  });
}
