export function createGuideSpeech(host,onState=()=>{}) {
  const supported=Boolean(host?.speechSynthesis&&host?.SpeechSynthesisUtterance);
  let generation=0;
  const stop=()=>{generation++;if(supported)host.speechSynthesis.cancel();onState('idle');};
  const speak=text=>{
    if(!supported||!String(text||'').trim())return false;
    stop();const current=generation;
    const utterance=new host.SpeechSynthesisUtterance(String(text));
    utterance.lang='en-GB';utterance.rate=.95;
    const voices=host.speechSynthesis.getVoices();
    const voice=voices.find(v=>v.localService&&/^en\b/i.test(v.lang))||voices.find(v=>/^en\b/i.test(v.lang));
    if(voice)utterance.voice=voice;
    utterance.onstart=()=>{if(current===generation)onState('speaking');};
    utterance.onend=()=>{if(current===generation)onState('idle');};
    utterance.onerror=()=>{if(current===generation)onState('error');};
    try{host.speechSynthesis.speak(utterance);return true;}catch{onState('error');return false;}
  };
  return {supported,speak,stop};
}
