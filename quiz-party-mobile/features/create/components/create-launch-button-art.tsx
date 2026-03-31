import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

const PARTY_ART_SVG = encodeURIComponent(`
<svg width="52" height="52" viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="rocket-bg" x1="9" y1="8" x2="43" y2="44" gradientUnits="userSpaceOnUse">
      <stop stop-color="#FFD66D"/>
      <stop offset="0.52" stop-color="#FF8FB1"/>
      <stop offset="1" stop-color="#6C5CE7"/>
    </linearGradient>
    <linearGradient id="rocket-body" x1="20" y1="13" x2="33" y2="35" gradientUnits="userSpaceOnUse">
      <stop stop-color="#FFFFFF"/>
      <stop offset="1" stop-color="#FFE7F1"/>
    </linearGradient>
    <linearGradient id="rocket-fire" x1="26" y1="34" x2="26" y2="43" gradientUnits="userSpaceOnUse">
      <stop stop-color="#FFF5BF"/>
      <stop offset="0.55" stop-color="#FFB347"/>
      <stop offset="1" stop-color="#FF6B6B"/>
    </linearGradient>
  </defs>

  <circle cx="26" cy="26" r="22" fill="url(#rocket-bg)"/>
  <circle cx="26" cy="26" r="16" fill="#FFFFFF" fill-opacity="0.14"/>

  <path d="M26 11C30.9 14.4 33.4 20.2 32.7 26.1L29.7 33.2H22.3L19.3 26.1C18.6 20.2 21.1 14.4 26 11Z" fill="url(#rocket-body)"/>
  <path d="M22.9 31.5L19 35.4C18.2 36.2 16.9 36 16.4 35L15.1 32.3L20.7 28.4L22.9 31.5Z" fill="#FF8FB1"/>
  <path d="M29.1 31.5L33 35.4C33.8 36.2 35.1 36 35.6 35L36.9 32.3L31.3 28.4L29.1 31.5Z" fill="#6C5CE7"/>
  <circle cx="26" cy="22.8" r="3.4" fill="#6C5CE7"/>
  <circle cx="26" cy="22.8" r="1.6" fill="#BEEBFF"/>
  <path d="M22.7 34.2C23.9 36.8 25.3 39 26 41C26.7 39 28.1 36.8 29.3 34.2H22.7Z" fill="url(#rocket-fire)"/>
  <path d="M24.6 34.6C25.2 36.1 25.7 37.3 26 38.4C26.3 37.3 26.8 36.1 27.4 34.6H24.6Z" fill="#FFF5BF"/>

  <path d="M12 31.8C14.5 30.8 16.7 28.9 18.1 26.5" stroke="#FFFFFF" stroke-width="2.2" stroke-linecap="round"/>
  <path d="M34.5 16.2L35.5 18.6L37.9 19.6L35.5 20.6L34.5 23L33.5 20.6L31.1 19.6L33.5 18.6L34.5 16.2Z" fill="#FFFFFF" fill-opacity="0.92"/>
  <circle cx="14.1" cy="36.1" r="2.3" fill="#FFD66D"/>
  <circle cx="38.4" cy="29.2" r="1.9" fill="#FFFFFF" fill-opacity="0.85"/>
</svg>
`);

const PARTY_ART_URI = `data:image/svg+xml;utf8,${PARTY_ART_SVG}`;

// Компактная SVG-иллюстрация для launch CTA.
export function CreateLaunchButtonArt() {
  return (
    <View style={styles.frame}>
      <Image contentFit="contain" source={{ uri: PARTY_ART_URI }} style={styles.image} />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },

  image: {
    width: 34,
    height: 34,
  },
});
