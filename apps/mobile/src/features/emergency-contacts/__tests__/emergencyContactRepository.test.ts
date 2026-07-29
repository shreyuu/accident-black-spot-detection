import { getDocs, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore';

import {
  createEmergencyContact,
  fetchEmergencyContacts,
  setPrimaryContact,
  sortContacts,
} from '@/features/emergency-contacts/emergencyContactRepository';
import { MAX_EMERGENCY_CONTACTS } from '@/features/emergency-contacts/contactSchemas';
import type { EmergencyContact } from '@/types/domain';
import { AppError } from '@/utils/errors';

jest.mock('@/services/firebase/app', () => ({
  getFirebaseFirestore: () => ({}),
}));

const batchUpdate = jest.fn();
const batchCommit = jest.fn().mockResolvedValue(undefined);

jest.mock('firebase/firestore', () => ({
  collection: jest.fn(() => ({})),
  doc: jest.fn(() => ({ id: 'generated-id' })),
  query: jest.fn(() => ({})),
  where: jest.fn(() => ({})),
  orderBy: jest.fn(() => ({})),
  getDocs: jest.fn(),
  setDoc: jest.fn(),
  updateDoc: jest.fn(),
  deleteDoc: jest.fn(),
  serverTimestamp: jest.fn(() => '__serverTimestamp__'),
  writeBatch: jest.fn(),
}));

const mockedGetDocs = jest.mocked(getDocs);
const mockedSetDoc = jest.mocked(setDoc);
const mockedWriteBatch = jest.mocked(writeBatch);

interface FakeDocument {
  id: string;
  ref: { id: string };
  data: () => Record<string, unknown>;
}

function contactDocument(id: string, overrides: Record<string, unknown> = {}): FakeDocument {
  return {
    id,
    ref: { id },
    data: () => ({
      userId: 'user-1',
      name: `Contact ${id}`,
      phone: '+447700900123',
      isPrimary: false,
      ...overrides,
    }),
  };
}

function snapshot(docs: FakeDocument[], fromCache = false) {
  return { docs, empty: docs.length === 0, metadata: { fromCache, hasPendingWrites: false } };
}

beforeEach(() => {
  jest.clearAllMocks();
  batchUpdate.mockClear();
  batchCommit.mockClear().mockResolvedValue(undefined);
  mockedWriteBatch.mockReturnValue({
    update: batchUpdate,
    commit: batchCommit,
  } as unknown as ReturnType<typeof writeBatch>);
});

describe('fetchEmergencyContacts', () => {
  it('returns the caller’s contacts', async () => {
    // @ts-expect-error -- a minimal snapshot stands in for the real QuerySnapshot
    mockedGetDocs.mockResolvedValue(snapshot([contactDocument('a'), contactDocument('b')]));

    const contacts = await fetchEmergencyContacts('user-1');
    expect(contacts.map((contact) => contact.id)).toEqual(['a', 'b']);
  });

  it('lifts the primary contact to the top', async () => {
    mockedGetDocs.mockResolvedValue(
      // @ts-expect-error -- see above
      snapshot([
        contactDocument('a', { name: 'Alice' }),
        contactDocument('z', { name: 'Zoe', isPrimary: true }),
      ]),
    );

    const contacts = await fetchEmergencyContacts('user-1');
    expect(contacts[0]?.name).toBe('Zoe');
  });

  it('skips a malformed record instead of hiding the usable ones', async () => {
    // The remaining numbers still work, and this list is read under pressure.
    mockedGetDocs.mockResolvedValue(
      // @ts-expect-error -- see above
      snapshot([contactDocument('good'), contactDocument('bad', { phone: '' })]),
    );

    const contacts = await fetchEmergencyContacts('user-1');
    expect(contacts.map((contact) => contact.id)).toEqual(['good']);
  });

  it('discards a contact belonging to somebody else', async () => {
    mockedGetDocs.mockResolvedValue(
      // @ts-expect-error -- see above
      snapshot([contactDocument('mine'), contactDocument('theirs', { userId: 'user-2' })]),
    );

    const contacts = await fetchEmergencyContacts('user-1');
    expect(contacts.map((contact) => contact.id)).toEqual(['mine']);
  });

  it('omits an absent relationship rather than setting it undefined', async () => {
    // @ts-expect-error -- see above
    mockedGetDocs.mockResolvedValue(snapshot([contactDocument('a')]));

    const [contact] = await fetchEmergencyContacts('user-1');
    expect(contact !== undefined && 'relationship' in contact).toBe(false);
  });

  it('treats an empty cached result as a network failure, not as "no contacts"', async () => {
    // "You have no emergency contacts" invites the user to add one; "we could
    // not check" means the SOS screen is wrong about being unusable.
    // @ts-expect-error -- see above
    mockedGetDocs.mockResolvedValue(snapshot([], true));

    await expect(fetchEmergencyContacts('user-1')).rejects.toThrow(AppError);
  });

  it('serves a cached result that does contain contacts', async () => {
    // @ts-expect-error -- see above
    mockedGetDocs.mockResolvedValue(snapshot([contactDocument('a')], true));
    await expect(fetchEmergencyContacts('user-1')).resolves.toHaveLength(1);
  });
});

describe('createEmergencyContact', () => {
  it('writes the contact with server timestamps', async () => {
    // @ts-expect-error -- see above
    mockedGetDocs.mockResolvedValue(snapshot([]));

    await createEmergencyContact(
      'user-1',
      { name: 'Sam', phone: '+447700900123', isPrimary: false },
      0,
    );

    expect(serverTimestamp).toHaveBeenCalled();
    expect(mockedSetDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        userId: 'user-1',
        name: 'Sam',
        isPrimary: false,
        createdAt: '__serverTimestamp__',
        updatedAt: '__serverTimestamp__',
      }),
    );
  });

  it('omits an absent relationship rather than writing undefined', async () => {
    // @ts-expect-error -- see above
    mockedGetDocs.mockResolvedValue(snapshot([]));

    await createEmergencyContact(
      'user-1',
      { name: 'Sam', phone: '+447700900123', isPrimary: false },
      0,
    );

    const written = mockedSetDoc.mock.calls[0]?.[1] as Record<string, unknown>;
    expect('relationship' in written).toBe(false);
  });

  it('refuses to exceed the contact cap', async () => {
    await expect(
      createEmergencyContact(
        'user-1',
        { name: 'Sam', phone: '+447700900123', isPrimary: false },
        MAX_EMERGENCY_CONTACTS,
      ),
    ).rejects.toThrow(AppError);

    expect(mockedSetDoc).not.toHaveBeenCalled();
  });
});

