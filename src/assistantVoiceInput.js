export function createAssistantVoiceInput(host, onText, onState = () => {}) {
  const Recognition = host?.SpeechRecognition || host?.webkitSpeechRecognition;
  let recognition;
  // Do not silently send microphone audio to a browser vendor's cloud service.
  if (Recognition) {
    try { recognition = new Recognition(); } catch { /* Keep text input available. */ }
  }
  const supported = Boolean(recognition && 'processLocally' in recognition);
  if (supported) {
    recognition.processLocally = true;
    recognition.lang = 'en-GB'; recognition.continuous = false; recognition.interimResults = false;
    recognition.onresult = event => { const text = event.results?.[0]?.[0]?.transcript; if (text) onText(text); };
    recognition.onstart = () => onState('listening');
    recognition.onend = () => onState('idle');
    recognition.onerror = event => onState(event.error === 'not-allowed' ? 'denied' : 'unavailable');
  }
  return {
    supported,
    start() { if (!supported) return false; try { recognition.start(); return true; } catch { onState('unavailable'); return false; } },
    stop() { if (supported) recognition.abort(); onState('idle'); },
  };
}
