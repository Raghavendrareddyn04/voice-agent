import React, { useEffect, useRef, useState } from "react";
import { Mic, StopCircle } from "lucide-react";
import "./App.css";

const API_URL = "https://unavengeable-vinously-elene.ngrok-free.dev/chat";

const STATUS = {
  IDLE: "idle",
  LISTENING: "listening",
  THINKING: "thinking",
  SPEAKING: "speaking",
};

function Button({ className = "", ...props }) {
  const classes = ["btn", className].filter(Boolean).join(" ");
  return <button className={classes} {...props} />;
}

function App() {
  const [status, setStatus] = useState(STATUS.IDLE);
  const [conversation, setConversation] = useState([]);
  const [error, setError] = useState("");

  const recognitionRef = useRef(null);
  const audioRef = useRef(null);
  const requestIdRef = useRef(0);

  const isListening = status === STATUS.LISTENING;
  const isThinking = status === STATUS.THINKING;
  const isSpeaking = status === STATUS.SPEAKING;

  const createRecognition = () => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setError("Your browser does not support SpeechRecognition.");
      return null;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    recognition.onresult = async (event) => {
      const text =
        event.results[event.results.length - 1][0].transcript.trim();
      if (!text) return;

      // New AI turn; invalidate any previous pending responses
      const myRequestId = ++requestIdRef.current;

      setConversation((prev) => [
        ...prev,
        { id: Date.now() + "-user", role: "user", text },
      ]);

      setStatus(STATUS.THINKING);
      setError("");

      try {
        const response = await fetch(API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ text }),
        });

        if (!response.ok) {
          throw new Error(`Server error: ${response.status}`);
        }

        // If a newer request started while we were waiting, ignore this response
        if (requestIdRef.current !== myRequestId) {
          return;
        }

        const audioBlob = await response.blob();
        const url = URL.createObjectURL(audioBlob);
        const audio = new Audio(url);
        audioRef.current = audio;

        setConversation((prev) => [
          ...prev,
          {
            id: Date.now() + "-ai",
            role: "assistant",
            text: "AI responded with a voice reply.",
          },
        ]);

        setStatus(STATUS.SPEAKING);

        audio.onended = () => {
          setStatus(STATUS.IDLE);
          URL.revokeObjectURL(url);
        };

        audio.play().catch((e) => {
          console.error(e);
          setError("Could not play audio.");
          setStatus(STATUS.IDLE);
        });
      } catch (e) {
        console.error(e);
        setError("Something went wrong talking to the server.");
        setStatus(STATUS.IDLE);
      }
    };

    recognition.onerror = (event) => {
      console.error("SpeechRecognition error:", event.error);
      if (status !== STATUS.SPEAKING) {
        setStatus(STATUS.IDLE);
      }
    };

    recognition.onend = () => {
      if (status === STATUS.LISTENING) {
        setStatus(STATUS.IDLE);
      }
    };

    return recognition;
  };

  const startListening = () => {
    if (isListening) return;

    // Interrupt any previous response (speech or pending)
    requestIdRef.current += 1;

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }

    const recognition =
      recognitionRef.current || (recognitionRef.current = createRecognition());
    if (!recognition) return;

    setError("");
    setStatus(STATUS.LISTENING);
    try {
      recognition.start();
    } catch (e) {
      console.error(e);
    }
  };

  const stopAll = () => {
    requestIdRef.current += 1;

    if (recognitionRef.current) {
      recognitionRef.current.onresult = null;
      recognitionRef.current.stop();
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    setStatus(STATUS.IDLE);
  };

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, []);

  const statusLabel = {
    [STATUS.IDLE]: "Idle",
    [STATUS.LISTENING]: "Listening…",
    [STATUS.THINKING]: "Thinking…",
    [STATUS.SPEAKING]: "Speaking…",
  }[status];

  return (
    <div className="app">
      <div className="shell">
        <header className="header">
          <h1>Voice Assistant</h1>
        </header>

        <main className="main main-split">
          <section className="voice-pane">
            <div
              className={[
                "mic-orb",
                isListening && "mic-orb-listening",
                isThinking && "mic-orb-thinking",
                isSpeaking && "mic-orb-speaking",
              ]
                .filter(Boolean)
                .join(" ")}
              onClick={startListening}
              role="button"
              aria-label="Start talking"
            >
              <div className="mic-inner">
                {isListening || isThinking || isSpeaking ? (
                  <Mic size={34} />
                ) : (
                  <Mic size={28} />
                )}
              </div>
            </div>

            <div className="visualizer">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className={[
                    "bar",
                    isListening && "bar-active",
                    isSpeaking && "bar-speaking",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  style={{ animationDelay: `${i * 0.08}s` }}
                />
              ))}
            </div>

            <div className="status-row">
              <div className="status-text">{statusLabel}</div>
              <Button
                className="btn-ghost"
                onClick={stopAll}
                disabled={status === STATUS.IDLE}
              >
                <StopCircle size={18} />
                <span>Stop</span>
              </Button>
            </div>

            {error && <div className="error">{error}</div>}
          </section>

          <section className="chat-pane">
            <div className="chat-container">
              {conversation.length === 0 && (
                <div className="chat-placeholder">
                  Start speaking to begin a conversation.
                </div>
              )}
              {conversation.map((msg) => (
                <div
                  key={msg.id}
                  className={`chat-row chat-row-${msg.role}`}
                >
                  <div className={`chat-bubble chat-bubble-${msg.role}`}>
                    <div className="chat-role">
                      {msg.role === "user" ? "You" : "AI"}
                    </div>
                    <div className="chat-text">{msg.text}</div>
                  </div>
                </div>
              ))}
              {isThinking && (
                <div className="chat-row chat-row-assistant">
                  <div className="chat-bubble chat-bubble-assistant thinking-bubble">
                    <div className="chat-role">AI</div>
                    <div className="thinking-dots">
                      <span />
                      <span />
                      <span />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

export default App;
