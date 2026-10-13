import test from 'node:test';
import assert from 'node:assert/strict';
import {createGuideSpeech} from '../src/guideSpeech.js';
test('voice is silent until requested, prefers local English and supports cancellation',()=>{
  const calls=[],states=[];
  const host={SpeechSynthesisUtterance:class{constructor(text){this.text=text;}},speechSynthesis:{cancel:()=>calls.push('cancel'),getVoices:()=>[{lang:'en-GB',localService:true}],speak:u=>calls.push(u)}};
  const speech=createGuideSpeech(host,s=>states.push(s));
  assert.equal(calls.length,0);assert.equal(speech.speak('Hi, how can I help you?'),true);
  const u=calls.at(-1);assert.equal(u.voice.localService,true);u.onstart();assert.equal(states.at(-1),'speaking');
  speech.stop();u.onend();assert.equal(states.at(-1),'idle');
  speech.speak('Next reply');calls.at(-1).onerror();assert.equal(states.at(-1),'error');
});
test('unsupported browser preserves text navigation',()=>{
  const speech=createGuideSpeech({});assert.equal(speech.supported,false);assert.equal(speech.speak('Hi'),false);speech.stop();
});
