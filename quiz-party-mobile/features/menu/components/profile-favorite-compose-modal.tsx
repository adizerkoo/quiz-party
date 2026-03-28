import { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { CreateQuestionDraft, CreateQuestionType, CreateQuizQuestion } from '@/features/create/types';
import {
  CREATE_MAX_OPTIONS,
  CREATE_MIN_OPTIONS,
  buildQuestionFromDraft,
  createEmptyQuestionDraft,
  validateQuestionDraft,
} from '@/features/create/utils/create-validation';
import { menuTheme } from '@/features/menu/theme/menu-theme';

type ProfileFavoriteComposeModalProps = {
  visible: boolean;
  saving: boolean;
  onClose: () => void;
  onSubmit: (question: CreateQuizQuestion) => Promise<void> | void;
};

const UI_TEXT = {
  title: 'Новый избранный вопрос',
  questionLabel: 'Текст вопроса',
  answerLabel: 'Ответ',
  optionsLabel: 'Варианты ответа',
  typeText: 'Текст',
  typeOptions: 'Выбор',
  addOption: 'Добавить вариант',
  save: 'Сохранить в избранное',
  saving: 'Сохраняем...',
  close: 'Закрыть',
};

function TypeButton({
  active,
  label,
  onPress,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        styles.typeButton,
        active && styles.typeButtonActive,
        pressed && styles.typeButtonPressed,
      ]}>
      <Text style={[styles.typeButtonText, active && styles.typeButtonTextActive]}>{label}</Text>
    </Pressable>
  );
}

