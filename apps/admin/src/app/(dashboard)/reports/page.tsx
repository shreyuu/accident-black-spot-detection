import { ActionForm } from '@/components/ActionForm';
import { moderateReport } from '@/lib/actions';
import { fetchDecidedReports, fetchPendingReports, type ReportRow } from '@/lib/data';
import { getDashboardActor } from '@/lib/session';

/**
 * The moderation queue.
 *
 * ## The copy that matters
 *
 * Approving a report does **not** publish a black spot, and the screen says so
 * next to the button. A moderator who believes approval puts a warning on the map
 * will approve differently — more cautiously about real hazards, more casually
 * about marginal ones — than one who knows it records evidence for a location
 * that an administrator may later act on. Getting that wrong changes the data.
 *
 * ## Self-approval
 *
 * A report the signed-in moderator filed themselves is shown with its controls
 * replaced by an explanation. The server refuses it regardless — see
 * `evaluateModerationDecision` — so this is only to avoid presenting a button
 * that cannot work.
 */
export default async function ReportsPage() {
  const actor = await getDashboardActor();
  // Unreachable: the group layout redirects first. Narrowing for the type system.
  if (actor === null) {
    return null;
  }

  const [pending, decided] = await Promise.all([fetchPendingReports(), fetchDecidedReports()]);

  return (
    <>
      <h1>Moderation queue</h1>
      <p className="muted small">
        Oldest first, so nothing is left behind. {pending.length} awaiting a decision.
      </p>

      <div className="notice">
        Approving a report records that you believed it. It does <strong>not</strong> publish a
        black spot and does not warn anybody — an administrator creates a black spot separately, and
        that is a second, deliberate decision.
      </div>

      {pending.length === 0 ? (
        <div className="card">
          <h2>Nothing waiting</h2>
          <p className="muted small">Every submitted report has been decided.</p>
        </div>
      ) : (
        pending.map((report) => <ReportCard key={report.id} report={report} actorUid={actor.uid} />)
      )}

      <h2 style={{ marginTop: '2rem' }}>Recently decided</h2>
      {decided.length === 0 ? (
        <p className="muted small">No decisions yet.</p>
      ) : (
        <div className="card scroll-x">
          <table>
            <thead>
              <tr>
                <th scope="col">Type</th>
                <th scope="col">Status</th>
                <th scope="col">Description</th>
                <th scope="col">Note to reporter</th>
              </tr>
            </thead>
            <tbody>
              {decided.map((report) => (
                <tr key={report.id}>
                  <td>{report.type}</td>
                  <td>
                    <span className={`badge ${report.status}`}>{report.status}</span>
                  </td>
                  <td>{truncate(report.description, 90)}</td>
                  <td className="muted">{report.moderationNotes ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function ReportCard({ report, actorUid }: { report: ReportRow; actorUid: string }) {
  const isOwnReport = report.reporterId === actorUid;

  return (
    <article className="card">
      <div className="actions" style={{ justifyContent: 'space-between' }}>
        <h2 style={{ marginBottom: 0 }}>{report.type}</h2>
        {/* Severity carries a word as well as a colour — never colour alone. */}
        <span className={`badge ${report.severity}`}>reported {report.severity}</span>
      </div>

      <p>{report.description}</p>

      <p className="muted small">
        {report.latitude.toFixed(5)}, {report.longitude.toFixed(5)}
        {' · '}
        <a
          href={`https://www.google.com/maps/search/?api=1&query=${report.latitude},${report.longitude}`}
          target="_blank"
          rel="noreferrer noopener"
        >
          open in maps
        </a>
        {report.occurredAt !== null ? ` · happened ${formatDate(report.occurredAt)}` : ''}
        {report.createdAt !== null ? ` · submitted ${formatDate(report.createdAt)}` : ''}
      </p>

      {report.imageUrls.length > 0 ? (
        <p className="small">
          {report.imageUrls.map((url, index) => (
            <a
              key={url}
              href={url}
              target="_blank"
              rel="noreferrer noopener"
              style={{ marginRight: '0.75rem' }}
            >
              photo {index + 1}
            </a>
          ))}
          <span className="muted"> — opens the original; treat as unverified.</span>
        </p>
      ) : (
        <p className="muted small">No photographs attached.</p>
      )}

      {isOwnReport ? (
        <div className="notice warn">
          You submitted this report, so you cannot decide it. Another moderator must review it —
          this restriction has no override.
        </div>
      ) : (
        <ActionForm action={moderateReport} submitLabel="Save decision">
          <input type="hidden" name="reportId" value={report.id} />

          <div className="field-row">
            <div>
              <label htmlFor={`decision-${report.id}`}>Decision</label>
              <select id={`decision-${report.id}`} name="decision" defaultValue="approved">
                <option value="approved">Approve — accept as evidence</option>
                <option value="rejected">Reject — do not accept</option>
              </select>
            </div>
          </div>

          <div>
            <label htmlFor={`notes-${report.id}`}>
              Note to the reporter (required when rejecting)
            </label>
            <textarea
              id={`notes-${report.id}`}
              name="notes"
              maxLength={2000}
              placeholder="The person who reported this will read this. “Not accepted” on its own tells them nothing."
            />
          </div>
        </ActionForm>
      )}
    </article>
  );
}

function truncate(value: string, limit: number): string {
  return value.length <= limit ? value : `${value.slice(0, limit)}…`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
}
