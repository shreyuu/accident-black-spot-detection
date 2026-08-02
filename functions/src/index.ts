/**
 * Cloud Functions for Accident Black Spot Detection.
 *
 * Everything here runs with the Admin SDK, which **bypasses every Firestore and
 * Storage rule**. Four operations need that and nothing else does:
 *
 *   - `deleteAccount` — erasing data the rules deliberately stop a client
 *     erasing, so that a published black spot cannot be undermined by its
 *     reporter and a report cannot be withdrawn from a moderation queue;
 *   - `exportMyData`  — assembling one definition of "everything we hold about
 *     you" that does not drift as collections are added;
 *   - `nearbyPlacesProxy` — holding a billable API key somewhere it is not
 *     shipped inside the app;
 *   - `sweepOrphanedImages` — deleting Storage objects, which no client may do.
 *
 * Anything that does not need a rule-bypassing credential belongs in the app or
 * in the rules, not here. Rate limiting and duplicate detection in particular
 * are enforced in `firestore.rules`, precisely so that report submission does
 * not depend on a function being warm.
 *
 * ## Authorisation
 *
 * Because the rules do not apply, each callable does its own check, and every
 * one derives the uid from `request.auth` — the verified token — and never from
 * the request payload. There is no function here that acts on a uid the caller
 * supplied.
 */

export { deleteAccount } from './deleteAccount.ts';
export { exportMyData } from './exportMyData.ts';
export { nearbyPlacesProxy } from './nearbyPlacesProxy.ts';
export { sweepOrphanedImages } from './sweepOrphanedImages.ts';
