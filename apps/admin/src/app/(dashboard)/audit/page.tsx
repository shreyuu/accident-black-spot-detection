import { fetchAuditLog } from '@/lib/data';

/**
 * The audit trail.
 *
 * Readable by any moderator, not just admins, and deliberately so: a trail only
 * the people with the most power can inspect is not much of a check on them.
 *
 * Nothing on this page can edit or delete an entry, because nothing can —
 * `firestore.rules` denies every client write to the collection, and the only
 * writer is the Admin SDK committing an entry in the same transaction as the
 * action it records. An audit log an administrator can tidy up is not an audit log.
 */
export default async function AuditPage() {
  const entries = await fetchAuditLog();

  return (
    <>
      <h1>Audit log</h1>
      <p className="muted small">
        Every privileged action, newest first. Entries cannot be edited or removed by anyone,
        including administrators.
      </p>

      {entries.length === 0 ? (
        <div className="card">
          <p className="muted small">No privileged actions recorded yet.</p>
        </div>
      ) : (
        <div className="card scroll-x">
          <table>
            <thead>
              <tr>
                <th scope="col">When</th>
                <th scope="col">Who</th>
                <th scope="col">Action</th>
                <th scope="col">What</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id}>
                  <td className="muted">
                    {entry.createdAt === null
                      ? 'pending'
                      : new Date(entry.createdAt).toLocaleString('en-GB', {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                  </td>
                  <td>
                    {entry.actorEmail}
                    <br />
                    <span className="muted small">{entry.actorRole}</span>
                  </td>
                  <td>
                    <code>{entry.action}</code>
                  </td>
                  <td>
                    {entry.summary}
                    <br />
                    <span className="muted small">
                      {entry.targetType} {entry.targetId}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
