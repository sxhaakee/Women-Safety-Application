/**
 * i18n catalogs — en, hi, kn
 *
 * Typed JSON-compatible structure. A unit test asserts key parity
 * across all three languages.
 *
 * IMPORTANT: hi and kn strings are marked reviewed:false until the
 * owner confirms with a native speaker. The app must render a banner
 * "Translation not yet reviewed — may be inaccurate" if reviewed=false.
 */

export interface I18nCatalog {
  /** Deterrence screen attacker banner */
  deterrence: {
    alertSent: string;
    alertQueued: string;
    liveRecording: string;
  };
  /** Checklist status labels */
  checklist: {
    alertReceived: string;
    guardiansNotified: string;
    respondersNotified: string;
    policeNotified: string;
    policeAcknowledged: string;
    policeAcknowledgedWithEta: string; // {{eta}} placeholder
  };
  /** Voice announcement strings (keyed by state) */
  voice: {
    alertActive: string;
    alertAcknowledged: string;
    areYouSafe: string;
    countdownWarning: string; // {{seconds}} placeholder
  };
  /** Cancel dock */
  cancel: {
    iAmSafe: string;
    enterPin: string;
    wrongPin: string;
    pinLocked: string;
    tooManyAttempts: string;
  };
  /** Volunteer Rakshak */
  volunteer: {
    doNotConfront: string;
    goToLocation: string;
    call112: string;
  };
  /** Common */
  common: {
    loading: string;
    retry: string;
    error: string;
    offline: string;
    queued: string;
  };
}

export const en: I18nCatalog & { reviewed: true } = {
  reviewed: true,
  deterrence: {
    alertSent: 'ALERT SENT · POLICE & GUARDIANS NOTIFIED',
    alertQueued: 'ALERT QUEUED — RETRYING',
    liveRecording: 'LIVE LOCATION + VIDEO BEING RECORDED',
  },
  checklist: {
    alertReceived: 'Alert received by server',
    guardiansNotified: 'Guardians notified ({{n}})',
    respondersNotified: 'Nearby responders pinged ({{n}})',
    policeNotified: 'Police station notified ({{name}})',
    policeAcknowledged: 'Police acknowledged',
    policeAcknowledgedWithEta: 'Police acknowledged · ETA {{eta}} min',
  },
  voice: {
    alertActive: 'Police have been alerted. Neighbours are on the way. You are being recorded.',
    alertAcknowledged: 'Alert dispatched. Police and neighbours are on the way. You are being recorded.',
    areYouSafe: 'Are you safe?',
    countdownWarning: 'SOS fires in {{seconds}} seconds.',
  },
  cancel: {
    iAmSafe: "I'M SAFE",
    enterPin: 'Enter PIN to cancel',
    wrongPin: 'Wrong PIN',
    pinLocked: 'Too many attempts — locked for {{seconds}}s',
    tooManyAttempts: 'Too many wrong attempts',
  },
  volunteer: {
    doNotConfront: 'Do not confront the situation.',
    goToLocation: 'Go to the location, stay visible, and call 112.',
    call112: 'Call 112',
  },
  common: {
    loading: 'Loading...',
    retry: 'Retry',
    error: 'An error occurred',
    offline: 'Offline',
    queued: 'Queued',
  },
};

/**
 * Hindi translations.
 * reviewed:false — must be reviewed by a native Hindi speaker before production.
 */
export const hi: I18nCatalog & { reviewed: false } = {
  reviewed: false,
  deterrence: {
    alertSent: 'अलर्ट भेजा गया · पुलिस और अभिभावक सूचित',
    alertQueued: 'अलर्ट कतार में — पुनः प्रयास हो रहा है',
    liveRecording: 'लाइव स्थान + वीडियो रिकॉर्ड हो रहा है',
  },
  checklist: {
    alertReceived: 'सर्वर को अलर्ट मिला',
    guardiansNotified: 'अभिभावक सूचित ({{n}})',
    respondersNotified: 'निकटवर्ती सहायक सूचित ({{n}})',
    policeNotified: 'पुलिस स्टेशन सूचित ({{name}})',
    policeAcknowledged: 'पुलिस ने स्वीकृति दी',
    policeAcknowledgedWithEta: 'पुलिस ने स्वीकृति दी · ETA {{eta}} मिनट',
  },
  voice: {
    alertActive: 'पुलिस को सतर्क किया गया है। पड़ोसी आ रहे हैं। आप रिकॉर्ड हो रहे हैं।',
    alertAcknowledged: 'अलर्ट भेजा गया। पुलिस और पड़ोसी आ रहे हैं। आप रिकॉर्ड हो रहे हैं।',
    areYouSafe: 'क्या आप सुरक्षित हैं?',
    countdownWarning: '{{seconds}} सेकंड में SOS भेजा जाएगा।',
  },
  cancel: {
    iAmSafe: 'मैं सुरक्षित हूँ',
    enterPin: 'रद्द करने के लिए PIN दर्ज करें',
    wrongPin: 'गलत PIN',
    pinLocked: 'बहुत अधिक प्रयास — {{seconds}} सेकंड के लिए लॉक',
    tooManyAttempts: 'बहुत अधिक गलत प्रयास',
  },
  volunteer: {
    doNotConfront: 'स्थिति का सामना न करें।',
    goToLocation: 'स्थान पर जाएं, दृश्यमान रहें, और 112 पर कॉल करें।',
    call112: '112 पर कॉल करें',
  },
  common: {
    loading: 'लोड हो रहा है...',
    retry: 'पुनः प्रयास',
    error: 'एक त्रुटि हुई',
    offline: 'ऑफलाइन',
    queued: 'कतार में',
  },
};

