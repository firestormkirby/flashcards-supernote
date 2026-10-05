/**
 * Shared UI pieces. Built for e-ink, following the original app's Mudita
 * Mindful Design approach: black and white only, generous spacing, large
 * touch targets, and nothing that animates (every animation frame is a
 * screen refresh on e-ink, which reads as flicker). No Pressable here ever
 * changes its look while pressed, for the same reason.
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  Pressable,
  ScrollView,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextStyle,
  View,
  ViewStyle,
} from 'react-native';
import {LibraryData} from '../core/model';
import {getLibrary, subscribeLibrary} from '../storage/libraryStore';
import {
  AppSettings,
  getSettings,
  subscribeSettings,
} from '../storage/settingsStore';

// ---------------------------------------------------------------- stores

export function useLibrary(): LibraryData {
  return useSyncExternalStore(subscribeLibrary, getLibrary);
}

export function useSettings(): AppSettings {
  return useSyncExternalStore(subscribeSettings, getSettings);
}

// ---------------------------------------------------------------- theme

export interface Theme {
  bg: string;
  fg: string;
  muted: string;
  line: string;
  /** Text on a filled (fg-coloured) button. */
  onFg: string;
}

const LIGHT: Theme = {
  bg: '#FFFFFF',
  fg: '#000000',
  muted: '#555555',
  line: '#000000',
  onFg: '#FFFFFF',
};
const DARK: Theme = {
  bg: '#000000',
  fg: '#FFFFFF',
  muted: '#BBBBBB',
  line: '#FFFFFF',
  onFg: '#000000',
};

const ThemeContext = createContext<Theme>(LIGHT);

export function ThemeProvider({children}: {children: React.ReactNode}) {
  const s = useSettings();
  return (
    <ThemeContext.Provider value={s.darkMode ? DARK : LIGHT}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}

export const PAD = 20;

// ---------------------------------------------------------------- text

export function T({
  children,
  size = 17,
  bold,
  muted,
  center,
  style,
  lines,
}: {
  children: React.ReactNode;
  size?: number;
  bold?: boolean;
  muted?: boolean;
  center?: boolean;
  style?: StyleProp<TextStyle>;
  lines?: number;
}) {
  const t = useTheme();
  return (
    <Text
      numberOfLines={lines}
      style={[
        {
          color: muted ? t.muted : t.fg,
          fontSize: size,
          lineHeight: Math.round(size * 1.3),
          fontWeight: bold ? '700' : '400',
          textAlign: center ? 'center' : 'left',
        },
        style,
      ]}>
      {children}
    </Text>
  );
}

// ---------------------------------------------------------------- buttons

export function Button({
  label,
  onPress,
  primary,
  disabled,
  compact,
  style,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
  disabled?: boolean;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const t = useTheme();
  const filled = primary && !disabled;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[
        styles.button,
        {
          minHeight: compact ? 48 : 58,
          borderColor: disabled ? t.muted : t.line,
          backgroundColor: filled ? t.fg : t.bg,
          borderStyle: disabled ? 'dashed' : 'solid',
        },
        style,
      ]}>
      <Text
        style={{
          color: filled ? t.onFg : disabled ? t.muted : t.fg,
          fontSize: compact ? 16 : 18,
          fontWeight: '700',
          textAlign: 'center',
        }}>
        {label}
      </Text>
    </Pressable>
  );
}

/** A small text button for top bars. `selected` draws it filled (a toggle that is on). */
export function BarButton({
  label,
  onPress,
  selected,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  selected?: boolean;
  accessibilityLabel?: string;
}) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      onPress={onPress}
      hitSlop={6}
      style={[
        styles.barButton,
        {
          borderColor: selected ? t.line : 'transparent',
          backgroundColor: selected ? t.fg : 'transparent',
        },
      ]}>
      <Text
        style={{
          color: selected ? t.onFg : t.fg,
          fontSize: 20,
          fontWeight: '700',
        }}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{selected}}
      onPress={onPress}
      style={[
        styles.chip,
        {borderColor: t.line, backgroundColor: selected ? t.fg : t.bg},
      ]}>
      <Text
        style={{
          color: selected ? t.onFg : t.fg,
          fontSize: 16,
          fontWeight: selected ? '700' : '400',
        }}>
        {label}
      </Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------- layout

