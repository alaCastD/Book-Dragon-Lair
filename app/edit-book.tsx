import * as ImagePicker from 'expo-image-picker';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useDb } from '@/src/db/DbProvider';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
} from 'react-native';

import { getBook, updateBook } from '@/src/db';
import { BookCover } from '@/src/components/BookCover';
import { SegmentedControl } from '@/src/components/SegmentedControl';
import { StarRating } from '@/src/components/StarRating';
import { useColors } from '@/src/components/useColors';
import { requestSync } from '@/src/services/backgroundSync';
import {
  emptyForm,
  formFromBook,
  saveBookForm,
  type BookForm,
  type FormErrors,
} from '@/src/services/bookForm';
import { deleteCoverFile, saveCoverPhoto } from '@/src/services/covers';
import { notifyLibraryChanged } from '@/src/services/libraryEvents';
import type { Book } from '@/src/types';
import { showMessage } from '@/src/utils/dialogs';

type CoverChange = { kind: 'keep' } | { kind: 'new'; uri: string } | { kind: 'remove' };

const STATUS_OPTIONS = [
  { value: 'to_read', label: 'To Be Read' },
  { value: 'read', label: 'Read' },
] as const;

const PICKER_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  allowsEditing: true,
  aspect: [2, 3],
  quality: 0.7,
};