/**
 * Kannada translations.
 * reviewed:false — must be reviewed by a native Kannada speaker before production.
 */
export const kn: I18nCatalog & { reviewed: false } = {
  reviewed: false,
  deterrence: {
    alertSent: 'ಎಚ್ಚರಿಕೆ ಕಳುಹಿಸಲಾಗಿದೆ · ಪೊಲೀಸ್ ಮತ್ತು ರಕ್ಷಕರಿಗೆ ತಿಳಿಸಲಾಗಿದೆ',
    alertQueued: 'ಎಚ್ಚರಿಕೆ ಸರತಿಯಲ್ಲಿದೆ — ಮರು ಪ್ರಯತ್ನಿಸಲಾಗುತ್ತಿದೆ',
    liveRecording: 'ನೇರ ಸ್ಥಳ + ವೀಡಿಯೊ ರೆಕಾರ್ಡ್ ಆಗುತ್ತಿದೆ',
  },
  checklist: {
    alertReceived: 'ಸರ್ವರ್ ಎಚ್ಚರಿಕೆ ಸ್ವೀಕರಿಸಿದೆ',
    guardiansNotified: 'ರಕ್ಷಕರಿಗೆ ತಿಳಿಸಲಾಗಿದೆ ({{n}})',
    respondersNotified: 'ಹತ್ತಿರದ ಸಹಾಯಕರಿಗೆ ತಿಳಿಸಲಾಗಿದೆ ({{n}})',
    policeNotified: 'ಪೊಲೀಸ್ ಠಾಣೆ ತಿಳಿಸಲಾಗಿದೆ ({{name}})',
    policeAcknowledged: 'ಪೊಲೀಸ್ ದೃಢಪಡಿಸಿದ್ದಾರೆ',
    policeAcknowledgedWithEta: 'ಪೊಲೀಸ್ ದೃಢಪಡಿಸಿದ್ದಾರೆ · ETA {{eta}} ನಿಮಿಷ',
  },
  voice: {
    alertActive: 'ಪೊಲೀಸರನ್ನು ಎಚ್ಚರಿಸಲಾಗಿದೆ. ನೆರೆಹೊರೆಯವರು ಬರುತ್ತಿದ್ದಾರೆ. ನೀವು ರೆಕಾರ್ಡ್ ಆಗುತ್ತಿದ್ದೀರಿ.',
    alertAcknowledged: 'ಎಚ್ಚರಿಕೆ ಕಳುಹಿಸಲಾಗಿದೆ. ಪೊಲೀಸ್ ಮತ್ತು ನೆರೆಹೊರೆಯವರು ಬರುತ್ತಿದ್ದಾರೆ. ನೀವು ರೆಕಾರ್ಡ್ ಆಗುತ್ತಿದ್ದೀರಿ.',
    areYouSafe: 'ನೀವು ಸುರಕ್ಷಿತವಾಗಿದ್ದೀರಾ?',
    countdownWarning: '{{seconds}} ಸೆಕೆಂಡ್‌ಗಳಲ್ಲಿ SOS ಕಳುಹಿಸಲಾಗುತ್ತದೆ.',
  },
  cancel: {
    iAmSafe: 'ನಾನು ಸುರಕ್ಷಿತ',
    enterPin: 'ರದ್ದು ಮಾಡಲು PIN ನಮೂದಿಸಿ',
    wrongPin: 'ತಪ್ಪು PIN',
    pinLocked: 'ಹೆಚ್ಚು ಪ್ರಯತ್ನಗಳು — {{seconds}} ಸೆಕೆಂಡ್‌ಗಳ ಕಾಲ ಲಾಕ್',
    tooManyAttempts: 'ಹೆಚ್ಚಿನ ತಪ್ಪು ಪ್ರಯತ್ನಗಳು',
  },
  volunteer: {
    doNotConfront: 'ಪರಿಸ್ಥಿತಿಯನ್ನು ಎದುರಿಸಬೇಡಿ.',
    goToLocation: 'ಸ್ಥಳಕ್ಕೆ ಹೋಗಿ, ದೃಶ್ಯಮಾನವಾಗಿರಿ, ಮತ್ತು 112 ಕರೆ ಮಾಡಿ.',
    call112: '112 ಕರೆ ಮಾಡಿ',
  },
  common: {
    loading: 'ಲೋಡ್ ಆಗುತ್ತಿದೆ...',
    retry: 'ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ',
    error: 'ದೋಷ ಸಂಭವಿಸಿದೆ',
    offline: 'ಆಫ್‌ಲೈನ್',
    queued: 'ಸರತಿಯಲ್ಲಿ',
  },
};

export type SupportedLang = 'en' | 'hi' | 'kn';

export const CATALOGS: Record<SupportedLang, I18nCatalog> = { en, hi, kn };