/**
 * A screen with a top bar. `onBack` shows "←" on the left; `actions` sit on the right.
 */
export function Screen({
  title,
  subtitle,
  onBack,
  backLabel = '←',
  actions,
  children,
  scroll,
}: {
  title: string;
  subtitle?: string | null;
  onBack?: (() => void) | null;
  backLabel?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
  scroll?: boolean;
}) {
  const t = useTheme();
  return (
    <View style={{flex: 1, backgroundColor: t.bg}}>
      <View style={[styles.topBar, {borderBottomColor: t.line}]}>
        {onBack ? (
          <BarButton
            label={backLabel}
            onPress={onBack}
            accessibilityLabel="Back"
          />
        ) : null}
        <View style={{flex: 1, paddingHorizontal: onBack ? 6 : PAD - 8}}>
          <T size={22} bold lines={1}>
            {title}
          </T>
          {subtitle ? (
            <T size={14} muted lines={1}>
              {subtitle}
            </T>
          ) : null}
        </View>
        <View style={{flexDirection: 'row', alignItems: 'center'}}>
          {actions}
        </View>
      </View>
      {scroll ? (
        <ScrollView
          style={{flex: 1}}
          contentContainerStyle={{padding: PAD, paddingBottom: PAD * 2}}>
          {children}
        </ScrollView>
      ) : (
        <View style={{flex: 1}}>{children}</View>
      )}
    </View>
  );
}

export function Divider({inset = 0}: {inset?: number}) {
  const t = useTheme();
  return (
    <View
      style={{
        height: StyleSheet.hairlineWidth * 2,
        backgroundColor: t.line,
        opacity: 0.35,
        marginLeft: inset,
      }}
    />
  );
}

export function Spacer({h = 12}: {h?: number}) {
  return <View style={{height: h}} />;
}

export function SectionTitle({children}: {children: React.ReactNode}) {
  return (
    <View style={{paddingTop: 22, paddingBottom: 8}}>
      <T size={14} bold muted>
        {String(children).toUpperCase()}
      </T>
    </View>
  );
}

/** A list row: title, optional subtitle, optional trailing element. */
export function Row({
  title,
  subtitle,
  onPress,
  onLongPress,
  right,
  bold,
  lead,
  titleLines = 2,
  pad = PAD,
  selected,
}: {
  title: string;
  subtitle?: string | null;
  onPress?: () => void;
  onLongPress?: () => void;
  right?: React.ReactNode;
  bold?: boolean;
  lead?: string;
  titleLines?: number;
  /** Side padding; 0 inside a page that is already padded. */
  pad?: number;
  /** Drawn inverted (light on dark), like a selected tab: the strongest contrast e-ink has. */
  selected?: boolean;
}) {
  const t = useTheme();
  const ink = selected ? {color: t.onFg} : undefined;
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={!onPress && !onLongPress}
      accessibilityState={selected ? {selected: true} : undefined}
      style={[
        styles.row,
        {paddingHorizontal: pad},
        selected ? {backgroundColor: t.fg} : null,
      ]}>
      {lead ? (
        <T size={20} style={[{width: 34}, ink]}>
          {lead}
        </T>
      ) : null}
      <View style={{flex: 1}}>
        <T size={18} bold={bold || selected} lines={titleLines} style={ink}>
          {title}
        </T>
        {subtitle ? (
          <T size={14} muted={!selected} lines={2} style={ink}>
            {subtitle}
          </T>
        ) : null}
      </View>
      {right}
    </Pressable>
  );
}