describe('setPrimaryContact', () => {
  it('clears the flag elsewhere and sets it on the target, in one batch', async () => {
    // Two primaries, or none, is an inconsistent state the SOS screen would have
    // to guess its way out of — so both halves apply together or neither does.
    mockedGetDocs.mockResolvedValue(
      // @ts-expect-error -- see above
      snapshot([
        contactDocument('old', { isPrimary: true }),
        contactDocument('new', { isPrimary: false }),
      ]),
    );

    await setPrimaryContact('user-1', 'new');

    expect(batchUpdate).toHaveBeenCalledTimes(2);
    expect(batchUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'old' }),
      expect.objectContaining({ isPrimary: false }),
    );
    expect(batchUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'new' }),
      expect.objectContaining({ isPrimary: true }),
    );
    expect(batchCommit).toHaveBeenCalledTimes(1);
  });

  it('writes nothing when the flags are already correct', async () => {
    mockedGetDocs.mockResolvedValue(
      // @ts-expect-error -- see above
      snapshot([contactDocument('a', { isPrimary: true }), contactDocument('b')]),
    );

    await setPrimaryContact('user-1', 'a');

    expect(batchUpdate).not.toHaveBeenCalled();
    expect(batchCommit).not.toHaveBeenCalled();
  });
});

describe('sortContacts', () => {
  function contact(overrides: Partial<EmergencyContact>): EmergencyContact {
    return {
      id: 'x',
      userId: 'user-1',
      name: 'Name',
      phone: '+447700900123',
      isPrimary: false,
      createdAt: null,
      updatedAt: null,
      ...overrides,
    };
  }

  it('puts the primary first, then sorts alphabetically', () => {
    const sorted = sortContacts([
      contact({ id: '1', name: 'Charlie' }),
      contact({ id: '2', name: 'Alice' }),
      contact({ id: '3', name: 'Zoe', isPrimary: true }),
    ]);

    expect(sorted.map((entry) => entry.name)).toEqual(['Zoe', 'Alice', 'Charlie']);
  });

  it('does not mutate the array it was given', () => {
    const input = [contact({ id: '1', name: 'B' }), contact({ id: '2', name: 'A' })];
    sortContacts(input);
    expect(input.map((entry) => entry.name)).toEqual(['B', 'A']);
  });
});
