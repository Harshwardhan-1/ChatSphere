import { useEffect, useRef, useState, type ReactNode } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { env } from "../../configs/env.config";
import InteractiveRobot from "../../components/HomePageAnimation/animation";
import ThemeToggle from "../../components/ThemeToggle/ThemeToggle";
import "./HomePage.css";

const LOGO_URL =
  "https://upload.wikimedia.org/wikipedia/commons/6/6b/WhatsApp.svg";

const FEATURES: { icon: ReactNode; title: string; text: string }[] = [
  {
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.5 8.5 0 0 1-3.8-.9L3 21l1.9-5.2A8.4 8.4 0 0 1 3 11.5 8.5 8.5 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5z" />
      </svg>
    ),
    title: "Real-time messages",
    text: "Send and receive instantly, no refresh needed.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M18 6 7 17l-5-5" />
        <path d="m22 10-7.5 7.5L13 16" />
      </svg>
    ),
    title: "Delivery and read ticks",
    text: "See when your message is sent, delivered and read.",
  },
  {
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="m21.4 11.6-9.2 9.2a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 0 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.8-2.8l8.5-8.5" />
      </svg>
    ),
    title: "Photos and files",
    text: "Share what matters right inside the chat.",
  },
];

type PreviewMessage = {
  id: number;
  side: "in" | "out";
  text: string;
  time: string;
  at: number;
};

const SCRIPT: PreviewMessage[] = [
  { id: 1, side: "in", text: "Are we still on for tonight?", time: "7:42 PM", at: 800 },
  { id: 2, side: "out", text: "Yes! Bringing the photos.", time: "7:42 PM", at: 2000 },
  { id: 3, side: "in", text: "Perfect, see you at 8.", time: "7:43 PM", at: 5000 },
];
const READ_AT = 3400;
const TYPING_AT = 3800;
const LOOP_AT = 9000; // last message ke baad kitni der mein dobara shuru ho

const Ticks = ({ read }: { read: boolean }) => (
  <svg
    viewBox="0 0 24 24"
    className={`wp-ticks${read ? " wp-ticks--read" : ""}`}
    aria-hidden="true"
  >
    <path d="M18 6 7 17l-5-5" />
    <path d="m22 10-7.5 7.5L13 16" />
  </svg>
);

const ChatPreview = () => {
  const [shown, setShown] = useState(0);
  const [typing, setTyping] = useState(false);
  const [read, setRead] = useState(false);
  const [run, setRun] = useState(0);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const clearAll = () => {
      timers.current.forEach((id) => window.clearTimeout(id));
      timers.current = [];
    };
    const at = (ms: number, fn: () => void) => {
      timers.current.push(window.setTimeout(fn, ms));
    };

    clearAll();
    setShown(0);
    setTyping(false);
    setRead(false);

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    if (reduceMotion) {
      setShown(SCRIPT.length);
      setRead(true);
      return clearAll;
    }

    SCRIPT.forEach((msg, i) =>
      at(msg.at, () => {
        setShown(i + 1);
        if (msg.id === 3) setTyping(false);
      })
    );
    at(READ_AT, () => setRead(true));
    at(TYPING_AT, () => setTyping(true));
    at(LOOP_AT, () => setRun((n) => n + 1)); // loop: sab reset hoke dobara chalega

    return clearAll;
  }, [run]);

  return (
    <button
      type="button"
      className="wp-home-chat"
      onClick={() => setRun((n) => n + 1)}
      aria-label="Replay chat preview"
    >
      <span className="wp-home-chat__header">
        <span className="wp-avatar wp-avatar--sm wp-home-chat__avatar">R</span>
        <span className="wp-home-chat__who">
          <span className="wp-home-chat__name">Riya</span>
          <span className="wp-home-chat__status">
            {typing ? "typing…" : "online"}
          </span>
        </span>
      </span>

      <span className="wp-home-chat__body">
        {SCRIPT.slice(0, shown).map((msg) => (
          <span
            key={msg.id}
            className={`wp-bubble wp-bubble--${msg.side} wp-home-chat__msg`}
          >
            <span>{msg.text}</span>
            <span className="wp-bubble__meta">
              {msg.time}
              {msg.side === "out" && <Ticks read={read} />}
            </span>
          </span>
        ))}
        {typing && (
          <span
            className="wp-bubble wp-bubble--in wp-typing wp-home-chat__msg"
            aria-hidden="true"
          >
            <span />
            <span />
            <span />
          </span>
        )}
      </span>
    </button>
  );
};

const HomePage = () => {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const checkSession = async () => {
      try {
        const response = await axios.get(`${env.backendUrl}/api/v1/auth/me`, {
          withCredentials: true,
          timeout: 8000,
        });
        if (cancelled) return;
        if (response.data.success) {
          localStorage.setItem("token", response.data.token);
          navigate("/chat", { replace: true });
          return;
        }
      } catch (err) {
        console.log(err);
      }
      if (!cancelled) setChecking(false);
    };

    checkSession();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  if (checking) {
    return (
      <div className="wp-splash" role="status" aria-live="polite">
        <img src={LOGO_URL} alt="WhatsApp" className="wp-splash__logo" />
        <span className="wp-splash__bar" aria-hidden="true">
          <span />
        </span>
        <span className="wp-visually-hidden">Checking your session</span>
      </div>
    );
  }

  return (
    <div className="wp-home">
      <header className="wp-home__header wp-container">
        <div className="wp-home__brand">
          <img src={LOGO_URL} alt="" className="wp-home__brand-logo" />
          <span className="wp-home__brand-name">WhatsApp</span>
        </div>
        <div className="wp-home__actions">
          <ThemeToggle />
          <button
            type="button"
            className="wp-btn wp-btn--primary wp-btn--sm"
            onClick={() => navigate("/login")}
          >
            Login
          </button>
        </div>
      </header>

      <main className="wp-home__main wp-container">
        <section className="wp-home__intro">
          <h1 className="wp-home__title">Simple, reliable messaging</h1>
          <p className="wp-home__subtitle">
            Chat with your contacts in real time, from any device. Tap Get
            started to sign in and pick up your conversations.
          </p>

          <div className="wp-home__cta">
            <button
              type="button"
              className="wp-btn wp-btn--primary wp-btn--lg"
              onClick={() => navigate("/login")}
            >
              Get started
            </button>
          </div>

          <ul className="wp-home__features">
            {FEATURES.map((f) => (
              <li key={f.title} className="wp-home__feature">
                <span className="wp-home__feature-icon">{f.icon}</span>
                <span className="wp-home__feature-copy">
                  <strong>{f.title}</strong>
                  <span>{f.text}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="wp-home__visual" aria-label="App preview">
          <div className="wp-home__stage">
            <div className="wp-home__animation">
              <InteractiveRobot />
            </div>
          </div>
          <ChatPreview />
        </section>
      </main>
    </div>
  );
};

export default HomePage;