/** An on/off row. Drawn as a box with a check rather than a sliding switch, which would animate. */
export function ToggleRow({
  title,
  subtitle,
  value,
  onChange,
}: {
  title: string;
  subtitle?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{checked: value}}
      onPress={() => onChange(!value)}
      style={[styles.row, {paddingHorizontal: 0}]}>
      <View style={{flex: 1, paddingRight: 12}}>
        <T size={18}>{title}</T>
        {subtitle ? (
          <T size={14} muted>
            {subtitle}
          </T>
        ) : null}
      </View>
      <View
        style={[
          styles.checkBox,
          {borderColor: t.line, backgroundColor: value ? t.fg : t.bg},
        ]}>
        <Text style={{color: t.onFg, fontSize: 18, fontWeight: '700'}}>
          {value ? '✓' : ''}
        </Text>
      </View>
    </Pressable>
  );
}

/** One choice out of a few, as a row of chips. */
export function Segmented<V extends string | number>({
  options,
  value,
  onChange,
}: {
  options: {value: V; label: string}[];
  value: V;
  onChange: (v: V) => void;
}) {
  return (
    <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 8}}>
      {options.map(o => (
        <Chip
          key={String(o.value)}
          label={o.label}
          selected={o.value === value}
          onPress={() => onChange(o.value)}
        />
      ))}
    </View>
  );
}

export function EmptyState({
  title,
  message,
  children,
}: {
  title: string;
  message?: string;
  children?: React.ReactNode;
}) {
  return (
    <View style={{flex: 1, justifyContent: 'center', padding: PAD * 1.5}}>
      <T size={24} bold center>
        {title}
      </T>
      {message ? (
        <>
          <Spacer h={10} />
          <T size={16} muted center>
            {message}
          </T>
        </>
      ) : null}
      {children ? <View style={{marginTop: 28}}>{children}</View> : null}
    </View>
  );
}

// ---------------------------------------------------------------- dialogs

/**
 * A dialog drawn over the current screen. Not RN's <Modal>, which opens a new
 * Android window; inside PluginHost that is an unknown, and an in-tree overlay
 * is enough.
 */
export function Dialog({
  onDismiss,
  children,
}: {
  onDismiss: () => void;
  children: React.ReactNode;
}) {
  const t = useTheme();
  return (
    <View style={StyleSheet.absoluteFill}>
      <Pressable
        style={[StyleSheet.absoluteFill, {backgroundColor: t.bg, opacity: 0.6}]}
        onPress={onDismiss}
      />
      <View style={styles.dialogWrap} pointerEvents="box-none">
        <View
          style={[styles.dialog, {backgroundColor: t.bg, borderColor: t.line}]}>
          <ScrollView bounces={false} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        </View>
      </View>
    </View>
  );
}

export function ActionsDialog({
  title,
  actions,
  onDismiss,
  dismissOnSelect = true,
}: {
  title: string;
  actions: {label: string; onPress: () => void; destructive?: boolean}[];
  onDismiss: () => void;
  /** Close before running the action. Off when an action opens the dialog's own next step. */
  dismissOnSelect?: boolean;
}) {
  return (
    <Dialog onDismiss={onDismiss}>
      <T size={20} bold>
        {title}
      </T>
      <Spacer h={8} />
      {actions.map((a, i) => (
        <View key={a.label}>
          {i > 0 ? <Divider /> : null}
          <Pressable
            style={{paddingVertical: 16}}
            onPress={() => {
              if (dismissOnSelect) onDismiss();
              a.onPress();
            }}>
            <T size={18} bold={a.destructive}>
              {a.label}
            </T>
          </Pressable>
        </View>
      ))}
      <Spacer h={8} />
      <Button label="Cancel" compact onPress={onDismiss} />
    </Dialog>
  );
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  onConfirm,
  onDismiss,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onDismiss: () => void;
}) {
  return (
    <Dialog onDismiss={onDismiss}>
      <T size={20} bold>
        {title}
      </T>
      <Spacer h={10} />
      <T size={16}>{message}</T>
      <Spacer h={20} />
      <View style={{flexDirection: 'row', gap: 10}}>
        <Button label="Cancel" compact onPress={onDismiss} style={{flex: 1}} />
        <Button
          label={confirmLabel}
          compact
          primary
          style={{flex: 1}}
          onPress={() => {
            onDismiss();
            onConfirm();
          }}
        />
      </View>
    </Dialog>
  );
}

