import { useEffect, useRef, useState } from "react";
import "./animation.css";

type RobotMode =
  | "chatting"
  | "noticing"
  | "annoyed"
  | "returning"
  | "celebrating";

const messages = [
  "Hey! What's up?",
  "Let's chat 👋",
  "Message sent ✓",
];

const InteractiveRobot = () => {
  const [hovered, setHovered] = useState(false);
  const [mode, setMode] = useState<RobotMode>("chatting");
  const [messageIndex, setMessageIndex] = useState(0);
  const [showHeart, setShowHeart] = useState(false);

  const timerRef = useRef<number | null>(null);
  const heartTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
    }

    if (hovered) {
      setMode("noticing");

      timerRef.current = window.setTimeout(() => {
        setMode("annoyed");
      }, 450);
    } else {
      setMode((currentMode) => {
        if (
          currentMode === "annoyed" ||
          currentMode === "noticing"
        ) {
          return "returning";
        }

        return currentMode;
      });

      timerRef.current = window.setTimeout(() => {
        setMode("chatting");
      }, 650);
    }

    return () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, [hovered]);

  useEffect(() => {
    if (hovered) {
      return;
    }

    const interval = window.setInterval(() => {
      setMessageIndex(
        (current) => (current + 1) % messages.length
      );
    }, 3000);

    return () => window.clearInterval(interval);
  }, [hovered]);

  useEffect(() => {
    return () => {
      if (heartTimerRef.current) {
        window.clearTimeout(heartTimerRef.current);
      }
    };
  }, []);

  const handleRobotClick = () => {
    if (heartTimerRef.current) {
      window.clearTimeout(heartTimerRef.current);
    }

    setShowHeart(true);

    heartTimerRef.current = window.setTimeout(() => {
      setShowHeart(false);
    }, 900);
  };

  const isAnnoyed = mode === "annoyed";

  return (
    <div
      className={`robot-mascot robot-${mode}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={handleRobotClick}
      role="button"
      tabIndex={0}
      aria-label="Interactive chat robot"
    >
      <svg
        className="robot-art"
        viewBox="0 0 560 560"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <radialGradient id="rb-aura" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#5eead4" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#5eead4" stopOpacity="0" />
          </radialGradient>

          <linearGradient id="rb-head" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#d3dfe8" />
          </linearGradient>

          <linearGradient id="rb-screen" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1b2b40" />
            <stop offset="100%" stopColor="#0a1320" />
          </linearGradient>

          <linearGradient id="rb-body" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#40516a" />
            <stop offset="100%" stopColor="#18222f" />
          </linearGradient>

          <linearGradient id="rb-lid" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#f1f5f8" />
            <stop offset="100%" stopColor="#b1bdca" />
          </linearGradient>

          <linearGradient id="rb-wood-top" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#dcae7d" />
            <stop offset="100%" stopColor="#b98a58" />
          </linearGradient>

          <linearGradient id="rb-wood-front" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#a97b4d" />
            <stop offset="100%" stopColor="#84603a" />
          </linearGradient>

          <filter
            id="rb-shadow"
            x="-20%"
            y="-20%"
            width="140%"
            height="160%"
          >
            <feDropShadow
              dx="0"
              dy="6"
              stdDeviation="7"
              floodColor="#0f172a"
              floodOpacity="0.18"
            />
          </filter>

          <filter
            id="rb-glow"
            x="-60%"
            y="-60%"
            width="220%"
            height="220%"
          >
            <feGaussianBlur stdDeviation="2.5" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* soft background glow + floor shadow */}
        <circle cx="280" cy="260" r="230" fill="url(#rb-aura)" />
        <ellipse className="floor-shadow" cx="280" cy="458" rx="200" ry="14" />

        {/* chair back */}
        <rect
          className="chair-back"
          x="204"
          y="214"
          width="152"
          height="122"
          rx="36"
        />

        {/* torso */}
        <g className="torso">
          <path
            className="body"
            d="M234 238 Q234 216 258 216 H302 Q326 216 326 238 L336 336 H224 Z"
          />
          <rect
            className="neck"
            x="268"
            y="196"
            width="24"
            height="26"
            rx="8"
          />
          <rect
            className="chest-led"
            x="262"
            y="234"
            width="36"
            height="5"
            rx="2.5"
          />
        </g>

        {/* head */}
        <g className="head">
          {/* antenna */}
          <g className="antenna">
            <line x1="280" y1="98" x2="280" y2="72" />
            <circle
              cx="280"
              cy="64"
              r="7"
              filter="url(#rb-glow)"
            />
          </g>

          {/* ears */}
          <rect className="ear" x="190" y="132" width="12" height="32" rx="6" />
          <rect className="ear" x="358" y="132" width="12" height="32" rx="6" />

          <rect
            className="head-shell"
            x="200"
            y="96"
            width="160"
            height="108"
            rx="48"
          />

          <rect
            className="face-screen"
            x="214"
            y="110"
            width="132"
            height="80"
            rx="34"
          />

          <circle className="ear-light" cx="196" cy="148" r="3" />
          <circle className="ear-light" cx="364" cy="148" r="3" />

          {/* angry eyebrows */}
          <path className="angry-eyebrow" d="M240 124 L270 133" />
          <path className="angry-eyebrow" d="M290 133 L320 124" />

          {/* eyes */}
          <g className="eye" filter="url(#rb-glow)">
            <ellipse cx="254" cy="148" rx="11" ry="15" />
            <circle cx="258" cy="142" r="3.5" />
          </g>

          <g className="eye" filter="url(#rb-glow)">
            <ellipse cx="306" cy="148" rx="11" ry="15" />
            <circle cx="310" cy="142" r="3.5" />
          </g>

          {/* mouth */}
          {!isAnnoyed && (
            <path
              className="robot-mouth"
              d="M266 172 Q280 182 294 172"
            />
          )}

          {isAnnoyed && (
            <path
              className="angry-mouth"
              d="M266 178 Q280 166 294 178"
            />
          )}
        </g>

        {/* desk */}
        <g className="desk">
          <rect
            className="desk-front"
            x="124"
            y="332"
            width="312"
            height="122"
            rx="10"
          />
          <rect
            className="desk-drawer"
            x="222"
            y="356"
            width="116"
            height="34"
            rx="6"
          />
          <rect
            className="desk-handle"
            x="264"
            y="369"
            width="32"
            height="6"
            rx="3"
          />
          <rect
            className="desk-top"
            x="104"
            y="318"
            width="352"
            height="16"
            rx="8"
          />
          <rect
            className="desk-shine"
            x="116"
            y="320"
            width="328"
            height="2.5"
            rx="1.25"
          />
        </g>

        {/* coffee mug */}
        <g className="mug">
          <path className="steam steam-1" d="M148 286 Q144 278 149 270" />
          <path className="steam steam-2" d="M156 286 Q160 278 155 270" />
          <path className="mug-handle" d="M162 298 Q172 298 172 306 Q172 314 162 312" />
          <rect className="mug-body" x="140" y="292" width="22" height="26" rx="6" />
          <rect className="mug-band" x="140" y="300" width="22" height="5" />
        </g>

        {/* laptop (back of the screen faces us) */}
        <g className="laptop">
          <rect
            className="laptop-lid"
            x="222"
            y="252"
            width="116"
            height="64"
            rx="8"
          />
          <circle
            className="laptop-logo"
            cx="280"
            cy="284"
            r="8"
          />
          <rect
            className="laptop-base"
            x="198"
            y="314"
            width="164"
            height="10"
            rx="5"
          />
        </g>

        {/* left arm */}
        <g className="arm-left">
          <path
            className="arm-outline"
            d="M236 242 Q204 260 213 292 Q219 314 254 320"
          />
          <path
            className="arm-fill"
            d="M236 242 Q204 260 213 292 Q219 314 254 320"
          />
          <circle className="joint" cx="236" cy="240" r="13" />
          <circle className="hand" cx="254" cy="320" r="11" />
        </g>

        {/* right arm */}
        <g className="arm-right">
          <path
            className="arm-outline"
            d="M324 242 Q356 260 347 292 Q341 314 306 320"
          />
          <path
            className="arm-fill"
            d="M324 242 Q356 260 347 292 Q341 314 306 320"
          />
          <circle className="joint" cx="324" cy="240" r="13" />
          <circle className="hand" cx="306" cy="320" r="11" />
        </g>

        {/* floating chat bubble */}
        <g className="floating-chat">
          <g filter="url(#rb-shadow)">
            <rect
              className="bubble"
              x="392"
              y="118"
              width="144"
              height="100"
              rx="16"
            />
            <polygon
              className="bubble"
              points="404,214 392,232 424,214"
            />
          </g>

          <circle className="bubble-dot" cx="408" cy="137" r="4" />
          <text className="bubble-title" x="418" y="141">
            Chat
          </text>
          <text className="bubble-sub" x="408" y="155">
            online
          </text>

          <rect
            className="bubble-message"
            x="406"
            y="164"
            width="116"
            height="26"
            rx="13"
          />
          <text
            key={messageIndex}
            className="bubble-text"
            x="418"
            y="181"
          >
            {messages[messageIndex]}
          </text>

          <circle className="typing-dot" cx="416" cy="204" r="2.5" />
          <circle
            className="typing-dot"
            cx="426"
            cy="204"
            r="2.5"
            style={{ animationDelay: "0.15s" }}
          />
          <circle
            className="typing-dot"
            cx="436"
            cy="204"
            r="2.5"
            style={{ animationDelay: "0.3s" }}
          />
        </g>

        {/* angry bubble */}
        {isAnnoyed && (
          <g className="annoyed-bubble">
            <g filter="url(#rb-shadow)">
              <rect
                className="angry-shape"
                x="10"
                y="112"
                width="166"
                height="46"
                rx="18"
              />
              <polygon
                className="angry-shape"
                points="174,128 188,138 174,146"
              />
            </g>

            <text x="26" y="140">
              {"I'm chatting 😤"}
            </text>
          </g>
        )}

        {/* click heart */}
        {showHeart && (
          <text className="heart-pop" x="336" y="100">
            ♥
          </text>
        )}
      </svg>
    </div>
  );
};

export default InteractiveRobot;