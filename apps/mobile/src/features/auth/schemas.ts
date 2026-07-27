import { z } from 'zod';

import { ALERT_RADIUS_BOUNDS_M } from '@/config/env';
import { THEME_PREFERENCES, USER_ROLES } from '@/types/domain';

/**
 * Validation schemas for authentication and the user profile.
 *
 * The same schemas drive React Hook Form and the Firestore converter, so the
 * rules a user sees while typing are the rules applied to stored data. Messages
 * are written to be shown directly to a user — specific, and never blaming.
 */

/** Password floor. Firebase itself rejects fewer than 6 characters. */
export const PASSWORD_MIN_LENGTH = 8;
const PASSWORD_MAX_LENGTH = 128;

const NAME_MIN_LENGTH = 2;
const NAME_MAX_LENGTH = 80;

export const emailSchema = z
  .string()
  .trim()
  .min(1, 'Enter your email address.')
  .max(320, 'That email address is too long.')
  // Lowercased so an account is not accidentally duplicated by capitalisation.
  .toLowerCase()
  .pipe(z.string().email('Enter a valid email address, for example name@example.com.'));

export const nameSchema = z
  .string()
  .trim()
  .min(NAME_MIN_LENGTH, 'Enter your full name.')
  .max(NAME_MAX_LENGTH, `Keep your name under ${NAME_MAX_LENGTH} characters.`);

/**
 * Phone number, optional throughout the app.
 *
 * Accepts an optional leading `+` followed by 7–15 digits, matching the E.164
 * range, and tolerates spaces, hyphens and brackets while typing. Deliberately
 * permissive: rejecting a legitimate international format would block a user
 * from a field they do not even have to fill in. Strict per-region validation is
 * not attempted — it needs a library and a country context neither of which is
 * justified here.
 */
export const phoneSchema = z
  .string()
  .trim()
  .transform((value) => value.replace(/[\s()-]/g, ''))
  .refine((value) => value.length === 0 || /^\+?\d{7,15}$/.test(value), {
    message: 'Enter a valid phone number, or leave it blank.',
  });

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters.`)
  .max(PASSWORD_MAX_LENGTH, 'That password is too long.')
  // Composition requirements are kept light on purpose. Length contributes far
  // more to strength than forced symbol classes, which mostly push people toward
  // predictable substitutions.
  .refine((value) => /[a-zA-Z]/.test(value), {
    message: 'Include at least one letter.',
  })
  .refine((value) => /\d/.test(value), {
    message: 'Include at least one number.',
  });

// -----------------------------------------------------------------------------
// Form schemas
// -----------------------------------------------------------------------------

export const loginSchema = z.object({
  email: emailSchema,
  // Not validated for strength on sign-in: an existing account may predate the
  // current rules, and telling someone their password is "too weak" while they
  // are trying to log in is unhelpful and leaks policy detail.
  password: z.string().min(1, 'Enter your password.'),
});

export type LoginFormValues = z.input<typeof loginSchema>;
export type LoginValues = z.output<typeof loginSchema>;

export const registerSchema = z
  .object({
    name: nameSchema,
    email: emailSchema,
    phone: phoneSchema.optional(),
    password: passwordSchema,
    confirmPassword: z.string().min(1, 'Re-enter your password.'),
    acceptedTerms: z.boolean(),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: 'Both passwords must match.',
    // Attached to the confirmation field so the error appears where the user can
    // fix it, rather than at the top of the form.
    path: ['confirmPassword'],
  })
  .refine((values) => values.acceptedTerms, {
    message: 'Please accept the terms and privacy notice to continue.',
    path: ['acceptedTerms'],
  });

export type RegisterFormValues = z.input<typeof registerSchema>;
export type RegisterValues = z.output<typeof registerSchema>;

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export type ForgotPasswordFormValues = z.input<typeof forgotPasswordSchema>;
export type ForgotPasswordValues = z.output<typeof forgotPasswordSchema>;

// -----------------------------------------------------------------------------
// Stored profile
// -----------------------------------------------------------------------------

/**
 * Shape of a `users/{id}` document as read back from Firestore.
 *
 * Timestamps are validated separately by the converter, because Firestore
 * returns `Timestamp` class instances that Zod cannot usefully introspect.
 */
export const userProfileSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(NAME_MIN_LENGTH).max(NAME_MAX_LENGTH),
  email: z.string().min(1).max(320),
  phone: z.string().optional(),
  role: z.enum(USER_ROLES),
  alertRadiusM: z.number().int().min(ALERT_RADIUS_BOUNDS_M.min).max(ALERT_RADIUS_BOUNDS_M.max),
  alertsEnabled: z.boolean(),
  backgroundMonitoringEnabled: z.boolean(),
  hapticsEnabled: z.boolean(),
  soundEnabled: z.boolean(),
  darkModePreference: z.enum(THEME_PREFERENCES),
});