export function MessageDialog({
  title,
  message,
  onDismiss,
}: {
  title: string;
  message: string;
  onDismiss: () => void;
}) {
  return (
    <Dialog onDismiss={onDismiss}>
      <T size={20} bold>
        {title}
      </T>
      <Spacer h={10} />
      <T size={16}>{message}</T>
      <Spacer h={20} />
      <Button label="Okay" primary compact onPress={onDismiss} />
    </Dialog>
  );
}

export function TextInputDialog({
  title,
  initial,
  confirmLabel,
  validate,
  onConfirm,
  onDismiss,
}: {
  title: string;
  initial: string;
  confirmLabel: string;
  validate?: (value: string) => string | null;
  onConfirm: (value: string) => void;
  onDismiss: () => void;
}) {
  const [value, setValue] = useState(initial);
  const error = value.trim() === '' ? null : validate?.(value) ?? null;
  const ok = value.trim() !== '' && !error;
  return (
    <Dialog onDismiss={onDismiss}>
      <T size={20} bold>
        {title}
      </T>
      <Spacer h={12} />
      <Input
        value={value}
        onChangeText={setValue}
        autoFocus
        onSubmitEditing={() => ok && onConfirm(value)}
      />
      {error ? (
        <T size={14} muted style={{marginTop: 6}}>
          {error}
        </T>
      ) : null}
      <Spacer h={20} />
      <View style={{flexDirection: 'row', gap: 10}}>
        <Button label="Cancel" compact onPress={onDismiss} style={{flex: 1}} />
        <Button
          label={confirmLabel}
          compact
          primary
          disabled={!ok}
          style={{flex: 1}}
          onPress={() => onConfirm(value)}
        />
      </View>
    </Dialog>
  );
}

export function Input({
  value,
  onChangeText,
  placeholder,
  multiline,
  autoFocus,
  onSubmitEditing,
  minHeight,
}: {
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  autoFocus?: boolean;
  onSubmitEditing?: () => void;
  minHeight?: number;
}) {
  const t = useTheme();
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={t.muted}
      multiline={multiline}
      autoFocus={autoFocus}
      onSubmitEditing={onSubmitEditing}
      blurOnSubmit={!multiline}
      textAlignVertical={multiline ? 'top' : 'center'}
      style={[
        styles.input,
        {
          color: t.fg,
          borderColor: t.line,
          minHeight: minHeight ?? (multiline ? 120 : 52),
        },
      ]}
    />
  );
}

/** Re-render every `ms` so "due" counts stay honest while a screen stays open. */
export function useNow(ms = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

const styles = StyleSheet.create({
  button: {
    borderWidth: 2,
    borderRadius: 10,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  barButton: {
    minWidth: 48,
    minHeight: 48,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chip: {
    borderWidth: 2,
    borderRadius: 22,
    paddingHorizontal: 16,
    minHeight: 44,
    justifyContent: 'center',
  },
  topBar: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    borderBottomWidth: 2,
  },
  row: {
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: PAD,
  },
  checkBox: {
    width: 32,
    height: 32,
    borderWidth: 2,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dialogWrap: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    padding: 28,
  },
  dialog: {
    borderWidth: 2,
    borderRadius: 14,
    padding: 22,
    maxHeight: '90%',
  },
  input: {
    borderWidth: 2,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 18,
  },
});

/** A divider between list rows (a stable component, for FlatList's ItemSeparatorComponent). */
export function RowSeparator() {
  return <Divider inset={PAD} />;
}
