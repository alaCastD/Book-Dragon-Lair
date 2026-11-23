// Website version of dialogs.ts, using the browser's own dialogs.

export function showMessage(title: string, message?: string): void {
  window.alert(message ? `${title}\n\n${message}` : title);
}

export function confirmAction(title: string, message: string, _confirmLabel: string, onConfirm: () => void): void {
  if (window.confirm(`${title}\n\n${message}`)) onConfirm();
}