export function ProfileFavoriteComposeModal({
  visible,
  saving,
  onClose,
  onSubmit,
}: ProfileFavoriteComposeModalProps) {
  const [draft, setDraft] = useState<CreateQuestionDraft>(createEmptyQuestionDraft());
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) {
      setDraft(createEmptyQuestionDraft());
      setErrorMessage(null);
    }
  }, [visible]);

  function updateDraft(patch: Partial<CreateQuestionDraft>) {
    setDraft((current) => ({
      ...current,
      ...patch,
      sourceQuestionPublicId: null,
    }));
  }

  function setQuestionType(type: CreateQuestionType) {
    if (type === 'text') {
      setDraft((current) => ({
        ...current,
        questionType: 'text',
        sourceQuestionPublicId: null,
      }));
      return;
    }

    setDraft((current) => ({
      ...current,
      questionType: 'options',
      correctText: '',
      sourceQuestionPublicId: null,
    }));
  }

  function updateOption(index: number, value: string) {
    setDraft((current) => {
      const nextOptions = [...current.options];
      nextOptions[index] = value;
      return {
        ...current,
        options: nextOptions,
        sourceQuestionPublicId: null,
      };
    });
  }

  function addOption() {
    setDraft((current) => {
      if (current.options.length >= CREATE_MAX_OPTIONS) {
        return current;
      }

      return {
        ...current,
        options: [...current.options, ''],
        sourceQuestionPublicId: null,
      };
    });
  }

  function removeOption(index: number) {
    setDraft((current) => {
      if (current.options.length <= CREATE_MIN_OPTIONS) {
        return current;
      }

      const nextOptions = current.options.filter((_, optionIndex) => optionIndex !== index);
      const nextCorrectIndex =
        current.selectedCorrectIndex >= nextOptions.length
          ? Math.max(0, nextOptions.length - 1)
          : current.selectedCorrectIndex;

      return {
        ...current,
        options: nextOptions,
        selectedCorrectIndex: nextCorrectIndex,
        sourceQuestionPublicId: null,
      };
    });
  }

  async function handleSubmit() {
    const validationError = validateQuestionDraft(draft);
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    setErrorMessage(null);
    await onSubmit(buildQuestionFromDraft(draft));
  }

  return (
    <Modal
      animationType="slide"
      onRequestClose={onClose}
      presentationStyle="pageSheet"
      visible={visible}>
      <View style={styles.screen}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <Text style={styles.title}>{UI_TEXT.title}</Text>
            <Pressable accessibilityRole="button" onPress={onClose}>
              <Text style={styles.closeLabel}>{UI_TEXT.close}</Text>
            </Pressable>
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>{UI_TEXT.questionLabel}</Text>
            <TextInput
              onChangeText={(questionText) => updateDraft({ questionText })}
              placeholder="Например: Какой был первый вопрос вечера?"
              placeholderTextColor={menuTheme.colors.hint}
              style={styles.input}
              value={draft.questionText}
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>Тип ответа</Text>
            <View style={styles.typeRow}>
              <TypeButton
                active={draft.questionType === 'text'}
                label={UI_TEXT.typeText}
                onPress={() => setQuestionType('text')}
              />
              <TypeButton
                active={draft.questionType === 'options'}
                label={UI_TEXT.typeOptions}
                onPress={() => setQuestionType('options')}
              />
            </View>
          </View>

          {draft.questionType === 'text' ? (
            <View style={styles.section}>
              <Text style={styles.label}>{UI_TEXT.answerLabel}</Text>
              <TextInput
                onChangeText={(correctText) => updateDraft({ correctText })}
                placeholder="Правильный ответ"
                placeholderTextColor={menuTheme.colors.hint}
                style={styles.input}
                value={draft.correctText}
              />
            </View>
          ) : (
            <View style={styles.section}>
              <Text style={styles.label}>{UI_TEXT.optionsLabel}</Text>
              <View style={styles.optionsList}>
                {draft.options.map((option, index) => {
                  const isCorrect = draft.selectedCorrectIndex === index;
                  return (
                    <View key={`favorite-option-${index}`} style={styles.optionRow}>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => updateDraft({ selectedCorrectIndex: index })}
                        style={[
                          styles.correctBadge,
                          isCorrect && styles.correctBadgeActive,
                        ]}>
                        <Text style={[
                          styles.correctBadgeText,
                          isCorrect && styles.correctBadgeTextActive,
                        ]}>
                          {index + 1}
                        </Text>
                      </Pressable>

                      <TextInput
                        onChangeText={(value) => updateOption(index, value)}
                        placeholder={`Вариант ${index + 1}`}
                        placeholderTextColor={menuTheme.colors.hint}
                        style={styles.optionInput}
                        value={option}
                      />

                      {draft.options.length > CREATE_MIN_OPTIONS ? (
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => removeOption(index)}
                          style={styles.removeOptionButton}>
                          <Text style={styles.removeOptionText}>×</Text>
                        </Pressable>
                      ) : null}
                    </View>
                  );
                })}
              </View>

              {draft.options.length < CREATE_MAX_OPTIONS ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={addOption}
                  style={({ pressed }) => [
                    styles.addOptionButton,
                    pressed && styles.addOptionButtonPressed,
                  ]}>
                  <Text style={styles.addOptionButtonText}>{UI_TEXT.addOption}</Text>
                </Pressable>
              ) : null}
            </View>
          )}

          {errorMessage ? (
            <View style={styles.errorCard}>
              <Text style={styles.errorText}>{errorMessage}</Text>
            </View>
          ) : null}

          <Pressable
            accessibilityRole="button"
            onPress={handleSubmit}
            style={({ pressed }) => [
              styles.saveButton,
              saving && styles.saveButtonDisabled,
              pressed && !saving && styles.saveButtonPressed,
            ]}>
            <Text style={styles.saveButtonText}>{saving ? UI_TEXT.saving : UI_TEXT.save}</Text>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: menuTheme.colors.screen,
  },
  content: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 32,
    gap: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  title: {
    flex: 1,
    color: menuTheme.colors.title,
    fontSize: 22,
    fontWeight: '900',
  },
  closeLabel: {
    color: menuTheme.colors.primary,
    fontSize: 14,
    fontWeight: '800',
  },
  section: {
    gap: 10,
  },
  label: {
    color: menuTheme.colors.primary,
    fontSize: 14,
    fontWeight: '800',
  },
  input: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(108, 92, 231, 0.14)',
    backgroundColor: 'rgba(255,255,255,0.96)',
    paddingHorizontal: 14,
    paddingVertical: 13,
    color: menuTheme.colors.title,
    fontSize: 15,
    fontWeight: '600',
  },
  typeRow: {
    flexDirection: 'row',
    gap: 10,
  },
  typeButton: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(108, 92, 231, 0.14)',
    backgroundColor: 'rgba(255,255,255,0.84)',
    paddingVertical: 12,
    alignItems: 'center',
  },
  typeButtonActive: {
    borderColor: menuTheme.colors.primary,
    backgroundColor: 'rgba(108, 92, 231, 0.12)',
  },
  typeButtonPressed: {
    transform: [{ scale: 0.98 }],
  },
  typeButtonText: {
    color: menuTheme.colors.subtitle,
    fontSize: 13,
    fontWeight: '800',
  },
  typeButtonTextActive: {
    color: menuTheme.colors.primary,
  },
  optionsList: {
    gap: 10,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  correctBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(108, 92, 231, 0.18)',
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  correctBadgeActive: {
    borderColor: menuTheme.colors.primary,
    backgroundColor: menuTheme.colors.primary,
  },
  correctBadgeText: {
    color: menuTheme.colors.primary,
    fontSize: 12,
    fontWeight: '900',
  },
  correctBadgeTextActive: {
    color: '#ffffff',
  },
  optionInput: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(108, 92, 231, 0.14)',
    backgroundColor: 'rgba(255,255,255,0.96)',
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: menuTheme.colors.title,
    fontSize: 14,
    fontWeight: '600',
  },
  removeOptionButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 95, 135, 0.12)',
  },
  removeOptionText: {
    color: menuTheme.colors.create,
    fontSize: 18,
    fontWeight: '900',
  },
  addOptionButton: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(108, 92, 231, 0.14)',
    backgroundColor: 'rgba(122, 165, 250, 0.12)',
  },
  addOptionButtonPressed: {
    transform: [{ scale: 0.98 }],
  },
  addOptionButtonText: {
    color: menuTheme.colors.primary,
    fontSize: 12,
    fontWeight: '800',
  },
  errorCard: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 95, 135, 0.18)',
    backgroundColor: 'rgba(255, 245, 245, 0.92)',
  },
  errorText: {
    color: menuTheme.colors.dangerText,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
  },
  saveButton: {
    borderRadius: 18,
    backgroundColor: menuTheme.colors.primary,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.7,
  },
  saveButtonPressed: {
    transform: [{ scale: 0.985 }],
  },
  saveButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '900',
  },
});
