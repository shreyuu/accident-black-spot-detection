import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components';
import { MAX_SOS_RECIPIENTS } from '@/features/emergency-contacts/contactSchemas';
import { formatPhoneForDisplay } from '@/features/sos/phoneNumber';
import { SOS_RECIPIENT_LIMIT_NOTE } from '@/features/sos/sosCopy';
import { useTheme } from '@/theme';
import type { EmergencyContact } from '@/types/domain';

export interface SosContactPickerProps {
  contacts: readonly EmergencyContact[];
  selectedIds: readonly string[];
  onToggle: (contactId: string) => void;
  disabled?: boolean;
}

/**
 * Choosing who an SOS goes to.
 *
 * Multi-select rather than a single choice, because the person best placed to
 * help may not be the one who answers first. It is capped, though: every
 * recipient of a group SMS can see the others' numbers, so sending to a long
 * list quietly discloses each contact's number to all the rest — something a
 * user pressing an emergency button has no reason to be thinking about. The cap
 * is stated on screen rather than silently enforced.
 *
 * Selection is conveyed by a tick, a border weight and `accessibilityState`, not
 * by colour alone.
 */
export function SosContactPicker({
  contacts,
  selectedIds,
  onToggle,
  disabled = false,
}: SosContactPickerProps) {
  const theme = useTheme();
  const atLimit = selectedIds.length >= MAX_SOS_RECIPIENTS;

  return (
    <View style={{ gap: theme.spacing.sm }}>
      <View style={{ gap: theme.spacing.xxs }}>
        <AppText variant="label" color="textMuted">
          Who should receive it?
        </AppText>
        <AppText variant="caption" color="textSubtle">
          {`Up to ${MAX_SOS_RECIPIENTS} at once. ${SOS_RECIPIENT_LIMIT_NOTE}`}
        </AppText>
      </View>

      <View
        accessibilityRole="list"
        accessibilityLabel="Emergency contacts"
        style={{ gap: theme.spacing.sm }}
      >
        {contacts.map((contact) => {
          const selected = selectedIds.includes(contact.id);
          // A contact already at the cap stays tappable when selected, so the
          // user can always deselect their way out.
          const blocked = disabled || (atLimit && !selected);

          return (
            <Pressable
              key={contact.id}
              onPress={() => onToggle(contact.id)}
              disabled={blocked}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: selected, disabled: blocked }}
              accessibilityLabel={`${contact.name}${contact.relationship === undefined ? '' : `, ${contact.relationship}`}, ${formatPhoneForDisplay(contact.phone)}`}
              accessibilityHint={
                blocked
                  ? `You can select up to ${MAX_SOS_RECIPIENTS} contacts. Deselect one first.`
                  : undefined
              }
              testID={`sos-contact-${contact.id}`}
              style={({ pressed }) => [
                styles.row,
                {
                  backgroundColor: selected
                    ? theme.colors.primaryMuted
                    : pressed
                      ? theme.colors.surfaceMuted
                      : theme.colors.surface,
                  borderColor: selected ? theme.colors.primary : theme.colors.border,
                  borderRadius: theme.radius.md,
                  borderWidth: selected ? 2 : 1.5,
                  gap: theme.spacing.md,
                  minHeight: theme.minTouchTarget,
                  padding: theme.spacing.md,
                },
                blocked && styles.blocked,
              ]}
            >
              <Ionicons
                name={selected ? 'checkbox' : 'square-outline'}
                size={22}
                color={selected ? theme.colors.primary : theme.colors.borderStrong}
              />

              <View style={styles.details}>
                <View style={styles.nameRow}>
                  <AppText variant="body" style={styles.name}>
                    {contact.name}
                  </AppText>
                  {contact.isPrimary ? (
                    <AppText variant="caption" color="primary">
                      Primary
                    </AppText>
                  ) : null}
                </View>
                <AppText variant="caption" color="textSubtle">
                  {formatPhoneForDisplay(contact.phone)}
                  {contact.relationship === undefined ? '' : ` · ${contact.relationship}`}
                </AppText>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: 'center', flexDirection: 'row' },
  details: { flex: 1, gap: 2 },
  nameRow: { alignItems: 'center', flexDirection: 'row', gap: 8 },
  name: { flexShrink: 1 },
  blocked: { opacity: 0.45 },
});
