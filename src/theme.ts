// SheSafe Design System — Extended for 3-role demo
export const Colors = {
  // Core brand
  primary: '#C0392B',
  primaryDark: '#922B21',
  primaryLight: '#E74C3C',

  // Role-specific
  victim: '#C0392B',
  victimLight: '#E74C3C',
  guardian: '#8B5CF6',
  guardianLight: '#A78BFA',
  guardianDark: '#6D28D9',
  police: '#1D4ED8',
  policeLight: '#3B82F6',
  policeDark: '#1E3A8A',

  // Status
  safe: '#10B981',
  safeDark: '#059669',
  warning: '#F59E0B',
  warningLight: '#FCD34D',
  danger: '#EF4444',
  dangerDark: '#DC2626',

  // Backgrounds (dark)
  background: '#080810',
  surface: '#12121E',
  surfaceLight: '#1C1C2E',
  card: '#16162A',
  cardLight: '#1E1E38',

  // Text
  text: '#F8F8FF',
  textSecondary: '#9D9DB5',
  textMuted: '#5A5A7A',

  // Accents
  border: '#2A2A4A',
  borderLight: '#3A3A5A',
  overlay: 'rgba(0,0,0,0.8)',
  glass: 'rgba(255,255,255,0.05)',
  glassBorder: 'rgba(255,255,255,0.1)',

  white: '#FFFFFF',
  black: '#000000',
};

export const Gradients = {
  victim: ['#1A0010', '#0D0D0D', '#0D0D0D'],
  victimAlert: ['#3D0000', '#1A0000', '#0D0000'],
  guardian: ['#0D0D2E', '#0A0A1A', '#080810'],
  police: ['#0A0A2E', '#080820', '#080810'],
  card: ['rgba(255,255,255,0.08)', 'rgba(255,255,255,0.02)'],
};

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  xxxl: 64,
};

export const FontSizes = {
  xs: 11,
  sm: 13,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
  giant: 48,
  mega: 72,
};

export const BorderRadius = {
  xs: 6,
  sm: 10,
  md: 14,
  lg: 20,
  xl: 28,
  xxl: 40,
  full: 999,
};

export function getRiskColor(score: number): string {
  if (score < 30) return Colors.safe;
  if (score < 60) return Colors.warningLight;
  if (score < 80) return Colors.warning;
  return Colors.danger;
}

export function getRiskLevel(score: number): string {
  if (score < 30) return "You're Safe";
  if (score < 60) return 'Stay Alert';
  if (score < 80) return 'High Risk';
  return 'DANGER';
}

export function getRiskLevelKey(score: number): 'safe' | 'watchful' | 'alert' | 'emergency' {
  if (score < 30) return 'safe';
  if (score < 60) return 'watchful';
  if (score < 80) return 'alert';
  return 'emergency';
}

export function getRoleColors(role: string) {
  switch (role) {
    case 'victim': return { primary: Colors.victim, light: Colors.victimLight, gradient: Gradients.victim };
    case 'guardian': return { primary: Colors.guardian, light: Colors.guardianLight, gradient: Gradients.guardian };
    case 'police': return { primary: Colors.police, light: Colors.policeLight, gradient: Gradients.police };
    default: return { primary: Colors.primary, light: Colors.primaryLight, gradient: Gradients.victim };
  }
}
