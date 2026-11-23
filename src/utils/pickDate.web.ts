// Website version: opens the browser's own date picker using a hidden
// <input type="date">. Resolves with the chosen day, or null if cancelled.
import { fromDateInputValue, toDateInputValue } from './finishedDate';
import type { PickDateOptions } from './pickDate';

export type { PickDateOptions };

export function pickDate({ value, minimumDate, maximumDate }: PickDateOptions): Promise<Date | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'date';
    input.value = toDateInputValue(value);
    if (minimumDate) input.min = toDateInputValue(minimumDate);
    if (maximumDate) input.max = toDateInputValue(maximumDate);
    // Kept on the page (but invisible) so the browser can anchor its picker to it.
    Object.assign(input.style, { position: 'fixed', bottom: '0', left: '50%', opacity: '0', width: '1px', height: '1px' });
    document.body.appendChild(input);

    let settled = false;
    const finish = (d: Date | null) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(d);
    };
    input.addEventListener('change', () => finish(fromDateInputValue(input.value)));
    input.addEventListener('cancel', () => finish(null));
    input.addEventListener('blur', () => setTimeout(() => finish(null), 300));

    try {
      input.showPicker(); // Chrome, Edge, Safari 16+, Firefox 101+
    } catch {
      input.focus();
      input.click();
    }
  });
}