/** Add a book by hand (no `id`) or edit an existing one (`id` given). */
export default function EditBookScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const bookId = id ? Number(id) : undefined;
  const editing = bookId !== undefined;
  const db = useDb();
  const colors = useColors();

  const [original, setOriginal] = useState<Book | null>(null);
  const [form, setForm] = useState<BookForm>(emptyForm);
  const [errors, setErrors] = useState<FormErrors>({});
  const [cover, setCover] = useState<CoverChange>({ kind: 'keep' });
  const [loading, setLoading] = useState(editing);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (bookId === undefined) return;
    getBook(db, bookId).then((b) => {
      if (b) {
        setOriginal(b);
        setForm(formFromBook(b));
      }
      setLoading(false);
    });
  }, [db, bookId]);

  const set = <K extends keyof BookForm>(key: K) => (value: BookForm[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    if (errors[key]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const takePhoto = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      showMessage('Camera access needed', 'Allow camera access in your phone settings to photograph a cover.');
      return;
    }
    const r = await ImagePicker.launchCameraAsync(PICKER_OPTIONS);
    if (!r.canceled && r.assets[0]) setCover({ kind: 'new', uri: r.assets[0].uri });
  };

  const choosePhoto = async () => {
    const r = await ImagePicker.launchImageLibraryAsync(PICKER_OPTIONS);
    if (!r.canceled && r.assets[0]) setCover({ kind: 'new', uri: r.assets[0].uri });
  };

  const onSave = async () => {
    setSaving(true);
    try {
      const result = await saveBookForm(db, form, bookId);
      if (!result.ok) {
        setErrors(result.errors);
        return;
      }
      let book = result.book;

      const oldLocal = original?.coverLocalUri ?? null;
      if (cover.kind === 'new') {
        const uri = await saveCoverPhoto(cover.uri, book.id);
        book = (await updateBook(db, book.id, { coverLocalUri: uri, coverRemoteUrl: null })) ?? book;
        deleteCoverFile(oldLocal);
      } else if (cover.kind === 'remove') {
        book = (await updateBook(db, book.id, { coverLocalUri: null, coverRemoteUrl: null })) ?? book;
        deleteCoverFile(oldLocal);
      }

      notifyLibraryChanged();
      if (book.lookupState === 'pending') requestSync(db);

      if (editing) router.back();
      else router.replace({ pathname: '/book/[id]', params: { id: String(book.id) } });
    } catch (e) {
      showMessage("Couldn't save", (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: 'transparent' }]}>
        <ActivityIndicator />
      </View>
    );
  }

  const previewBook =
    cover.kind === 'new'
      ? { title: form.title, coverLocalUri: cover.uri, coverRemoteUrl: null }
      : cover.kind === 'remove'
        ? { title: form.title, coverLocalUri: null, coverRemoteUrl: null }
        : {
            title: form.title,
            coverLocalUri: original?.coverLocalUri ?? null,
            coverRemoteUrl: original?.coverRemoteUrl ?? null,
          };
  const hasCover = previewBook.coverLocalUri !== null || previewBook.coverRemoteUrl !== null;

  const field = (
    key: Exclude<keyof BookForm, 'status' | 'rating'>,
    label: string,
    opts: { placeholder?: string; keyboardType?: KeyboardTypeOptions; required?: boolean } = {},
  ) => (
    <View style={styles.field} key={key}>
      <Text style={[styles.label, { color: colors.mutedText }]}>
        {label}
        {opts.required ? ' *' : ''}
      </Text>
      <TextInput
        value={form[key]}
        onChangeText={set(key)}
        placeholder={opts.placeholder}
        placeholderTextColor={colors.mutedText}
        keyboardType={opts.keyboardType}
        style={[
          styles.input,
          {
            color: colors.text,
            backgroundColor: colors.card,
            borderColor: errors[key] ? colors.danger : colors.border,
          },
        ]}
        accessibilityLabel={label}
      />
      {errors[key] ? <Text style={[styles.error, { color: colors.danger }]}>{errors[key]}</Text> : null}
    </View>
  );

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <Stack.Screen options={{ title: editing ? 'Edit book' : 'Add a book' }} />
      <ScrollView
        style={{ backgroundColor: 'transparent' }}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled">
        <View style={styles.coverRow}>
          {cover.kind === 'new' ? (
            <View style={[styles.coverBox, { borderColor: colors.border }]}>
              <Image source={{ uri: cover.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            </View>
          ) : (
            <BookCover book={previewBook} style={styles.coverBox} />
          )}
          <View style={styles.coverButtons}>
            <SmallButton label="Take photo" onPress={takePhoto} colors={colors} />
            <SmallButton label="Choose photo" onPress={choosePhoto} colors={colors} />
            {hasCover && (
              <SmallButton label="Remove cover" onPress={() => setCover({ kind: 'remove' })} colors={colors} />
            )}
          </View>
        </View>

        {field('title', 'Title', { required: true })}
        {field('subtitle', 'Subtitle')}
        {field('authors', 'Author(s)', { placeholder: 'e.g. Terry Pratchett, Neil Gaiman' })}
        {field('isbn', 'ISBN', { placeholder: 'Optional: fills in missing details when online', keyboardType: 'number-pad' })}
        {field('publisher', 'Publisher')}
        {field('publishDate', 'Published', { placeholder: 'e.g. 1990' })}
        {field('edition', 'Edition', { placeholder: 'e.g. 2nd edition' })}
        {field('format', 'Format', { placeholder: 'e.g. Hardcover, Paperback' })}
        {field('pageCount', 'Pages', { keyboardType: 'number-pad' })}

        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.mutedText }]}>Status</Text>
          <SegmentedControl options={STATUS_OPTIONS} value={form.status} onChange={set('status')} />
        </View>
        <View style={styles.field}>
          <Text style={[styles.label, { color: colors.mutedText }]}>Your rating</Text>
          <StarRating rating={form.rating} onChange={set('rating')} size={32} />
        </View>

        <Pressable
          onPress={onSave}
          disabled={saving}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.save,
            { backgroundColor: colors.tint, opacity: pressed || saving ? 0.6 : 1 },
          ]}>
          <Text style={[styles.saveText, { color: colors.onTint }]}>
            {editing ? 'Save changes' : 'Add to library'}
          </Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function SmallButton({
  label,
  onPress,
  colors,
}: {
  label: string;
  onPress: () => void;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.small, { borderColor: colors.border, opacity: pressed ? 0.6 : 1 }]}>
      <Text style={{ color: colors.text, fontSize: 14 }}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 16, gap: 14, paddingBottom: 48 },
  coverRow: { flexDirection: 'row', gap: 16, alignItems: 'center' },
  coverBox: {
    width: 110,
    aspectRatio: 2 / 3,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  coverButtons: { flex: 1, gap: 8 },
  small: { borderWidth: 1, borderRadius: 8, paddingVertical: 9, paddingHorizontal: 12, alignItems: 'center' },
  field: { gap: 6 },
  label: { fontSize: 13, fontWeight: '600' },
  input: {
    minHeight: 44,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    fontSize: 16,
  },
  error: { fontSize: 13 },
  save: { marginTop: 8, borderRadius: 10, paddingVertical: 14, alignItems: 'center' },
  saveText: { fontSize: 16, fontWeight: '700' },
});
