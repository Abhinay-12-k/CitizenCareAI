import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageSquare, X, Send, Bot, Volume2, VolumeX, Languages } from 'lucide-react';
import axios from 'axios';
import API_BASE from '../config/api';

// ─── Language Config ────────────────────────────────────────────────────────
const LANG_CONFIG = {
  en: {
    label: 'EN',
    fullLabel: 'English',
    flag: '🇬🇧',
    greeting: "Hello! I'm the Smart Grievance AI Assistant. How can I help you today?",
    placeholder: 'Ask me anything...',
    switchTip: 'Switch to Telugu',
  },
  te: {
    label: 'తె',
    fullLabel: 'తెలుగు',
    flag: '🇮🇳',
    greeting: 'నమస్కారం! నేను స్మార్ట్ గ్రీవెన్స్ AI అసిస్టెంట్. మీకు ఏవిధంగా సహాయం చేయగలను?',
    placeholder: 'మీ ప్రశ్న అడగండి...',
    switchTip: 'Switch to English',
  },
};

// ─── Helper: play audio blob ─────────────────────────────────────────────────
let currentAudio = null;

const playAudioBlob = (blob) => {
  if (currentAudio) {
    currentAudio.pause();
    currentAudio = null;
  }
  const url = URL.createObjectURL(blob);
  currentAudio = new Audio(url);
  currentAudio.play();
  currentAudio.onended = () => URL.revokeObjectURL(url);
};

