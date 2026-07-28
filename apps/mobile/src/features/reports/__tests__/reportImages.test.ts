import {
  addImages,
  formatBytes,
  partitionForUpload,
  removeImage,
  resolveMimeType,
  uploadProgressFraction,
  validateImage,
  type SelectedImage,
} from '@/features/reports/reportImages';
import { MAX_IMAGES_PER_REPORT, MAX_IMAGE_BYTES } from '@/features/reports/reportSchemas';

/**
 * These are the checks that decide what leaves the device. The server enforces
 * the same limits, so a bug here is not a security hole — but it is a lost
 * report, which for a safety app is its own kind of failure.
 */

function image(overrides: Partial<SelectedImage> = {}): SelectedImage {
  return {
    uri: 'file:///photos/a.jpg',
    mimeType: 'image/jpeg',
    sizeBytes: 1024,
    ...overrides,
  };
}

describe('resolveMimeType', () => {
  it('prefers the type the picker reported', () => {
    expect(resolveMimeType({ uri: 'file:///a.png', mimeType: 'image/jpeg' })).toBe('image/jpeg');
  });

  it('normalises case and whitespace from the picker', () => {
    expect(resolveMimeType({ uri: 'file:///a.bin', mimeType: ' IMAGE/PNG ' })).toBe('image/png');
  });

  it('falls back to the filename extension', () => {
    expect(resolveMimeType({ uri: 'file:///abc123', fileName: 'IMG_0001.HEIC' })).toBe(
      'image/heic',
    );
  });

  it('falls back to the URI extension', () => {
    expect(resolveMimeType({ uri: 'file:///tmp/photo.webp' })).toBe('image/webp');
  });

  it('ignores a query string when reading the URI extension', () => {
    expect(resolveMimeType({ uri: 'file:///tmp/photo.jpg?width=100#frag' })).toBe('image/jpeg');
  });

  it('returns null rather than guessing for an unknown extension', () => {
    expect(resolveMimeType({ uri: 'file:///tmp/notes.pdf' })).toBeNull();
    expect(resolveMimeType({ uri: 'file:///tmp/nodots' })).toBeNull();
  });
});

describe('validateImage', () => {
  it('accepts every allowed type', () => {
    for (const extension of ['jpg', 'png', 'webp', 'heic', 'heif']) {
      expect(validateImage({ uri: `file:///a.${extension}` })).toEqual({ ok: true });
    }
  });

  it('refuses a type that is not an allowed image', () => {
    const result = validateImage({ uri: 'file:///clip.mp4', mimeType: 'video/mp4' });
    expect(result.ok).toBe(false);
  });

  it('refuses SVG, which storage.rules also refuses', () => {
    // Explicitly named: an SVG is an executable document, and the two
    // allow-lists must not drift apart.
    expect(validateImage({ uri: 'file:///a.svg', mimeType: 'image/svg+xml' }).ok).toBe(false);
  });

  it('refuses a file over the size cap', () => {
    const result = validateImage({ uri: 'file:///big.jpg', fileSize: MAX_IMAGE_BYTES + 1 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('5.0 MB');
    }
  });

  it('accepts a file exactly at the cap', () => {
    expect(validateImage({ uri: 'file:///edge.jpg', fileSize: MAX_IMAGE_BYTES })).toEqual({
      ok: true,
    });
  });

  it('accepts an unknown size, because the server still enforces the cap', () => {
    expect(validateImage({ uri: 'file:///unknown.jpg' })).toEqual({ ok: true });
  });
});

describe('addImages', () => {
  it('accepts valid candidates', () => {
    const result = addImages([], [{ uri: 'file:///a.jpg' }, { uri: 'file:///b.png' }]);
    expect(result.images).toHaveLength(2);
    expect(result.rejected).toHaveLength(0);
    expect(result.images[0]?.mimeType).toBe('image/jpeg');
  });

  it('records the reported size, or null when the picker omitted it', () => {
    const result = addImages(
      [],
      [{ uri: 'file:///a.jpg', fileSize: 2048 }, { uri: 'file:///b.jpg' }],
    );
    expect(result.images[0]?.sizeBytes).toBe(2048);
    expect(result.images[1]?.sizeBytes).toBeNull();
  });

  it('enforces the count limit across the combined set, not per pick', () => {
    const existing = [image({ uri: 'file:///1.jpg' }), image({ uri: 'file:///2.jpg' })];
    const result = addImages(existing, [{ uri: 'file:///3.jpg' }, { uri: 'file:///4.jpg' }]);

    expect(result.images).toHaveLength(MAX_IMAGES_PER_REPORT);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]?.uri).toBe('file:///4.jpg');
  });

  it('drops a duplicate URI without consuming a slot', () => {
    const existing = [image({ uri: 'file:///1.jpg' })];
    const result = addImages(existing, [{ uri: 'file:///1.jpg' }, { uri: 'file:///2.jpg' }]);

    expect(result.images.map((entry) => entry.uri)).toEqual(['file:///1.jpg', 'file:///2.jpg']);
    expect(result.rejected[0]?.reason).toContain('already been added');
  });

  it('accepts the good candidates and explains each rejection in one pass', () => {
    const result = addImages(
      [],
      [{ uri: 'file:///ok.jpg' }, { uri: 'file:///bad.pdf' }, { uri: 'file:///ok2.png' }],
    );

    expect(result.images).toHaveLength(2);
    expect(result.rejected).toHaveLength(1);
    expect(result.rejected[0]?.uri).toBe('file:///bad.pdf');
  });

  it('does not mutate the array it was given', () => {
    const existing = [image({ uri: 'file:///1.jpg' })];
    addImages(existing, [{ uri: 'file:///2.jpg' }]);
    expect(existing).toHaveLength(1);
  });
});

