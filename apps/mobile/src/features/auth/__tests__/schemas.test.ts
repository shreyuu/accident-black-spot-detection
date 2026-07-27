import {
  emailSchema,
  forgotPasswordSchema,
  loginSchema,
  nameSchema,
  passwordSchema,
  phoneSchema,
  registerSchema,
  userProfileSchema,
} from '@/features/auth/schemas';

describe('emailSchema', () => {
  it.each(['name@example.com', 'first.last@example.co.uk', 'user+tag@example.org', 'a@b.co'])(
    'accepts %p',
    (input) => {
      expect(emailSchema.safeParse(input).success).toBe(true);
    },
  );

  it.each(['', 'not-an-email', 'missing@domain', '@example.com', 'spaces in@example.com'])(
    'rejects %p',
    (input) => {
      expect(emailSchema.safeParse(input).success).toBe(false);
    },
  );

  it('trims surrounding whitespace', () => {
    expect(emailSchema.parse('  name@example.com  ')).toBe('name@example.com');
  });

  /**
   * Lowercasing prevents a user creating a second account that differs only in
   * capitalisation and then being unable to work out which one they signed up
   * with.
   */
  it('lowercases the address', () => {
    expect(emailSchema.parse('Name@Example.COM')).toBe('name@example.com');
  });
});

describe('nameSchema', () => {
  it('accepts a normal name', () => {
    expect(nameSchema.parse('  Ada Lovelace  ')).toBe('Ada Lovelace');
  });

  it('rejects a single character', () => {
    expect(nameSchema.safeParse('A').success).toBe(false);
  });

  it('rejects whitespace only', () => {
    expect(nameSchema.safeParse('   ').success).toBe(false);
  });

  it('rejects a name over 80 characters', () => {
    expect(nameSchema.safeParse('a'.repeat(81)).success).toBe(false);
  });

  it('accepts non-Latin scripts', () => {
    // Rejecting these would exclude most of the world.
    expect(nameSchema.safeParse('अद्वैत शर्मा').success).toBe(true);
    expect(nameSchema.safeParse('李明').success).toBe(true);
  });
});

describe('phoneSchema', () => {
  it.each([
    ['+919876543210', '+919876543210'],
    ['+44 7700 900123', '+447700900123'],
    ['(020) 7946-0958', '02079460958'],
    ['9876543210', '9876543210'],
  ])('normalises %p to %p', (input, expected) => {
    expect(phoneSchema.parse(input)).toBe(expected);
  });

  it('accepts a blank value, because the field is optional', () => {
    expect(phoneSchema.safeParse('').success).toBe(true);
  });

  it.each([
    ['too short', '12345'],
    ['too long', '1234567890123456'],
    ['letters', '+44abc123456'],
    ['double plus', '++919876543210'],
  ])('rejects a %s number', (_label, input) => {
    expect(phoneSchema.safeParse(input).success).toBe(false);
  });
});

describe('passwordSchema', () => {
  it('accepts a password meeting the policy', () => {
    expect(passwordSchema.safeParse('correct1horse').success).toBe(true);
  });

  it('rejects fewer than 8 characters', () => {
    expect(passwordSchema.safeParse('abc1234').success).toBe(false);
  });

  it('rejects a password with no digit', () => {
    expect(passwordSchema.safeParse('onlyletters').success).toBe(false);
  });

  it('rejects a password with no letter', () => {
    expect(passwordSchema.safeParse('12345678').success).toBe(false);
  });

  it('does not trim, because whitespace is legitimate inside a passphrase', () => {
    expect(passwordSchema.safeParse('two words 1').success).toBe(true);
  });
});

describe('loginSchema', () => {
  it('accepts valid credentials', () => {
    expect(loginSchema.safeParse({ email: 'a@b.co', password: 'x' }).success).toBe(true);
  });

  /**
   * Sign-in deliberately does not apply the strength policy: an existing account
   * may predate it, and refusing to even attempt the sign-in would lock that user
   * out of their own account.
   */
  it('does not enforce password strength on sign-in', () => {
    expect(loginSchema.safeParse({ email: 'a@b.co', password: 'old' }).success).toBe(true);
  });

  it('requires a non-empty password', () => {
    expect(loginSchema.safeParse({ email: 'a@b.co', password: '' }).success).toBe(false);
  });
});

