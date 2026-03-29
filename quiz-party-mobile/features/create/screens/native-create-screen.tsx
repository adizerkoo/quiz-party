import { useIsFocused } from '@react-navigation/native';
import { FontAwesome6 } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { Href, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  findNodeHandle,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { CreateActionButton } from '@/features/create/components/create-action-button';
import { CreateBackground } from '@/features/create/components/create-background';
import { CreateHeader } from '@/features/create/components/create-header';
import { CreateIdeaBanner } from '@/features/create/components/create-idea-banner';
import { CreateLibraryModal } from '@/features/create/components/create-library-modal';
import { CreateOptionRow } from '@/features/create/components/create-option-row';
import { CreateQuestionCard } from '@/features/create/components/create-question-card';
import { CreateTextField } from '@/features/create/components/create-text-field';
import { CreateToastStack } from '@/features/create/components/create-toast-stack';
import { CreateTypeSelector } from '@/features/create/components/create-type-selector';
import {
  createQuizRequest,
  ensureOwnerProfile,
  fetchTemplateDraft,
} from '@/features/create/services/create-api';
import {
  fetchCreatePublicLibraryWithCache,
  syncLibraryQuestionsWithFavorites,
} from '@/features/create/services/create-library-data';
import { clearCreateDraft, loadCreateDraft, saveCreateDraft } from '@/features/create/services/create-storage';
import {
  getCachedCreateLibraryQuestions,
  hydrateCreateLibraryCache,
} from '@/features/create/store/create-library-cache';
import { createTheme } from '@/features/create/theme/create-theme';
import {
  CreateLibraryCategoryId,
  CreateLibraryQuestion,
  CreateQuestionDraft,
  CreateQuizQuestion,
  CreateToastItem,
} from '@/features/create/types';
import {
  CREATE_MAX_OPTIONS,
  CREATE_MIN_OPTIONS,
  buildQuestionFromDraft,
  createEmptyQuestionDraft,
  validateQuestionDraft,
  validateQuizBeforeLaunch,
} from '@/features/create/utils/create-validation';
import { saveGameSessionCredentials } from '@/features/game/store/game-session-credentials';
import {
  addMenuFavorite,
  fetchMenuFavorites,
  removeMenuFavorite,
} from '@/features/menu/services/menu-favorites-api';
import {
  getCachedMenuFavorites,
  hydrateMenuFavoritesCache,
  setCachedMenuFavorites,
} from '@/features/menu/store/menu-favorites-cache';
import {
  getMenuSessionProfile,
  getOrCreateMenuInstallationPublicId,
  hydrateMenuSessionProfile,
} from '@/features/menu/store/menu-profile-session';
import { ensureMenuProfileSession } from '@/features/menu/services/menu-profile-api';
import { MenuProfile } from '@/features/menu/types';
import { createFeatureLogger } from '@/features/shared/services/feature-logger';

// Полноценный native-экран создания квиза.
// Здесь повторяются и визуальная структура create.html, и ключевая логика web-страницы:
// черновик, идеи, библиотека, добавление вопросов, редактирование и запуск комнаты.
export function NativeCreateScreen() {
  const router = useRouter();
  const isFocused = useIsFocused();
  const params = useLocalSearchParams<{ templatePublicId?: string | string[] }>();
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const titleInputRef = useRef<TextInput>(null);
  const questionInputRef = useRef<TextInput>(null);
  const textAnswerInputRef = useRef<TextInput>(null);
  const optionInputRefs = useRef<Record<number, TextInput | null>>({});
  const focusedInputRef = useRef<TextInput | null>(null);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const favoriteQuestionsRef = useRef<CreateLibraryQuestion[]>([]);

  const [title, setTitle] = useState('');
  const [questions, setQuestions] = useState<CreateQuizQuestion[]>([]);
  const [draft, setDraft] = useState<CreateQuestionDraft>(createEmptyQuestionDraft());
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [libraryQuestions, setLibraryQuestions] = useState<CreateLibraryQuestion[]>([]);
  const [favoriteQuestions, setFavoriteQuestions] = useState<CreateLibraryQuestion[]>([]);
  const [ownerProfile, setOwnerProfile] = useState<MenuProfile | null>(getMenuSessionProfile());
  const [libraryLoading, setLibraryLoading] = useState(true);
  const [favoritesLoading, setFavoritesLoading] = useState(false);
  const [libraryModalVisible, setLibraryModalVisible] = useState(false);
  const [activeLibraryCategory, setActiveLibraryCategory] = useState<CreateLibraryCategoryId>('all');
  const [currentIdea, setCurrentIdea] = useState<CreateLibraryQuestion | null>(null);
  const [toasts, setToasts] = useState<CreateToastItem[]>([]);
  const [isLaunching, setIsLaunching] = useState(false);
  const [isSavingFavorite, setIsSavingFavorite] = useState(false);
  const [draftHydrated, setDraftHydrated] = useState(false);
  const requestedTemplatePublicId = readSingleParam(params.templatePublicId);
  const handledTemplatePrefillRef = useRef<string | null>(null);
  const inFlightTemplatePrefillRef = useRef<string | null>(null);

  const logger = useRef(createFeatureLogger('native.create.screen')).current;

  const filteredLibraryQuestions = useMemo(() => {
    if (activeLibraryCategory === 'favorites') {
      return favoriteQuestions;
    }

    if (activeLibraryCategory === 'all') {
      return libraryQuestions;
    }

    return libraryQuestions.filter((question) => question.cat === activeLibraryCategory);
  }, [activeLibraryCategory, favoriteQuestions, libraryQuestions]);

  const currentIdeaText = currentIdea?.text
    ?? (libraryLoading ? 'Загрузка...' : 'Готовые идеи появятся после загрузки библиотеки.');

  useEffect(() => {
    let mounted = true;

    async function hydrateDraft() {
      try {
        const savedDraft = await loadCreateDraft();
        if (!mounted || !savedDraft) {
          return;
        }

        setTitle(savedDraft.title ?? '');
        setQuestions(savedDraft.questions ?? []);
        setDraft(savedDraft.questionDraft ?? createEmptyQuestionDraft());
      } finally {
        if (mounted) {
          setDraftHydrated(true);
        }
      }
    }

    hydrateDraft();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    async function hydrateProfile() {
      const hydratedProfile = await hydrateMenuSessionProfile();
      if (!mounted) {
        return;
      }

      if (!hydratedProfile?.id) {
        setOwnerProfile(hydratedProfile);
        return;
      }

      const authenticatedProfile =
        await ensureMenuProfileSession(hydratedProfile).catch(() => hydratedProfile);
      if (mounted) {
        setOwnerProfile(authenticatedProfile);
      }
    }

    void hydrateProfile();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    async function loadLibrary() {
      if (!isFocused) {
        return;
      }

      setLibraryLoading(true);
      setFavoritesLoading(Boolean(ownerProfile?.id));
      logger.info('library.load.started', {
        hasOwnerProfile: Boolean(ownerProfile?.id),
      });

      try {
        const authenticatedOwnerProfile = ownerProfile?.id
          ? await ensureMenuProfileSession(ownerProfile).catch(() => ownerProfile)
          : ownerProfile;
        if (mounted && authenticatedOwnerProfile && authenticatedOwnerProfile !== ownerProfile) {
          setOwnerProfile(authenticatedOwnerProfile);
        }
        let hasCachedData = applyCachedLibraryData(authenticatedOwnerProfile?.id ?? null);
        if (hasCachedData) {
          setLibraryLoading(false);
          setFavoritesLoading(false);
        }

        await Promise.all([
          hydrateCreateLibraryCache(),
          authenticatedOwnerProfile?.id ? hydrateMenuFavoritesCache() : Promise.resolve(null),
        ]);
        if (!mounted) {
          return;
        }

        hasCachedData = applyCachedLibraryData(authenticatedOwnerProfile?.id ?? null) || hasCachedData;
        if (hasCachedData) {
          setLibraryLoading(false);
          setFavoritesLoading(false);
        }
        const [publicItemsResult, favoriteItemsResult] = await Promise.allSettled([
          fetchCreatePublicLibraryWithCache({
            userId: authenticatedOwnerProfile?.id ?? null,
            installationPublicId: authenticatedOwnerProfile?.installationPublicId ?? null,
            sessionToken: authenticatedOwnerProfile?.sessionToken ?? null,
            originScreen: 'create',
          }),
          authenticatedOwnerProfile?.id
            ? fetchMenuFavorites(authenticatedOwnerProfile, { originScreen: 'create' })
            : Promise.resolve({ entries: [], source: 'cache', cachedAt: null }),
        ]);
        if (!mounted) {
          return;
        }

        if (publicItemsResult.status !== 'fulfilled') {
          throw publicItemsResult.reason;
        }

        const publicItems = publicItemsResult.value.entries;
        const favoriteItems = favoriteItemsResult.status === 'fulfilled'
          ? favoriteItemsResult.value.entries
          : [];

        if (favoriteItemsResult.status !== 'fulfilled') {
          logger.warn('favorites.load.failed', {
            message:
              favoriteItemsResult.reason instanceof Error
                ? favoriteItemsResult.reason.message
                : 'unknown_error',
          });
        }

        applyLoadedLibraryData(
          publicItems,
          favoriteItems,
          authenticatedOwnerProfile?.id ?? null,
          { persistFavoritesToCache: false },
        );
        logger.info('library.load.succeeded', {
          publicCount: publicItems.length,
          favoriteCount: favoriteItems.length,
          publicSource: publicItemsResult.value.source,
          favoriteSource:
            favoriteItemsResult.status === 'fulfilled'
              ? favoriteItemsResult.value.source
              : 'unavailable',
        });
      } catch (error) {
        if (mounted) {
          logger.warn('library.load.failed', {
            message: error instanceof Error ? error.message : 'unknown_error',
          });
          pushToast('Не удалось загрузить библиотеку вопросов.');
        }
      } finally {
        if (mounted) {
          setLibraryLoading(false);
          setFavoritesLoading(false);
        }
      }
    }

    void loadLibrary();

    return () => {
      mounted = false;
    };
  }, [isFocused, logger, ownerProfile?.id, ownerProfile?.installationPublicId, ownerProfile?.sessionToken]);

  useEffect(() => {
    favoriteQuestionsRef.current = favoriteQuestions;
  }, [favoriteQuestions]);

  useEffect(() => {
    if (!libraryQuestions.length) {
      return undefined;
    }

    const intervalId = setInterval(() => {
      setCurrentIdea((previousIdea) => pickNextIdea(libraryQuestions, previousIdea));
    }, 4000);

    return () => clearInterval(intervalId);
  }, [libraryQuestions]);

  useEffect(() => {
    if (!draftHydrated) {
      return undefined;
    }

    const timeoutId = setTimeout(() => {
      saveCreateDraft({
        title,
        questions,
        questionDraft: draft,
      }).catch(() => undefined);
    }, 250);

    return () => clearTimeout(timeoutId);
  }, [draft, draftHydrated, questions, title]);

  useEffect(() => {
    if (!draftHydrated || !requestedTemplatePublicId) {
      return;
    }
    if (handledTemplatePrefillRef.current === requestedTemplatePublicId) {
      return;
    }
    if (inFlightTemplatePrefillRef.current === requestedTemplatePublicId) {
      return;
    }

    const templatePublicId = requestedTemplatePublicId;
    let cancelled = false;
    inFlightTemplatePrefillRef.current = templatePublicId;

    async function prefillFromTemplate() {
      const profile = ownerProfile ?? getMenuSessionProfile();
      if (!profile?.id) {
        logger.warn('create.prefill.denied_local', {
          reason: 'missing_profile',
          templatePublicId,
        });
        handledTemplatePrefillRef.current = templatePublicId;
        pushToast('Для повтора игры нужен сохранённый профиль.');
        return;
      }

      logger.info('create.prefill.requested', {
        templatePublicId,
      });

      try {
        const authenticatedProfile = await ensureMenuProfileSession(profile);
        if (cancelled) {
          return;
        }

        if (authenticatedProfile && authenticatedProfile !== ownerProfile) {
          setOwnerProfile(authenticatedProfile);
        }

        const templateDraft = await fetchTemplateDraft({
          templatePublicId,
          userId: authenticatedProfile?.id ?? profile.id,
          installationPublicId:
            authenticatedProfile?.installationPublicId ?? profile.installationPublicId ?? null,
          sessionToken: authenticatedProfile?.sessionToken ?? profile.sessionToken ?? null,
          originScreen: 'history',
        });
        if (cancelled) {
          return;
        }

        const applyDraft = () => {
          applyTemplateDraftPrefill(templateDraft.title, templateDraft.questions ?? []);
          handledTemplatePrefillRef.current = templatePublicId;
          logger.info('create.prefill.applied', {
            templatePublicId,
            questionCount: templateDraft.questions?.length ?? 0,
          });
        };

        if (hasLocalCreateConflict()) {
          logger.warn('create.prefill.conflicted', {
            templatePublicId,
            existingQuestionCount: questions.length,
          });
          Alert.alert(
            'Заменить черновик?',
            'У тебя уже есть локальный черновик. Повтор игры может заменить его целиком.',
            [
              {
                text: 'Оставить мой черновик',
                style: 'cancel',
                onPress: () => {
                  handledTemplatePrefillRef.current = templatePublicId;
                },
              },
              {
                text: 'Заменить',
                style: 'destructive',
                onPress: applyDraft,
              },
            ],
          );
          return;
        }

        applyDraft();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'unknown_error';
        logger.warn('create.prefill.failed', {
          templatePublicId,
          message: errorMessage,
        });
        handledTemplatePrefillRef.current = templatePublicId;
        if (errorMessage.includes('HTTP 403')) {
          pushToast('Повтор этой игры доступен только ведущему.');
          logger.warn('repeat.denied.local', {
            templatePublicId,
          });
          return;
        }
        pushToast('Не удалось загрузить шаблон для повтора.');
      } finally {
        if (inFlightTemplatePrefillRef.current === templatePublicId) {
          inFlightTemplatePrefillRef.current = null;
        }
      }
    }

    void prefillFromTemplate();

    return () => {
      cancelled = true;
    };
  }, [
    draftHydrated,
    logger,
    ownerProfile?.id,
    ownerProfile?.installationPublicId,
    ownerProfile?.sessionToken,
    requestedTemplatePublicId,
  ]);

  useEffect(() => {
    const keyboardEventName = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const showSubscription = Keyboard.addListener(keyboardEventName, () => {
      if (focusedInputRef.current) {
        revealInputAboveKeyboard(focusedInputRef.current, 24);
      }
    });

    const hideSubscription = Keyboard.addListener('keyboardDidHide', () => {
      focusedInputRef.current = null;
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();

      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  function pushToast(message: string) {
    const toastId = `${Date.now()}-${Math.random()}`;
    const nextToast = { id: toastId, message };

    setToasts((current) => [...current, nextToast]);

    setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== toastId));
    }, 3000);
  }

  function updateDraft(
    patch: Partial<CreateQuestionDraft>,
    options: { preserveSourceQuestion?: boolean } = {},
  ) {
    setDraft((current) => {
      const shouldClearSourceQuestion =
        !options.preserveSourceQuestion
        && !Object.prototype.hasOwnProperty.call(patch, 'sourceQuestionPublicId')
        && (
          Object.prototype.hasOwnProperty.call(patch, 'questionText')
          || Object.prototype.hasOwnProperty.call(patch, 'questionType')
          || Object.prototype.hasOwnProperty.call(patch, 'correctText')
          || Object.prototype.hasOwnProperty.call(patch, 'options')
          || Object.prototype.hasOwnProperty.call(patch, 'selectedCorrectIndex')
        );

      return {
        ...current,
        ...patch,
        sourceQuestionPublicId: shouldClearSourceQuestion
          ? null
          : (patch.sourceQuestionPublicId ?? current.sourceQuestionPublicId ?? null),
      };
    });
  }

  function applyLoadedLibraryData(
    publicItems: CreateLibraryQuestion[],
    nextFavoriteQuestions: CreateLibraryQuestion[],
    profileId: number | null = ownerProfile?.id ?? null,
    options: { persistFavoritesToCache?: boolean } = {},
  ) {
    replaceFavoriteQuestions(nextFavoriteQuestions, profileId, {
      persistToCache: options.persistFavoritesToCache,
    });

    const mergedLibraryQuestions = syncLibraryQuestionsWithFavorites(publicItems, nextFavoriteQuestions);
    setLibraryQuestions(mergedLibraryQuestions);
    setCurrentIdea((previousIdea) => pickNextIdea(mergedLibraryQuestions, previousIdea));
  }

  function applyCachedLibraryData(profileId: number | null = ownerProfile?.id ?? null) {
    const cachedPublicItems = getCachedCreateLibraryQuestions()?.entries ?? [];
    const cachedFavoriteItems = profileId
      ? (getCachedMenuFavorites(profileId)?.entries ?? [])
      : [];

    if (!cachedPublicItems.length && !cachedFavoriteItems.length) {
      return false;
    }

    applyLoadedLibraryData(cachedPublicItems, cachedFavoriteItems, profileId, {
      persistFavoritesToCache: false,
    });
    return true;
  }

  function replaceFavoriteQuestions(
    nextFavoriteQuestions: CreateLibraryQuestion[],
    profileId: number | null = ownerProfile?.id ?? null,
    options: { persistToCache?: boolean } = {},
  ) {
    favoriteQuestionsRef.current = nextFavoriteQuestions;
    setFavoriteQuestions(nextFavoriteQuestions);

    if (options.persistToCache === false || !profileId) {
      return;
    }

    void setCachedMenuFavorites(profileId, nextFavoriteQuestions);
  }

  function upsertFavoriteQuestion(question: CreateLibraryQuestion, profileId?: number | null) {
    replaceFavoriteQuestions([
      { ...question, is_favorite: true },
      ...favoriteQuestionsRef.current.filter((item) => item.public_id !== question.public_id),
    ], profileId ?? null);
    setLibraryQuestions((current) => current.map((item) => (
      item.public_id === question.public_id
        ? { ...item, is_favorite: true }
        : item
    )));
  }

  function removeFavoriteQuestionLocally(questionPublicId: string, profileId?: number | null) {
    replaceFavoriteQuestions(
      favoriteQuestionsRef.current.filter((item) => item.public_id !== questionPublicId),
      profileId ?? null,
    );
    setLibraryQuestions((current) => current.map((item) => (
      item.public_id === questionPublicId
        ? { ...item, is_favorite: false }
        : item
    )));
  }

  async function requireFavoriteProfile() {
    const profile = ownerProfile ?? getMenuSessionProfile();
    if (!profile?.id) {
      pushToast('Сначала сохрани профиль, чтобы пользоваться избранным.');
      logger.warn('favorite.toggle.denied_local', {
        reason: 'missing_profile',
      });
      return null;
    }

    if (!profile.sessionToken) {
      void ensureMenuProfileSession(profile)
        .then((authenticatedProfile) => {
          if (authenticatedProfile?.id) {
            setOwnerProfile(authenticatedProfile);
          }
        })
        .catch(() => undefined);
      return profile;
    }

    const authenticatedProfile = await ensureMenuProfileSession(profile).catch(() => profile);
    if (!authenticatedProfile?.id) {
      pushToast('РќРµ СѓРґР°Р»РѕСЃСЊ РїРѕРґС‚РІРµСЂРґРёС‚СЊ РїСЂРѕС„РёР»СЊ. РџРѕРїСЂРѕР±СѓР№ РµС‰С‘ СЂР°Р·.');
      logger.warn('favorite.toggle.denied_local', {
        reason: 'missing_session',
      });
      return null;
    }

    if (authenticatedProfile !== ownerProfile) {
      setOwnerProfile(authenticatedProfile);
    }

    return authenticatedProfile;
  }

  async function handleToggleFavorite(question: CreateLibraryQuestion) {
    const profile = await requireFavoriteProfile();
    if (!profile?.id) {
      return;
    }

    try {
      if (question.is_favorite && question.public_id) {
        await removeMenuFavorite(profile, question.public_id, {
          originScreen: 'create',
        });
        removeFavoriteQuestionLocally(question.public_id, profile.id);
      } else {
        const favoriteQuestion = await addMenuFavorite(profile, {
          question,
          originScreen: 'create',
          sourceQuestionPublicId:
            question.source_question_public_id ?? question.public_id ?? null,
        });
        upsertFavoriteQuestion(favoriteQuestion, profile.id);
      }
    } catch (error) {
      logger.warn('favorite.toggle.failed', {
        message: error instanceof Error ? error.message : 'unknown_error',
        questionPublicId: question.public_id ?? null,
      });
      pushToast('Не удалось обновить избранное. Попробуй ещё раз.');
    }
  }

  async function handleSaveDraftToFavorites() {
    const profile = await requireFavoriteProfile();
    if (!profile?.id) {
      return;
    }

    const validationError = validateQuestionDraft(draft);
    if (validationError) {
      pushToast(validationError);
      return;
    }

    setIsSavingFavorite(true);

    try {
      const questionPayload = buildQuestionFromDraft(draft);
      const favoriteQuestion = await addMenuFavorite(profile, {
        question: questionPayload,
        originScreen: 'create',
        sourceQuestionPublicId: questionPayload.source_question_public_id ?? null,
      });
      upsertFavoriteQuestion(favoriteQuestion, profile.id);
      updateDraft(
        {
          sourceQuestionPublicId:
            resolveReusableSourceQuestionPublicId(favoriteQuestion),
        },
        { preserveSourceQuestion: true },
      );
      pushToast('Вопрос добавлен в избранное.');
    } catch (error) {
      logger.warn('favorite.save_custom.failed', {
        message: error instanceof Error ? error.message : 'unknown_error',
      });
      pushToast('Не удалось сохранить вопрос в избранное.');
    } finally {
      setIsSavingFavorite(false);
    }
  }

  function hasLocalCreateConflict() {
    return Boolean(
      title.trim()
      || questions.length
      || draft.questionText.trim()
      || draft.correctText.trim()
      || draft.options.some((item) => item.trim()),
    );
  }

  function applyTemplateDraftPrefill(templateTitle: string, templateQuestions: CreateQuizQuestion[]) {
    setTitle(templateTitle);
    setQuestions(templateQuestions);
    setDraft(createEmptyQuestionDraft());
    setEditIndex(null);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }

  function revealInputAboveKeyboard(input: TextInput | null, extraDelay = 0) {
    if (!input) {
      return;
    }

    const inputHandle = findNodeHandle(input);
    const scrollResponder = scrollRef.current as (ScrollView & {
      scrollResponderScrollNativeHandleToKeyboard?: (
        nodeHandle: number,
        additionalOffset?: number,
        preventNegativeScrollOffset?: boolean,
      ) => void;
    }) | null;

    if (!inputHandle || !scrollResponder?.scrollResponderScrollNativeHandleToKeyboard) {
      return;
    }

    // После фокуса поднимаем нужное поле ближе к верхней части экрана,
    // чтобы оно не уезжало под клавиатуру, а оставалось над ней.
    const delay = (Platform.OS === 'ios' ? 140 : 90) + extraDelay;

    if (scrollTimeoutRef.current) {
      clearTimeout(scrollTimeoutRef.current);
    }

    scrollTimeoutRef.current = setTimeout(() => {
      scrollResponder.scrollResponderScrollNativeHandleToKeyboard?.(inputHandle, 96, true);
    }, delay);
  }

  function handleInputFocus(input: TextInput | null) {
    focusedInputRef.current = input;
    revealInputAboveKeyboard(input);
  }

  function handleTypeChange(nextType: CreateQuestionDraft['questionType']) {
    updateDraft({ questionType: nextType });
  }

  function handleOptionChange(index: number, nextValue: string) {
    setDraft((current) => {
      const nextOptions = [...current.options];
      nextOptions[index] = nextValue;
      return {
        ...current,
        options: nextOptions,
        sourceQuestionPublicId: null,
      };
    });
  }

  function handleSelectCorrect(index: number) {
    updateDraft({ selectedCorrectIndex: index });
  }

  function handleAddOption() {
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

  function handleRemoveOption(index: number) {
    setDraft((current) => {
      if (current.options.length <= CREATE_MIN_OPTIONS) {
        return current;
      }

      const nextOptions = current.options.filter((_, optionIndex) => optionIndex !== index);
      let nextCorrectIndex = current.selectedCorrectIndex;

      if (index === current.selectedCorrectIndex) {
        nextCorrectIndex = 0;
      } else if (index < current.selectedCorrectIndex) {
        nextCorrectIndex -= 1;
      }

      return {
        ...current,
        options: nextOptions,
        selectedCorrectIndex: Math.max(0, nextCorrectIndex),
        sourceQuestionPublicId: null,
      };
    });
  }

  function handleClearOptions() {
    setDraft((current) => ({
      ...current,
      options: current.options.map(() => ''),
      selectedCorrectIndex: 0,
      sourceQuestionPublicId: null,
    }));
  }

  function resetDraftAfterSave() {
    setDraft({
      ...createEmptyQuestionDraft(),
      questionType: 'text',
    });
    setEditIndex(null);
  }

  function handleAddQuestion() {
    const validationError = validateQuestionDraft(draft);

    if (validationError) {
      pushToast(validationError);
      return;
    }

    const question = buildQuestionFromDraft(draft);

    setQuestions((current) => {
      if (editIndex === null) {
        return [...current, question];
      }

      return current.map((item, index) => (index === editIndex ? question : item));
    });

    pushToast(editIndex === null ? 'Вопрос добавлен!' : 'Вопрос обновлен!');
    resetDraftAfterSave();
  }

  function handleEditQuestion(index: number) {
    const question = questions[index];
    if (!question) {
      return;
    }

    setEditIndex(index);
    setDraft(buildDraftFromQuestion(question));
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }

  function handleRemoveQuestion(index: number) {
    setQuestions((current) => current.filter((_, itemIndex) => itemIndex !== index));
    pushToast('Вопрос удален');

    if (editIndex === index) {
      resetDraftAfterSave();
    } else if (editIndex !== null && index < editIndex) {
      setEditIndex((current) => (current === null ? null : current - 1));
    }
  }

  function handleRefreshIdea() {
    setCurrentIdea((previousIdea) => pickNextIdea(libraryQuestions, previousIdea));
  }

  function applyImportedQuestion(question: CreateLibraryQuestion) {
    setDraft(buildDraftFromQuestion(question));
    setLibraryModalVisible(false);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }

  function handleInsertCurrentIdea() {
    if (!currentIdea) {
      return;
    }

    applyImportedQuestion(currentIdea);
  }

  async function handleLaunchQuiz() {
    const validationError = validateQuizBeforeLaunch(title, questions);

    if (validationError) {
      pushToast(validationError);

      if (!title.trim()) {
        scrollRef.current?.scrollTo({ y: 0, animated: true });
        titleInputRef.current?.focus();
        revealInputAboveKeyboard(titleInputRef.current, 40);
      } else if (!questions.length) {
        questionInputRef.current?.focus();
        revealInputAboveKeyboard(questionInputRef.current, 40);
      }

      return;
    }

    setIsLaunching(true);

    try {
      const ownerProfile = await ensureOwnerProfile(getMenuSessionProfile());
      const createdQuiz = await createQuizRequest({
        title: title.trim(),
        questions,
        ownerId: ownerProfile?.id ?? null,
        ownerInstallationPublicId: ownerProfile?.installationPublicId ?? null,
        ownerSessionToken: ownerProfile?.sessionToken ?? null,
      });
      saveGameSessionCredentials({
        roomCode: createdQuiz.code,
        role: 'host',
        hostToken: createdQuiz.host_token ?? null,
        installationPublicId: ownerProfile?.installationPublicId ?? getOrCreateMenuInstallationPublicId(),
      });

      await clearCreateDraft();

      router.push({
        pathname: '/host-game' as Href,
        params: { room: createdQuiz.code },
      } as Href);
    } catch (error) {
      pushToast('Не удалось создать игру. Проверь backend и интернет.');
    } finally {
      setIsLaunching(false);
    }
  }

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <StatusBar style="dark" />

      <View style={styles.screen}>
        <CreateBackground />
        <CreateToastStack items={toasts} />

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.screen}>
          <ScrollView
            ref={scrollRef}
            bounces={false}
            contentContainerStyle={[
              styles.content,
              // Нижний запас под фиксированную кнопку запуска.
              // Держим его компактнее, чтобы между списком вопросов и кнопкой не было лишней пустоты.
              // Главная настройка расстояния между последним контентом и нижней CTA-кнопкой.
              // Чем меньше число, тем ближе кнопка будет к списку вопросов.
              { paddingBottom: 98 + insets.bottom },
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            <View style={styles.mainCard}>
              <CreateHeader onBackPress={() => router.back()} />

              <View style={styles.titleGroup}>
                <CreateTextField
                  ref={titleInputRef}
                  centered
                  label="Название вечеринки:"
                  maxLength={50}
                  onChangeText={setTitle}
                  onFocus={() => handleInputFocus(titleInputRef.current)}
                  placeholder="Например: ДР Артёма 🎂"
                  value={title}
                  variant="title"
                />
              </View>

              <View style={styles.creationZone}>
                <View style={styles.sectionLabelRow}>
                  <Text style={styles.sectionLabel}>Твой вопрос</Text>

                  <View style={styles.inlineActions}>
                    <Pressable onPress={handleSaveDraftToFavorites} style={({ pressed }) => [
                      styles.inlineFavoriteButton,
                      isSavingFavorite && styles.inlineFavoriteButtonDisabled,
                      pressed && !isSavingFavorite && styles.inlineFavoriteButtonPressed,
                    ]}>
                      <FontAwesome6 color={createTheme.colors.pink} iconStyle="solid" name="heart" size={12} />
                      <Text style={styles.inlineFavoriteButtonText}>
                        {isSavingFavorite ? 'Сохраняем...' : 'В избранное'}
                      </Text>
                    </Pressable>

                    <Pressable onPress={() => setLibraryModalVisible(true)} style={({ pressed }) => [
                      styles.inlineLibraryButton,
                      pressed && styles.inlineLibraryButtonPressed,
                    ]}>
                      <FontAwesome6 color={createTheme.colors.purple} iconStyle="solid" name="book-open" size={12} />
                      <Text style={styles.inlineLibraryButtonText}>
                        {favoritesLoading ? 'Загрузка...' : 'Библиотека'}
                      </Text>
                    </Pressable>
                  </View>
                </View>

                <CreateTextField
                  ref={questionInputRef}
                  maxLength={180}
                  onChangeText={(questionText) => updateDraft({ questionText })}
                  onFocus={() => handleInputFocus(questionInputRef.current)}
                  placeholder="Например: В каком году вышел первый iPhone?"
                  value={draft.questionText}
                />

                <CreateIdeaBanner
                  ideaText={currentIdeaText}
                  onInsert={handleInsertCurrentIdea}
                  onRefresh={handleRefreshIdea}
                />

                <Text style={styles.sectionLabel}>Тип ответа:</Text>
                <CreateTypeSelector onChange={handleTypeChange} value={draft.questionType} />

                {draft.questionType === 'options' ? (
                  <View style={styles.optionsZone}>
                    <View style={styles.sectionLabelRow}>
                      <Text style={styles.sectionLabel}>Отметь правильный вариант:</Text>

                      <Pressable onPress={handleClearOptions} style={({ pressed }) => [
                        styles.clearOptionsButton,
                        pressed && styles.clearOptionsButtonPressed,
                      ]}>
                        <FontAwesome6 color={createTheme.colors.danger} iconStyle="solid" name="broom" size={11} />
                        <Text style={styles.clearOptionsButtonText}>Очистить</Text>
                      </Pressable>
                    </View>

                    {draft.options.map((option, index) => (
                      <CreateOptionRow
                        key={`option-${index}`}
                        inputRef={(input) => {
                          optionInputRefs.current[index] = input;
                        }}
                        index={index}
                        isCorrect={draft.selectedCorrectIndex === index}
                        onChangeText={(nextValue) => handleOptionChange(index, nextValue)}
                        onClear={() => handleOptionChange(index, '')}
                        onFocus={() => handleInputFocus(optionInputRefs.current[index] ?? null)}
                        onRemove={() => handleRemoveOption(index)}
                        onSelectCorrect={() => handleSelectCorrect(index)}
                        removable={draft.options.length > CREATE_MIN_OPTIONS}
                        value={option}
                      />
                    ))}

                    {draft.options.length < CREATE_MAX_OPTIONS ? (
                      <Pressable onPress={handleAddOption} style={({ pressed }) => [
                        styles.addOptionButton,
                        pressed && styles.addOptionButtonPressed,
                      ]}>
                        <FontAwesome6 color={createTheme.colors.purple} iconStyle="solid" name="plus" size={12} />
                        <Text style={styles.addOptionButtonText}>Добавить вариант</Text>
                      </Pressable>
                    ) : null}
                  </View>
                ) : (
                  <CreateTextField
                    label="Ответ:"
                    ref={textAnswerInputRef}
                    onChangeText={(correctText) => updateDraft({ correctText })}
                    onFocus={() => handleInputFocus(textAnswerInputRef.current)}
                    placeholder="Правильный ответ"
                    showClear
                    onClear={() => updateDraft({ correctText: '' })}
                    value={draft.correctText}
                  />
                )}

                <CreateActionButton
                  label={editIndex === null ? 'ДОБАВИТЬ ВОПРОС' : 'СОХРАНИТЬ ИЗМЕНЕНИЯ'}
                  onPress={handleAddQuestion}
                />
              </View>

              {questions.length ? (
                <View style={styles.listZone}>
                  <View style={styles.questionsHeader}>
                    <Text style={styles.questionsTitle}>Вопросы</Text>

                    <View style={styles.questionsCount}>
                      <Text style={styles.questionsCountText}>{questions.length}</Text>
                    </View>
                  </View>

                  {questions.map((question, index) => (
                    <CreateQuestionCard
                      key={`question-${index}-${question.text}`}
                      index={index}
                      onDelete={() => handleRemoveQuestion(index)}
                      onEdit={() => handleEditQuestion(index)}
                      question={question}
                    />
                  ))}
                </View>
              ) : null}
            </View>
          </ScrollView>

          <View style={[styles.launchWrap, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            <CreateActionButton
              disabled={isLaunching}
              icon={isLaunching ? <ActivityIndicator color="#ffffff" /> : undefined}
              label={isLaunching ? 'Создаём игру...' : '🚀 ЗАЖЕЧЬ ВЕЧЕРИНКУ!'}
              onPress={handleLaunchQuiz}
              tone="launch"
            />
          </View>
        </KeyboardAvoidingView>

        <CreateLibraryModal
          activeCategory={activeLibraryCategory}
          onChangeCategory={setActiveLibraryCategory}
          onClose={() => setLibraryModalVisible(false)}
          onImportQuestion={applyImportedQuestion}
          onToggleFavorite={handleToggleFavorite}
          questions={filteredLibraryQuestions}
          visible={libraryModalVisible}
        />
      </View>
    </SafeAreaView>
  );
}

function pickNextIdea(
  items: CreateLibraryQuestion[],
  currentIdea: CreateLibraryQuestion | null,
) {
  if (!items.length) {
    return null;
  }

  if (items.length === 1) {
    return items[0];
  }

  let nextItem = items[Math.floor(Math.random() * items.length)];

  while (currentIdea && nextItem.text === currentIdea.text) {
    nextItem = items[Math.floor(Math.random() * items.length)];
  }

  return nextItem;
}

function readSingleParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function isCreateLibraryQuestion(question: CreateQuizQuestion | CreateLibraryQuestion): question is CreateLibraryQuestion {
  return 'source' in question || 'sync_state' in question || 'public_id' in question;
}

function resolveReusableSourceQuestionPublicId(question: CreateQuizQuestion | CreateLibraryQuestion) {
  if (
    isCreateLibraryQuestion(question)
    && question.source === 'user'
    && question.sync_state === 'pending_add'
  ) {
    return null;
  }

  return question.source_question_public_id ?? null;
}

function buildDraftFromQuestion(question: CreateQuizQuestion | CreateLibraryQuestion): CreateQuestionDraft {
  if (question.type === 'text') {
    return {
      questionText: question.text,
      questionType: 'text',
      correctText: question.correct,
      options: createEmptyQuestionDraft().options,
      selectedCorrectIndex: 0,
      sourceQuestionPublicId: resolveReusableSourceQuestionPublicId(question),
    };
  }

  const options = question.options ?? createEmptyQuestionDraft().options;
  const selectedCorrectIndex = Math.max(0, options.findIndex((item) => item === question.correct));

  return {
    questionText: question.text,
    questionType: 'options',
    correctText: '',
    options,
    selectedCorrectIndex,
    sourceQuestionPublicId: resolveReusableSourceQuestionPublicId(question),
  };
}

const styles = StyleSheet.create({
  // SafeArea верхнего уровня для всего native-экрана.
  safeArea: {
    flex: 1,
    backgroundColor: createTheme.colors.screenTop,
  },

  // Корневой контейнер экрана.
  screen: {
    flex: 1,
  },

  // Контейнер ScrollView: нижний отступ нужен под фиксированную кнопку запуска.
  content: {
    flexGrow: 1,
    // Главная настройка внешних отступов страницы создания.
    // Чем меньше число, тем ближе все секции к краям экрана.
    paddingHorizontal: 4,
    paddingTop: 12,
  },

  // Главный контейнер контента create-экрана.
  // Белую сплошную подложку убираем, чтобы секции жили прямо на фоне,
  // а ширина была ближе к карточкам главного меню.
  mainCard: {
    width: '100%',
    maxWidth: 650,
    alignSelf: 'center',
    borderRadius: 0,
    // Небольшой внутренний отступ оставляем, но делаем экран шире и ближе к краям.
    paddingHorizontal: 4,
    paddingTop: 18,
    // Дополнительный запас внутри основного контента.
    // Уменьшаем его, чтобы снизу не было лишнего пустого воздуха.
    paddingBottom: 40,
    backgroundColor: 'transparent',
  },

  // Розовая секция с названием вечеринки.
  titleGroup: {
    marginBottom: 25,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: createTheme.colors.pink,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 198, 211, 0.36)',
    // Меньший внутренний padding делает сам input визуально шире.
    paddingHorizontal: 12,
    paddingVertical: 14,
  },

  // Фиолетовая зона создания нового вопроса.
  creationZone: {
    marginBottom: 20,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: 'rgba(108, 92, 231, 0.40)',
    borderRadius: 20,
    backgroundColor: 'rgba(108, 92, 231, 0.10)',
    // Секция вопроса тоже становится чуть плотнее, чтобы поля почти доходили до краёв.
    paddingHorizontal: 14,
    paddingVertical: 16,
  },

  // Строка заголовка секции и дополнительной кнопки справа.
  sectionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 10,
  },
  inlineActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },

  // Текст заголовка секции.
  sectionLabel: {
    flexShrink: 1,
    color: createTheme.colors.purple,
    fontSize: 14,
    fontWeight: '700',
    marginBottom: 10,
  },

  // Небольшая кнопка "Все идеи".
  inlineLibraryButton: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1.5,
    borderColor: 'rgba(108, 92, 231, 0.20)',
    borderRadius: createTheme.radius.pill,
    backgroundColor: 'transparent',
  },

  inlineLibraryButtonPressed: {
    backgroundColor: 'rgba(108, 92, 231, 0.12)',
    transform: [{ scale: 0.97 }],
  },

  inlineLibraryButtonText: {
    color: createTheme.colors.purple,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  inlineFavoriteButton: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 133, 161, 0.22)',
    borderRadius: createTheme.radius.pill,
    backgroundColor: 'rgba(255,255,255,0.58)',
  },
  inlineFavoriteButtonPressed: {
    backgroundColor: 'rgba(255, 133, 161, 0.12)',
    transform: [{ scale: 0.97 }],
  },
  inlineFavoriteButtonDisabled: {
    opacity: 0.6,
  },
  inlineFavoriteButtonText: {
    color: createTheme.colors.pinkDark,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },

  // Блок вариантов ответа под типом "Выбор".
  optionsZone: {
    marginBottom: 16,
  },

  // Кнопка очистки всех вариантов ответа.
  clearOptionsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderWidth: 1.5,
    borderColor: 'rgba(108, 92, 231, 0.20)',
    borderRadius: createTheme.radius.pill,
  },

  clearOptionsButtonPressed: {
    backgroundColor: 'rgba(231, 92, 194, 0.12)',
    transform: [{ scale: 0.97 }],
  },

  clearOptionsButtonText: {
    color: createTheme.colors.danger,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },

  // Пунктирная кнопка добавления нового варианта.
  addOptionButton: {
    minHeight: 46,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 8,
    marginBottom: -15,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: 'rgba(108, 92, 231, 0.25)',
    borderRadius: 12,
  },

  addOptionButtonPressed: {
    backgroundColor: 'rgba(108, 92, 231, 0.06)',
    transform: [{ scale: 0.985 }],
  },

  addOptionButtonText: {
    color: createTheme.colors.purple,
    fontSize: 13,
    fontWeight: '700',
  },

  // Список вопросов в нижней части страницы.
  listZone: {
    marginTop: 25,
  },

  // Шапка списка с заголовком и счётчиком.
  questionsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(108, 92, 231, 0.08)',
    paddingHorizontal: 14,
    paddingVertical: 10,
  },

  questionsTitle: {
    color: createTheme.colors.purple,
    fontSize: 15,
    fontWeight: '800',
  },

  questionsCount: {
    minWidth: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: createTheme.colors.purple,
    paddingHorizontal: 6,
  },

  questionsCountText: {
    color: createTheme.colors.white,
    fontSize: 12,
    fontWeight: '800',
  },

  // Фиксированный контейнер нижней кнопки запуска.
  launchWrap: {
    position: 'absolute',
    left: 20,
    right: 20,
    // Поднимаем кнопку чуть выше от нижней кромки экрана,
    // чтобы она была ближе к контенту и не выглядела "утонувшей" внизу.
    // Чем больше это число, тем выше кнопка поднимается от нижнего края экрана.
    bottom: 28,
  },
});
