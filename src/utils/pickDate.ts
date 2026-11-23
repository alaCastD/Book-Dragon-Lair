// Phone version: opens Android's calendar dialog. Resolves with the chosen
// day, or null if the user cancelled. (The website uses pickDate.web.ts.)
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Platform } from 'react-native';

export interface PickDateOptions {
  value: Date;
  minimumDate?: Date;
  maximumDate?: Date;
}

export function pickDate({ value, minimumDate, maximumDate }: PickDateOptions): Promise<Date | null> {
  if (Platform.OS !== 'android') {
    // This app is built for Android and the web; other platforms keep the current date.
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    DateTimePickerAndroid.open({
      value,
      mode: 'date',
      minimumDate,
      maximumDate,
      onChange: (event, date) => resolve(event.type === 'set' && date ? date : null),
    });
  });
}
