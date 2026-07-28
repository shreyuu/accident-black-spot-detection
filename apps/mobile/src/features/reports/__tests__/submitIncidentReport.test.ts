import type { SelectedImage } from '@/features/reports/reportImages';
import { createIncidentReport } from '@/features/reports/reportRepository';
import { uploadReportImage } from '@/features/reports/reportStorage';
import type { IncidentReportFormValues } from '@/features/reports/reportSchemas';
import {
  submitIncidentReport,
  type SubmissionProgress,
} from '@/features/reports/submitIncidentReport';
import { AppError } from '@/utils/errors';

jest.mock('@/features/reports/reportStorage', () => ({
  uploadReportImage: jest.fn(),
}));

jest.mock('@/features/reports/reportRepository', () => ({
  createIncidentReport: jest.fn(),
}));

const mockedUpload = jest.mocked(uploadReportImage);
const mockedCreate = jest.mocked(createIncidentReport);

const VALUES: IncidentReportFormValues = {
  type: 'accident',
  severity: 'high',
  description: 'A car left the road on the bend by the school and hit the barrier.',
  latitude: 51.5074,
  longitude: -0.1278,
};

function image(uri: string, downloadUrl?: string): SelectedImage {
  return {
    uri,
    mimeType: 'image/jpeg',
    sizeBytes: 1024,
    ...(downloadUrl === undefined ? {} : { downloadUrl }),
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockedUpload.mockResolvedValue('https://example.test/uploaded');
  mockedCreate.mockResolvedValue(undefined);
});

describe('submitIncidentReport', () => {
  it('creates the report with no images when none were attached', async () => {
    await submitIncidentReport({
      reportId: 'report-1',
      reporterId: 'user-1',
      values: VALUES,
      images: [],
    });

    expect(mockedUpload).not.toHaveBeenCalled();
    expect(mockedCreate).toHaveBeenCalledWith(
      'report-1',
      expect.objectContaining({ status: 'pending', imageUrls: [] }),
    );
  });

  it('uploads every image before writing the document', async () => {
    const order: string[] = [];
    mockedUpload.mockImplementation(async () => {
      order.push('upload');
      return 'https://example.test/x';
    });
    mockedCreate.mockImplementation(async () => {
      order.push('create');
    });

    await submitIncidentReport({
      reportId: 'report-1',
      reporterId: 'user-1',
      values: VALUES,
      images: [image('file:///1.jpg'), image('file:///2.jpg')],
    });

    // The document is written last and exactly once — a report must never exist
    // referencing photographs that have not arrived.
    expect(order).toEqual(['upload', 'upload', 'create']);
  });

  it('stores the download URLs in the order the user chose', async () => {
    mockedUpload.mockImplementation(async ({ image: candidate }) =>
      candidate.uri === 'file:///1.jpg' ? 'https://example.test/one' : 'https://example.test/two',
    );

    await submitIncidentReport({
      reportId: 'report-1',
      reporterId: 'user-1',
      values: VALUES,
      images: [image('file:///1.jpg'), image('file:///2.jpg')],
    });

    expect(mockedCreate).toHaveBeenCalledWith(
      'report-1',
      expect.objectContaining({
        imageUrls: ['https://example.test/one', 'https://example.test/two'],
      }),
    );
  });

  it('validates before uploading anything', async () => {
    await expect(
      submitIncidentReport({
        reportId: 'report-1',
        reporterId: 'user-1',
        values: { ...VALUES, description: 'short' },
        images: [image('file:///1.jpg')],
      }),
    ).rejects.toThrow(AppError);

    // The point of the ordering: a doomed report must not cost the user an
    // upload on a roadside connection.
    expect(mockedUpload).not.toHaveBeenCalled();
    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it('does not write the document when an upload fails', async () => {
    mockedUpload.mockRejectedValueOnce(new AppError('network', 'Upload failed.'));

    await expect(
      submitIncidentReport({
        reportId: 'report-1',
        reporterId: 'user-1',
        values: VALUES,
        images: [image('file:///1.jpg')],
      }),
    ).rejects.toThrow(AppError);

    expect(mockedCreate).not.toHaveBeenCalled();
  });

  it('reports each completed upload so a retry can resume', async () => {
    mockedUpload.mockResolvedValueOnce('https://example.test/one');
    mockedUpload.mockRejectedValueOnce(new AppError('network', 'Upload failed.'));

    const uploaded: [string, string][] = [];

    await expect(
      submitIncidentReport({
        reportId: 'report-1',
        reporterId: 'user-1',
        values: VALUES,
        images: [image('file:///1.jpg'), image('file:///2.jpg')],
        onImageUploaded: (uri, url) => uploaded.push([uri, url]),
      }),
    ).rejects.toThrow(AppError);

    expect(uploaded).toEqual([['file:///1.jpg', 'https://example.test/one']]);
  });

  it('re-uploads only what never finished', async () => {
    await submitIncidentReport({
      reportId: 'report-1',
      reporterId: 'user-1',
      values: VALUES,
      images: [image('file:///1.jpg', 'https://example.test/one'), image('file:///2.jpg')],
    });

    expect(mockedUpload).toHaveBeenCalledTimes(1);
    expect(mockedUpload.mock.calls[0]?.[0].image.uri).toBe('file:///2.jpg');
    expect(mockedCreate).toHaveBeenCalledWith(
      'report-1',
      expect.objectContaining({
        imageUrls: ['https://example.test/one', 'https://example.test/uploaded'],
      }),
    );
  });

  it('reuses the id it was given, so a retry cannot file a duplicate', async () => {
    await submitIncidentReport({
      reportId: 'stable-id',
      reporterId: 'user-1',
      values: VALUES,
      images: [],
    });
    await submitIncidentReport({
      reportId: 'stable-id',
      reporterId: 'user-1',
      values: VALUES,
      images: [],
    });

    expect(mockedCreate.mock.calls.map((call) => call[0])).toEqual(['stable-id', 'stable-id']);
  });

  it('advances progress through uploading and then saving', async () => {
    const progress: SubmissionProgress[] = [];

    await submitIncidentReport({
      reportId: 'report-1',
      reporterId: 'user-1',
      values: VALUES,
      images: [image('file:///1.jpg'), image('file:///2.jpg')],
      onProgress: (update) => progress.push(update),
    });

    expect(progress[0]).toEqual({
      stage: 'uploading',
      fraction: 0,
      uploadedCount: 0,
      totalCount: 2,
    });
    expect(progress.at(-1)).toEqual({
      stage: 'saving',
      fraction: 1,
      uploadedCount: 2,
      totalCount: 2,
    });
    // Monotonic: a bar that goes backwards reads as a stalled upload.
    const fractions = progress.map((entry) => entry.fraction);
    expect([...fractions].sort((a, b) => a - b)).toEqual(fractions);
  });

  it('stops before writing the document when cancelled mid-flight', async () => {
    const controller = new AbortController();
    mockedUpload.mockImplementation(async () => {
      controller.abort();
      return 'https://example.test/one';
    });

    await expect(
      submitIncidentReport({
        reportId: 'report-1',
        reporterId: 'user-1',
        values: VALUES,
        images: [image('file:///1.jpg')],
        signal: controller.signal,
      }),
    ).rejects.toThrow(AppError);

    expect(mockedCreate).not.toHaveBeenCalled();
  });
});
