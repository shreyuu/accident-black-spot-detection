import {
  CONTACT_NAME_MAX_LENGTH,
  CONTACT_RELATIONSHIP_MAX_LENGTH,
  emergencyContactDocumentSchema,
  emergencyContactFormSchema,
  MAX_EMERGENCY_CONTACTS,
  MAX_SOS_RECIPIENTS,
} from '@/features/emergency-contacts/contactSchemas';

function values(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Sam Doe',
    phone: '+44 7700 900123',
    relationship: 'Sister',
    isPrimary: false,
    ...overrides,
  };
}

describe('emergencyContactFormSchema', () => {
  it('accepts a complete contact', () => {
    expect(emergencyContactFormSchema.safeParse(values()).success).toBe(true);
  });

  it('accepts a contact with no relationship label', () => {
    const { relationship: _drop, ...withoutLabel } = values();
    expect(emergencyContactFormSchema.safeParse(withoutLabel).success).toBe(true);
  });

  describe('name', () => {
    it('rejects an empty name', () => {
      expect(emergencyContactFormSchema.safeParse(values({ name: '   ' })).success).toBe(false);
    });

    it('rejects one too short to identify anybody', () => {
      expect(emergencyContactFormSchema.safeParse(values({ name: 'A' })).success).toBe(false);
    });

    it('rejects one past the maximum', () => {
      const result = emergencyContactFormSchema.safeParse(
        values({ name: 'x'.repeat(CONTACT_NAME_MAX_LENGTH + 1) }),
      );
      expect(result.success).toBe(false);
    });

    it('trims surrounding whitespace', () => {
      const result = emergencyContactFormSchema.safeParse(values({ name: '  Sam Doe  ' }));
      expect(result.success && result.data.name).toBe('Sam Doe');
    });
  });

  describe('phone', () => {
    it('is required, unlike the user’s own number', () => {
      // A contact with no number is a name the app can do nothing with, and
      // storing another person's details for no actionable purpose is exactly
      // what the data-minimisation rule forbids.
      expect(emergencyContactFormSchema.safeParse(values({ phone: '' })).success).toBe(false);
      expect(emergencyContactFormSchema.safeParse(values({ phone: '   ' })).success).toBe(false);
    });

    it('accepts the separators people actually type', () => {
      for (const phone of ['07700 900123', '(0770) 090-0123', '+44-7700-900123']) {
        expect(emergencyContactFormSchema.safeParse(values({ phone })).success).toBe(true);
      }
    });

    it('rejects something that is not a number at all', () => {
      expect(emergencyContactFormSchema.safeParse(values({ phone: 'ask at reception' })).success).toBe(
        false,
      );
    });

    it('normalises away separators but never the digits', () => {
      const result = emergencyContactFormSchema.safeParse(values({ phone: '+44 (7700) 900-123' }));
      expect(result.success && result.data.phone).toBe('+447700900123');
    });
  });

  describe('relationship', () => {
    it('rejects one past the maximum', () => {
      const result = emergencyContactFormSchema.safeParse(
        values({ relationship: 'x'.repeat(CONTACT_RELATIONSHIP_MAX_LENGTH + 1) }),
      );
      expect(result.success).toBe(false);
    });
  });
});

describe('limits', () => {
  it('caps how many contacts may be stored', () => {
    expect(MAX_EMERGENCY_CONTACTS).toBe(5);
  });

  /**
   * The recipient cap is lower than the storage cap on purpose: every recipient
   * of a group SMS can see the others' numbers, so addressing the whole list
   * would disclose each contact's number to all the rest.
   */
  it('caps SOS recipients below the stored maximum', () => {
    expect(MAX_SOS_RECIPIENTS).toBeLessThan(MAX_EMERGENCY_CONTACTS);
  });
});

describe('emergencyContactDocumentSchema', () => {
  function document(overrides: Record<string, unknown> = {}) {
    return {
      id: 'contact-1',
      userId: 'user-1',
      name: 'Sam Doe',
      phone: '+447700900123',
      relationship: 'Sister',
      isPrimary: true,
      ...overrides,
    };
  }

  it('accepts a well-formed stored contact', () => {
    expect(emergencyContactDocumentSchema.safeParse(document()).success).toBe(true);
  });

  it('accepts one with no relationship', () => {
    const { relationship: _drop, ...rest } = document();
    expect(emergencyContactDocumentSchema.safeParse(rest).success).toBe(true);
  });

  it('rejects a record with no owner', () => {
    expect(emergencyContactDocumentSchema.safeParse(document({ userId: '' })).success).toBe(false);
  });

  it('rejects a record with no phone number', () => {
    expect(emergencyContactDocumentSchema.safeParse(document({ phone: '' })).success).toBe(false);
  });

  it('rejects a non-boolean primary flag', () => {
    expect(emergencyContactDocumentSchema.safeParse(document({ isPrimary: 'yes' })).success).toBe(
      false,
    );
  });
});