describe('registerSchema', () => {
  const valid = {
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    phone: '+919876543210',
    password: 'correct1horse',
    confirmPassword: 'correct1horse',
    acceptedTerms: true,
  };

  it('accepts a complete valid registration', () => {
    expect(registerSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts a registration without a phone number', () => {
    const { phone: _phone, ...withoutPhone } = valid;
    expect(registerSchema.safeParse(withoutPhone).success).toBe(true);
  });

  it('rejects mismatched passwords and points at the confirmation field', () => {
    const result = registerSchema.safeParse({ ...valid, confirmPassword: 'different1' });

    expect(result.success).toBe(false);
    if (!result.success) {
      // Attaching the error to confirmPassword puts the message where the user
      // can act on it, rather than at the top of the form.
      expect(result.error.issues.some((issue) => issue.path.includes('confirmPassword'))).toBe(
        true,
      );
    }
  });

  it('rejects registration without accepting the terms', () => {
    const result = registerSchema.safeParse({ ...valid, acceptedTerms: false });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((issue) => issue.path.includes('acceptedTerms'))).toBe(true);
    }
  });

  it('rejects a weak password', () => {
    expect(
      registerSchema.safeParse({ ...valid, password: 'weak', confirmPassword: 'weak' }).success,
    ).toBe(false);
  });

  it('normalises the email in its output', () => {
    const result = registerSchema.parse({ ...valid, email: '  ADA@Example.com ' });
    expect(result.email).toBe('ada@example.com');
  });
});

describe('forgotPasswordSchema', () => {
  it('accepts a valid email', () => {
    expect(forgotPasswordSchema.safeParse({ email: 'a@b.co' }).success).toBe(true);
  });

  it('rejects an invalid email', () => {
    expect(forgotPasswordSchema.safeParse({ email: 'nope' }).success).toBe(false);
  });
});

describe('userProfileSchema', () => {
  const validProfile = {
    id: 'uid-1',
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    role: 'user',
    alertRadiusM: 1000,
    alertsEnabled: true,
    backgroundMonitoringEnabled: false,
    hapticsEnabled: true,
    soundEnabled: true,
    darkModePreference: 'system',
  };

  it('accepts a valid stored profile', () => {
    expect(userProfileSchema.safeParse(validProfile).success).toBe(true);
  });

  it('accepts an optional phone number', () => {
    expect(userProfileSchema.safeParse({ ...validProfile, phone: '+911234567' }).success).toBe(
      true,
    );
  });

  it.each(['user', 'moderator', 'admin'])('accepts the %s role', (role) => {
    expect(userProfileSchema.safeParse({ ...validProfile, role }).success).toBe(true);
  });

  it('rejects an unknown role', () => {
    expect(userProfileSchema.safeParse({ ...validProfile, role: 'superadmin' }).success).toBe(
      false,
    );
  });

  /**
   * The radius bounds are enforced here, in the Firestore rules, and in env
   * validation. A stored value outside the range would make proximity alerting
   * either useless or unbearable, so it is rejected on read too.
   */
  it.each([99, 2001, 0, -1])('rejects an out-of-range alert radius of %d', (alertRadiusM) => {
    expect(userProfileSchema.safeParse({ ...validProfile, alertRadiusM }).success).toBe(false);
  });

  it('rejects a fractional alert radius', () => {
    expect(userProfileSchema.safeParse({ ...validProfile, alertRadiusM: 500.5 }).success).toBe(
      false,
    );
  });

  it('rejects a profile with a missing required field', () => {
    const { alertsEnabled: _omitted, ...incomplete } = validProfile;
    expect(userProfileSchema.safeParse(incomplete).success).toBe(false);
  });

  it('rejects a wrong-typed boolean', () => {
    expect(userProfileSchema.safeParse({ ...validProfile, alertsEnabled: 'yes' }).success).toBe(
      false,
    );
  });
});
