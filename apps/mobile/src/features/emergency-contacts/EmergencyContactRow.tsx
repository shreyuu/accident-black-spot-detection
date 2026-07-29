import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components';
import { formatPhoneForDisplay } from '@/features/sos/phoneNumber';
import { useTheme } from '@/theme';
import type { EmergencyContact } from '@/types/domain';

export interface EmergencyContactRowProps {
  contact: EmergencyContact;
  onEdit: (contact: EmergencyContact) => void;
  onDelete: (contact: EmergencyContact) => void;
  onMakePrimary: (contact: EmergencyContact) => void;
  disabled?: boolean;
}

/**
 * One saved contact, with its actions.
 *
 * Edit, delete and "make primary" are separate labelled controls rather than a
 * swipe gesture or a long press. A hidden gesture is undiscoverable, and this
 * list is maintained rarely — most users will touch it once, months before they
 * ever need it to be correct.
 */
export function EmergencyContactRow({
  contact,
  onEdit,
  onDelete,
  onMakePrimary,
  disabled = false,
}: EmergencyContactRowProps) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.md,
          gap: theme.spacing.sm,
          padding: theme.spacing.lg,
        },
      ]}
      testID={`contact-row-${contact.id}`}
    >
      <View style={styles.header}>
        <View style={styles.identity}>
          <AppText variant="titleSmall">{contact.name}</AppText>
          <AppText variant="bodySmall" color="textMuted">
            {formatPhoneForDisplay(contact.phone)}
          </AppText>
          {contact.relationship !== undefined ? (
            <AppText variant="caption" color="textSubtle">
              {contact.relationship}
            </AppText>
          ) : null}
        </View>

        {contact.isPrimary ? (
          <View
            accessibilityRole="text"
            accessibilityLabel="Primary contact, selected by default on the SOS screen"
            style={[
              styles.badge,
              {
                borderColor: theme.colors.primary,
                borderRadius: theme.radius.pill,
                gap: theme.spacing.xs,
                paddingHorizontal: theme.spacing.sm,
                paddingVertical: theme.spacing.xxs,
              },
            ]}
          >
            <Ionicons name="star" size={12} color={theme.colors.primary} />
            <AppText variant="caption" color="primary">
              Primary
            </AppText>
          </View>
        ) : null}
      </View>

      <View style={[styles.actions, { gap: theme.spacing.lg }]}>
        <RowAction
          icon="create-outline"
          label="Edit"
          onPress={() => onEdit(contact)}
          disabled={disabled}
          testID={`contact-edit-${contact.id}`}
        />

        {contact.isPrimary ? null : (
          <RowAction
            icon="star-outline"
            label="Make primary"
            onPress={() => onMakePrimary(contact)}
            disabled={disabled}
            testID={`contact-primary-${contact.id}`}
          />
        )}

        <RowAction
          icon="trash-outline"
          label="Delete"
          onPress={() => onDelete(contact)}
          disabled={disabled}
          destructive
          testID={`contact-delete-${contact.id}`}
        />
      </View>
    </View>
  );
}

function RowAction({
  icon,
  label,
  onPress,
  disabled,
  destructive = false,
  testID,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled: boolean;
  destructive?: boolean;
  testID: string;
}) {
  const theme = useTheme();
  const colour = destructive ? theme.colors.danger : theme.colors.primary;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      hitSlop={8}
      testID={testID}
      style={[styles.action, { minHeight: theme.minTouchTarget }, disabled && styles.disabled]}
    >
      <Ionicons name={icon} size={16} color={colour} />
      <AppText variant="caption" style={{ color: colour }}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: StyleSheet.hairlineWidth },
  header: { alignItems: 'flex-start', flexDirection: 'row', gap: 12, justifyContent: 'space-between' },
  identity: { flex: 1, gap: 2 },
  badge: { alignItems: 'center', borderWidth: 1.5, flexDirection: 'row' },
  actions: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap' },
  action: { alignItems: 'center', flexDirection: 'row', gap: 4 },
  disabled: { opacity: 0.45 },
});
