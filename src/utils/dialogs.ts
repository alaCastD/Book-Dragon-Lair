// Pop-up messages. On the phone these are native dialogs; the website uses
// dialogs.web.ts, because React Native's Alert does nothing in a browser.
import { Alert } from 'react-native';

export function showMessage(title: string, message?: string): void {
  Alert.alert(title, message);
}

/** Asks before doing something that can't be undone. */
export function confirmAction(title: string, message: string, confirmLabel: string, onConfirm: () => void): void {
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: confirmLabel, style: 'destructive', onPress: onConfirm },
  ]);
}
