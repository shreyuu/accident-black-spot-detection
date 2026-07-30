import { z } from 'zod';

import { phoneSchema } from '@/features/auth/schemas';

/**
 * Validation for emergency contacts.
 *
 * The phone rules are deliberately reused from the auth schemas rather than
 * rewritten: a number that is acceptable as the user's own must be acceptable
 * for a contact, and two independent definitions would eventually disagree.
 *
 * As everywhere else in this project, the client-side copy of each bound exists
 * to give the user a useful message; `firestore.rules` enforces the same limits
 * and is the copy that actually matters.
 */

export const CONTACT_NAME_MIN_LENGTH = 2;
export const CONTACT_NAME_MAX_LENGTH = 60;
export const CONTACT_RELATIONSHIP_MAX_LENGTH = 40;

/**
 * How many contacts one user may store.
 *
 * Bounded for two reasons. An SOS sent to fifteen people is not an emergency
 * message, it is a broadcast, and the composer becomes unusable. More
 * importantly this is other people's personal data: a cap keeps the app from
 * quietly becoming an address book.
 */
export const MAX_EMERGENCY_CONTACTS = 5;

/**
 * How many contacts one SOS may address at once.
 *
 * Lower than the stored maximum on purpose. Every recipient sees every other
 * recipient's number in a group SMS, so sending to the whole list would disclose
 * each contact's number to all the others — a privacy harm the user is unlikely
 * to have considered while pressing an emergency button.
 */
export const MAX_SOS_RECIPIENTS = 3;

export const contactNameSchema = z
  .string()
  .trim()
  .min(1, 'Enter this contact’s name.')
  .min(CONTACT_NAME_MIN_LENGTH, 'That name is too short.')
  .max(CONTACT_NAME_MAX_LENGTH, `Keep the name under ${CONTACT_NAME_MAX_LENGTH} characters.`);

/**
 * A contact's phone number. Required — unlike the user's own, which is optional.
 *
 * A contact without a number cannot be sent anything, so storing one would mean
 * holding a person's name for no purpose the user could act on.
 */
export const contactPhoneSchema = phoneSchema.refine((value) => value.length > 0, {
  message: 'Enter a phone number — an SOS cannot be sent without one.',
});

export const contactRelationshipSchema = z
  .string()
  .trim()
  .max(
    CONTACT_RELATIONSHIP_MAX_LENGTH,
    `Keep this under ${CONTACT_RELATIONSHIP_MAX_LENGTH} characters.`,
  );

export const emergencyContactFormSchema = z.object({
  name: contactNameSchema,
  phone: contactPhoneSchema,
  relationship: contactRelationshipSchema.optional(),
  isPrimary: z.boolean(),
});

export type EmergencyContactFormValues = z.input<typeof emergencyContactFormSchema>;
export type EmergencyContactValues = z.output<typeof emergencyContactFormSchema>;

/**
 * Shape of an `emergencyContacts/{id}` document as read back.
 *
 * Validated on read for the same reason every other stored document is: a record
 * that predates a schema change must not flow into the SOS flow as a well-typed
 * lie, because the failure mode there is a message addressed to nobody during an
 * emergency.
 */
export const emergencyContactDocumentSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  name: z.string().min(1).max(CONTACT_NAME_MAX_LENGTH),
  phone: z.string().min(1).max(20),
  relationship: z.string().max(CONTACT_RELATIONSHIP_MAX_LENGTH).optional(),
  isPrimary: z.boolean(),
});

export type EmergencyContactDocument = z.infer<typeof emergencyContactDocumentSchema>;
