import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { displayableImageUrls } from '../reportImages.ts';

const PROD =
  'https://firebasestorage.googleapis.com/v0/b/p.firebasestorage.app/o/incidentReports%2Fu%2Fa.jpg?alt=media&token=t';
const EMU =
  'http://127.0.0.1:9199/v0/b/p.firebasestorage.app/o/incidentReports%2Fu%2Fa.jpg?alt=media&token=t';

describe('displayableImageUrls', () => {
  /**
   * `imageUrls` is written by the reporter's client. Before the rules checked
   * it, a reporter could plant any link and the queue rendered it as "photo 1"
   * — a phishing page one click from a moderator's session (SECURITY_AUDIT.md
   * L3). The rules now refuse such values; this keeps any already stored, or
   * any that a future rule slip lets through, off the page.
   */
  it('keeps a Firebase Storage download URL', () => {
    assert.deepEqual(displayableImageUrls([PROD], false), [PROD]);
  });

  it('drops a link to anywhere else', () => {
    assert.deepEqual(displayableImageUrls(['https://evil.example/login', PROD], false), [PROD]);
  });

  it('drops a look-alike host and a non-https scheme', () => {
    assert.deepEqual(
      displayableImageUrls(
        [
          'https://firebasestorage.googleapis.com.evil.example/x',
          'http://firebasestorage.googleapis.com/v0/b/p/o/x',
          'javascript:alert(1)',
          'not a url',
        ],
        false,
      ),
      [],
    );
  });

  it('keeps the Storage emulator only when the dashboard runs against the emulators', () => {
    assert.deepEqual(displayableImageUrls([EMU], true), [EMU]);
    assert.deepEqual(displayableImageUrls([EMU], false), []);
  });

  it('drops non-strings and duplicates', () => {
    assert.deepEqual(displayableImageUrls([PROD, 42, PROD, null], false), [PROD]);
  });
});
