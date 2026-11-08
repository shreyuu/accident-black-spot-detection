import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { ref, uploadBytesResumable } from 'firebase/storage';

import { uploadReportImage } from '@/features/reports/reportStorage';
import { AppError } from '@/utils/errors';

jest.mock('@/services/firebase/app', () => ({
  getFirebaseStorage: () => ({}),
}));

jest.mock('expo-image-manipulator', () => ({
  ImageManipulator: { manipulate: jest.fn() },
  SaveFormat: { JPEG: 'jpeg', PNG: 'png', WEBP: 'webp' },
}));

jest.mock('firebase/storage', () => ({
  ref: jest.fn((_storage: unknown, path: string) => ({ fullPath: path })),
  uploadBytesResumable: jest.fn(),
  getDownloadURL: jest.fn(
    async () => 'https://firebasestorage.googleapis.com/v0/b/b/o/x?alt=media&token=t',
  ),
}));

const mockedManipulate = jest.mocked(ImageManipulator.manipulate);
const mockedUpload = jest.mocked(uploadBytesResumable);
const mockedRef = jest.mocked(ref);

/** The picker's file — the one carrying the camera's EXIF, GPS included. */
const ORIGINAL = { uri: 'file:///picker/IMG_0001.HEIC', mimeType: 'image/heic', sizeBytes: 1000 };
const REENCODED_URI = 'file:///cache/manipulated.jpg';

function reencodesTo(uri: string) {
  const saveAsync = jest.fn(async () => ({ uri, width: 10, height: 10 }));
  mockedManipulate.mockReturnValue({
    renderAsync: jest.fn(async () => ({ saveAsync })),
  } as never);
  return saveAsync;
}

/** A completed upload task. */
function uploadSucceeds() {
  mockedUpload.mockReturnValue({
    on: (_event: string, _progress: unknown, _error: unknown, complete: () => void) => complete(),
    snapshot: { ref: {} },
    cancel: jest.fn(),
  } as never);
}

let fetched: string[];

beforeEach(() => {
  jest.clearAllMocks();
  fetched = [];
  globalThis.fetch = jest.fn(async (uri: string) => {
    fetched.push(uri);
    return { ok: true, status: 200, blob: async () => ({ size: 500 }) };
  }) as never;
});

describe('uploadReportImage strips photo metadata', () => {
  /**
   * `exif: false` on the picker only stops EXIF being returned to JavaScript;
   * the file itself kept it, and Android's compression exporter copies every
   * tag — GPS position, capture time, device model — into the file it writes.
   * So the bytes uploaded must come from a re-encode, never from the picker's
   * file (SECURITY_AUDIT.md M5).
   */
  it('uploads the re-encoded file, not the original', async () => {
    const saveAsync = reencodesTo(REENCODED_URI);
    uploadSucceeds();

    await uploadReportImage({ userId: 'user-1', image: ORIGINAL });

    expect(mockedManipulate).toHaveBeenCalledWith(ORIGINAL.uri);
    expect(saveAsync).toHaveBeenCalledWith(expect.objectContaining({ format: SaveFormat.JPEG }));
    expect(fetched).toEqual([REENCODED_URI]);
  });

  it('uploads it as a JPEG, whatever the original format was', async () => {
    reencodesTo(REENCODED_URI);
    uploadSucceeds();

    await uploadReportImage({ userId: 'user-1', image: ORIGINAL });

    expect(mockedUpload).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ contentType: 'image/jpeg' }),
    );
    expect(mockedRef.mock.calls[0]?.[1]).toMatch(/^incidentReports\/user-1\/[a-z0-9-]+\.jpg$/);
  });

  it('refuses to upload at all when the photo cannot be re-encoded', async () => {
    // Failing closed. Falling back to the original would upload exactly the
    // metadata this exists to remove.
    mockedManipulate.mockImplementation(() => {
      throw new Error('decoder unavailable');
    });

    await expect(uploadReportImage({ userId: 'user-1', image: ORIGINAL })).rejects.toBeInstanceOf(
      AppError,
    );
    expect(fetched).toEqual([]);
    expect(mockedUpload).not.toHaveBeenCalled();
  });
});