describe('removeImage', () => {
  it('removes only the matching URI', () => {
    const existing = [image({ uri: 'file:///1.jpg' }), image({ uri: 'file:///2.jpg' })];
    expect(removeImage(existing, 'file:///1.jpg').map((entry) => entry.uri)).toEqual([
      'file:///2.jpg',
    ]);
  });

  it('is a no-op for a URI that is not present', () => {
    const existing = [image({ uri: 'file:///1.jpg' })];
    expect(removeImage(existing, 'file:///nope.jpg')).toHaveLength(1);
  });
});

describe('partitionForUpload', () => {
  it('separates images that already have a download URL', () => {
    const images = [
      image({ uri: 'file:///1.jpg', downloadUrl: 'https://example.test/1' }),
      image({ uri: 'file:///2.jpg' }),
    ];

    const { uploaded, pending } = partitionForUpload(images);
    expect(uploaded.map((entry) => entry.uri)).toEqual(['file:///1.jpg']);
    expect(pending.map((entry) => entry.uri)).toEqual(['file:///2.jpg']);
  });

  it('treats an empty download URL as not uploaded', () => {
    // A blank string here would otherwise mark the image done and leave the
    // report referencing nothing.
    const { pending } = partitionForUpload([image({ downloadUrl: '' })]);
    expect(pending).toHaveLength(1);
  });
});

describe('uploadProgressFraction', () => {
  it('reports 1 when there is nothing to upload', () => {
    expect(uploadProgressFraction(0, 0, 0)).toBe(1);
  });

  it('weights each file equally', () => {
    expect(uploadProgressFraction(1, 2, 0)).toBe(0.5);
    expect(uploadProgressFraction(1, 2, 0.5)).toBe(0.75);
    expect(uploadProgressFraction(2, 2, 0)).toBe(1);
  });

  it('clamps a nonsensical per-file fraction rather than overshooting', () => {
    expect(uploadProgressFraction(0, 1, 5)).toBe(1);
    expect(uploadProgressFraction(0, 1, -3)).toBe(0);
  });
});

describe('formatBytes', () => {
  it('scales the unit to the magnitude', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });

  it('does not pretend to know a nonsense size', () => {
    expect(formatBytes(Number.NaN)).toBe('unknown size');
    expect(formatBytes(-1)).toBe('unknown size');
  });
});