// ─── Component ───────────────────────────────────────────────────────────────
const AIChatbot = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [language, setLanguage] = useState('en');
  const [messages, setMessages] = useState([
    { text: LANG_CONFIG.en.greeting, isBot: true },
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [speakingIndex, setSpeakingIndex] = useState(null); // index of message being spoken
  const [ttsLoading, setTtsLoading] = useState(null);
  const messagesEndRef = useRef(null);

  const lang = LANG_CONFIG[language];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isOpen]);

  // When language changes, replace greeting
  const handleToggleLanguage = () => {
    const next = language === 'en' ? 'te' : 'en';
    setLanguage(next);
    setMessages([{ text: LANG_CONFIG[next].greeting, isBot: true }]);
    setInputMessage('');
    if (currentAudio) { currentAudio.pause(); currentAudio = null; }
    setSpeakingIndex(null);
  };

  // ── Send message ────────────────────────────────────────────────────────────
  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!inputMessage.trim()) return;

    const userMsg = inputMessage;
    const newMsgs = [...messages, { text: userMsg, isBot: false }];
    setMessages(newMsgs);
    setInputMessage('');

    setMessages([...newMsgs, { text: '...', isBot: true, isTyping: true }]);

    try {
      const sanitizedHistory = messages
        .filter((m) => !m.isTyping && m.text !== '...')
        .map((m) => ({ role: m.isBot ? 'assistant' : 'user', content: m.text }));

      const userInfo = JSON.parse(sessionStorage.getItem('userInfo'));
      const config = {
        headers: {
          'Content-Type': 'application/json',
          ...(userInfo?.token ? { Authorization: `Bearer ${userInfo.token}` } : {}),
        },
      };

      const { data } = await axios.post(
        `${API_BASE}/api/chat`,
        { message: userMsg, history: sanitizedHistory, language },
        config
      );

      setMessages((prev) => {
        const filtered = prev.filter((m) => !m.isTyping);
        const botMsg = { text: data.reply, isBot: true };
        // Auto-speak the bot reply in Telugu mode
        if (language === 'te') {
          const idx = filtered.length;
          speakText(data.reply, filtered.length, [...filtered, botMsg]);
        }
        return [...filtered, botMsg];
      });
    } catch (err) {
      console.error(err);
      setMessages((prev) => {
        const filtered = prev.filter((m) => !m.isTyping);
        return [
          ...filtered,
          { text: 'Error connecting to AI Assistant Server.', isBot: true },
        ];
      });
    }
  };

  // ── ElevenLabs TTS ──────────────────────────────────────────────────────────
  const speakText = async (text, index, currentMessages) => {
    if (ttsLoading !== null) return; // debounce
    setSpeakingIndex(index);
    setTtsLoading(index);

    try {
      const userInfo = JSON.parse(sessionStorage.getItem('userInfo'));
      const response = await axios.post(
        `${API_BASE}/api/tts`,
        { text, language },
        {
          headers: {
            'Content-Type': 'application/json',
            Accept: 'audio/mpeg',
            ...(userInfo?.token ? { Authorization: `Bearer ${userInfo.token}` } : {}),
          },
          responseType: 'blob',
        }
      );
      playAudioBlob(response.data);
    } catch (err) {
      console.error('TTS error:', err);
    } finally {
      setTtsLoading(null);
      setSpeakingIndex(null);
    }
  };

  const handleSpeak = (text, index) => {
    if (speakingIndex === index && currentAudio) {
      // Toggle off
      currentAudio.pause();
      currentAudio = null;
      setSpeakingIndex(null);
      return;
    }
    speakText(text, index, messages);
  };

  // ────────────────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Floating Trigger Button */}
      <button
        id="ai-chatbot-trigger"
        onClick={() => setIsOpen(true)}
        className="fixed bottom-6 right-6 p-4 bg-[#F8FBF8] text-[#0F1C12] rounded-full shadow-2xl shadow-slate-900/40 hover:scale-105 active:scale-95 transition-all z-40 group flex items-center justify-center border-4 border-white"
        title="Open AI Assistant"
      >
        <Bot size={28} className="group-hover:text-primary-400 transition-colors" />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-24 right-6 w-[380px] h-[540px] bg-white rounded-[2rem] shadow-4xl border border-slate-100 flex flex-col z-50 overflow-hidden"
          >
            {/* ── Header ─────────────────────────────────────────────────── */}
            <div className="bg-[#F8FBF8] text-[#0F1C12] p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/10 rounded-2xl flex items-center justify-center">
                  <Bot size={20} className="text-primary-400" />
                </div>
                <div className="flex flex-col">
                  <span className="font-black tracking-tight text-sm uppercase">
                    AI Assistant
                  </span>
                  <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
                    Online &nbsp;·&nbsp; {lang.fullLabel}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {/* Language Toggle */}
                <button
                  id="ai-language-toggle"
                  onClick={handleToggleLanguage}
                  title={lang.switchTip}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white border border-slate-200 hover:border-primary-300 hover:bg-primary-50 transition-all text-[11px] font-bold text-slate-600 shadow-sm"
                >
                  <Languages size={13} />
                  <span>{lang.flag}</span>
                  <span>{lang.label}</span>
                </button>

                {/* Close */}
                <button
                  id="ai-chatbot-close"
                  onClick={() => setIsOpen(false)}
                  className="p-2 bg-white/5 hover:bg-rose-500 hover:text-white rounded-xl transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Telugu Banner */}
            <AnimatePresence>
              {language === 'te' && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="bg-gradient-to-r from-orange-50 to-amber-50 border-b border-orange-100 px-4 py-2 flex items-center gap-2"
                >
                  <Volume2 size={12} className="text-orange-500 shrink-0" />
                  <span className="text-[11px] text-orange-700 font-semibold">
                    తెలుగు మోడ్ సక్రియంగా ఉంది — స్వయంచాలకంగా మాట్లాడతారు 🎙️
                  </span>
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── Messages ───────────────────────────────────────────────── */}
            <div className="flex-1 p-5 overflow-y-auto flex flex-col gap-4 bg-white">
              {messages.map((msg, i) => (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  key={i}
                  className={`flex flex-col gap-1 max-w-[87%] ${msg.isBot ? 'self-start' : 'self-end'}`}
                >
                  <div
                    className={`p-4 rounded-2xl text-[13px] font-medium leading-relaxed
                      ${msg.isBot
                        ? 'bg-white border border-slate-100 text-slate-700 shadow-sm rounded-tl-sm'
                        : 'bg-primary-600 text-[#0F1C12] rounded-tr-sm shadow-md'
                      }`}
                  >
                    {msg.text.split('\n').map((line, j) => (
                      <span key={j} className={line.startsWith('- **') ? 'block mt-1' : ''}>
                        {line}
                      </span>
                    ))}
                  </div>

                  {/* Speak button — only on bot messages, not typing indicator */}
                  {msg.isBot && !msg.isTyping && (
                    <button
                      id={`speak-btn-${i}`}
                      onClick={() => handleSpeak(msg.text, i)}
                      title={speakingIndex === i ? 'Stop speaking' : 'Speak this message'}
                      disabled={ttsLoading !== null && ttsLoading !== i}
                      className={`self-start flex items-center gap-1 mt-0.5 px-2 py-1 rounded-lg text-[10px] font-bold transition-all
                        ${speakingIndex === i
                          ? 'bg-orange-100 text-orange-600 border border-orange-200'
                          : 'bg-slate-50 text-slate-400 border border-slate-100 hover:text-indigo-600 hover:bg-indigo-50 hover:border-indigo-200'
                        }
                        disabled:opacity-40 disabled:cursor-not-allowed`}
                    >
                      {ttsLoading === i ? (
                        <span className="flex items-center gap-1">
                          <svg className="animate-spin w-3 h-3" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                          </svg>
                          Syncing...
                        </span>
                      ) : speakingIndex === i ? (
                        <><VolumeX size={10} /> Stop</>
                      ) : (
                        <><Volume2 size={10} /> {language === 'te' ? 'వినండి' : 'Speak'}</>
                      )}
                    </button>
                  )}
                </motion.div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* ── Input Form ─────────────────────────────────────────────── */}
            <form
              onSubmit={handleSendMessage}
              className="p-4 bg-white border-t border-slate-100 flex gap-2 items-center"
            >
              <input
                id="ai-chat-input"
                type="text"
                value={inputMessage}
                onChange={(e) => setInputMessage(e.target.value)}
                placeholder={lang.placeholder}
                className="flex-1 bg-slate-50 px-4 py-3 rounded-2xl text-[13px] font-medium outline-none focus:ring-2 focus:ring-primary-100 focus:bg-white transition-all border border-slate-100"
              />
              <button
                id="ai-chat-send"
                type="submit"
                disabled={!inputMessage.trim()}
                className="w-12 h-12 bg-[#F8FBF8] text-[#0F1C12] rounded-2xl flex items-center justify-center hover:bg-primary-600 active:scale-95 transition-all disabled:opacity-50 disabled:bg-slate-300 shadow-xl shadow-slate-900/10"
              >
                <Send size={16} className="-ml-0.5" />
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};

export default AIChatbot;
