// Book Dragon Lair colors. The base is sage green (#9CAF88); text and buttons
// use deeper greens chosen to stay readable on it (contrast checked).
const SAGE = '#9CAF88';

export default {
  light: {
    /** The app's base color: page background, header and tab bar. */
    base: SAGE,
    background: SAGE,
    text: '#1F2A1C',
    mutedText: '#33412D',
    /** Cream "paper" for cards, inputs and placeholder covers. */
    card: '#F6F2E7',
    border: '#7E946B',
    tint: '#2A4023',
    onTint: '#FFFFFF',
    star: '#6B4300',
    starEmpty: '#F6F2E7',
    danger: '#7F1414',
    online: '#1E4D16',
    /** Laid over the background pattern; none needed in light mode. */
    overlay: 'transparent',
    tabIconDefault: '#33412D',
    tabIconSelected: '#1F2A1C',
  },
  dark: {
    base: '#33402B',
    background: '#26301F',
    text: '#E8EEE0',
    mutedText: '#B4C2A6',
    card: '#303B29',
    border: '#4A5A40',
    tint: '#B5C9A1',
    onTint: '#1F2A1C',
    star: '#E9B44C',
    starEmpty: '#4A5A40',
    danger: '#EF9A9A',
    online: '#8BC34A',
    /** Darkens the sage pattern so it stays a faint texture at night. */
    overlay: 'rgba(24, 31, 20, 0.86)',
    tabIconDefault: '#B4C2A6',
    tabIconSelected: '#E8EEE0',
  },
};
