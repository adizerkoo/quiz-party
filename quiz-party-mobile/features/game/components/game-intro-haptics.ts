import * as Haptics from 'expo-haptics';

type IntroHapticEvent = {
  delay: number;
  type: 'heavy' | 'medium' | 'success' | 'warning';
};

function buildImpactAccent(delay: number, primary: IntroHapticEvent['type'], secondary?: IntroHapticEvent['type'], gap = 80) {
  // Один визуальный "удар" в интро ощущается лучше как короткая пачка импульсов:
  // основной толчок приходит первым, а вторичный быстро усиливает ощущение мощи.
  const events: IntroHapticEvent[] = [{ delay, type: primary }];

  if (secondary) {
    events.push({ delay: delay + gap, type: secondary });
  }

  return events;
}

function triggerIntroHaptic(type: IntroHapticEvent['type']) {
  // Все вызовы haptics прячем в одну функцию, чтобы overlay-компоненты не знали
  // детали платформенного API и сила импульсов настраивалась централизованно.
  if (type === 'heavy') {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    return;
  }

  if (type === 'medium') {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    return;
  }

  if (type === 'warning') {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    return;
  }

  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
}

function getRepresentativeSlamMoments(playerCount: number, firstSlamDelay: number, delayPerPlayer: number) {
  // Если игроков много, не дёргаем вибрацию на каждую карточку подряд:
  // берём первые, средний и последний "slam", чтобы сохранить мощное ощущение
  // без перегруза вибромотора на длинных интро.
  const allMoments = Array.from({ length: playerCount }, (_, index) => firstSlamDelay + index * delayPerPlayer + 360);

  if (allMoments.length <= 3) {
    return allMoments;
  }

  const middleIndex = Math.floor(allMoments.length / 2);
  return [allMoments[0], allMoments[middleIndex], allMoments[allMoments.length - 1]];
}

export function buildStartIntroHapticEvents(playerCount: number, firstSlamDelay: number, delayPerPlayer: number, goDelay: number) {
  // Стартовое интро делаем ощутимее, чем обычный tap-feedback:
  // сначала тревожная вспышка, затем сильные slam-удары игроков и победный импульс на "Поехали!".
  const slamMoments = getRepresentativeSlamMoments(playerCount, firstSlamDelay, delayPerPlayer);

  return [
    ...buildImpactAccent(180, 'warning', 'medium', 110),
    ...slamMoments.flatMap((delay) => buildImpactAccent(delay, 'heavy', 'medium', 78)),
    ...buildImpactAccent(goDelay + 70, 'success', 'medium', 95),
  ];
}

export function buildWinnerIntroHapticEvents() {
  // Финальное интро делаем ещё мощнее старта:
  // молнии открывают сцену, затем идёт двойной slam победителя и усиленный финиш на раскрытии счёта.
  return [
    ...buildImpactAccent(260, 'warning', 'medium', 120),
    ...buildImpactAccent(1040, 'heavy', 'heavy', 120),
    ...buildImpactAccent(1800, 'heavy', 'medium', 110),
    ...buildImpactAccent(2480, 'success', 'medium', 95),
    ...buildImpactAccent(3400, 'success', 'medium', 95),
  ];
}

export function scheduleIntroHaptics(events: IntroHapticEvent[]) {
  // Возвращаем таймеры наружу, чтобы overlay мог гарантированно очистить их при unmount
  // и не оставлять отложенные вибро-импульсы после закрытия интро.
  return events.map((event) => setTimeout(() => {
    triggerIntroHaptic(event.type);
  }, event.delay));
}
