import { useEffect, useState } from "react";
import { Phone, PhoneOff, Video, VideoOff, Mic, MicOff, Lock } from "lucide-react";
import { useCall } from "./CallContext";
import "./CallScreen.css";

const COLORS = ["#FF6B6B", "#4ECDC4", "#45B7D1", "#F7B731", "#5F27CD", "#10AC84", "#EE5253", "#2E86DE"];

const formatTime = (s: number) => {
  const h = Math.floor(s / 3600);
  const m = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const sec = String(s % 60).padStart(2, "0");
  return h ? `${h}:${m}:${sec}` : `${m}:${sec}`;
};

// photo ho to photo, nahi to Google Meet / WhatsApp jaisa naam ka pehla akshar
function CallAvatar({ name, image, size }: { name: string; image: string | null; size: number }) {
  const bg = COLORS[(name?.charCodeAt(0) || 0) % COLORS.length];
  return (
    <div
      className="wc-avatar"
      style={{ width: size, height: size, fontSize: size * 0.42, backgroundColor: image ? "transparent" : bg }}
    >
      {image ? <img src={image} alt={name} /> : (name?.charAt(0).toUpperCase() || "?")}
    </div>
  );
}

export function CallScreen() {
  const {
    localVideoRef,
    remoteVideoRef,
    callStatus,
    acceptCall,
    rejectCall,
    endCall,
    peer,
    me,
    notice,
    dismissNotice,
    peerCamOff,
    sendCamState,
  } = useCall();

  const [seconds, setSeconds] = useState(0);
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);

  // timer: sirf jab call "ongoing" ho
  useEffect(() => {
    if (callStatus !== "ongoing") {
      setSeconds(0);
      return;
    }
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [callStatus]);

  // call khatam -> mic / camera state reset
  useEffect(() => {
    if (callStatus === "idle") {
      setMuted(false);
      setCamOff(false);
    }
  }, [callStatus]);

  // camera pehle se band tha aur call ab connect hui -> samne wale ko dobara batao
  useEffect(() => {
    if (callStatus === "ongoing" && camOff) sendCamState(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callStatus]);

  const getLocalStream = () => (localVideoRef.current?.srcObject as MediaStream | null) ?? null;

  const toggleMic = () => {
    const next = !muted;
    getLocalStream()?.getAudioTracks().forEach((t) => (t.enabled = !next));
    setMuted(next);
  };

  const toggleCam = () => {
    const next = !camOff;
    getLocalStream()?.getVideoTracks().forEach((t) => (t.enabled = !next));
    setCamOff(next);
    sendCamState(next);
  };

  if (callStatus === "idle" && !notice) return null;

  const showNotice = !!notice;
  const isVideo = !showNotice && peer.callType === "video";
  const isRinging = callStatus === "ringing"; // incoming
  const isCalling = callStatus === "calling"; // outgoing
  const isOngoing = callStatus === "ongoing";
  const statusText = isOngoing ? formatTime(seconds) : "Calling…";
  const rootState = showNotice ? "notice" : callStatus;

  return (
    <div
      className={`wc-root wc-${rootState} ${isVideo ? "is-video" : "is-audio"}${isVideo && camOff ? " self-cam-off" : ""}${isVideo && peerCamOff ? " peer-cam-off" : ""}`}
      role="dialog"
      aria-label={isRinging ? "Incoming call" : "Call"}
    >
      {/* videos call ke poore time mounted rehte hain (hook stream attach kar sake), CSS se dikhte / chhupte hain */}
      {callStatus !== "idle" && (
        <div className="wc-media">
          <video ref={remoteVideoRef} className="wc-remote" autoPlay playsInline />
          <video ref={localVideoRef} className="wc-local" autoPlay muted playsInline />
          {/* apna camera band ho to chhoti screen me apna avatar */}
          <div className="wc-pip-off">
            <CallAvatar name={me.name} image={me.image} size={72} />
          </div>
        </div>
      )}

      {/* ---------- NOTICE: user offline / busy / no answer ---------- */}
      {showNotice && notice && (
        <div className="wc-stage">
          <div className="wc-top">
            <span className="wc-e2e">
              <Lock size={12} /> End-to-end encrypted
            </span>
          </div>

          <div className="wc-center">
            <CallAvatar name={notice.name} image={notice.image} size={168} />
            <div className="wc-name">{notice.name || "Unknown"}</div>
            <div className="wc-notice-title">
              <PhoneOff size={18} />
              <span>{notice.title}</span>
            </div>
            <div className="wc-notice-sub">{notice.sub}</div>
          </div>

          <div className="wc-controls">
            <button className="wc-btn wc-close" onClick={dismissNotice}>
              Close
            </button>
          </div>
        </div>
      )}

      {/* ---------- INCOMING ---------- */}
      {!showNotice && isRinging && (
        <div className="wc-incoming">
          <div className="wc-pulse is-live wc-pulse--card">
            <CallAvatar name={peer.name} image={peer.image} size={132} />
          </div>
          <div className="wc-in-name">{peer.name || "Unknown"}</div>
          <div className="wc-in-sub">
            {peer.callType === "video" ? <Video size={18} /> : <Phone size={18} />}
            <span>Incoming {peer.callType === "video" ? "video" : "voice"} call</span>
          </div>

          <div className="wc-in-actions">
            <button className="wc-btn wc-decline" onClick={() => rejectCall()}>
              <PhoneOff size={22} />
              <span>Decline</span>
            </button>
            <button className="wc-btn wc-accept" onClick={() => acceptCall()}>
              {peer.callType === "video" ? <Video size={22} /> : <Phone size={22} />}
              <span>Accept</span>
            </button>
          </div>
        </div>
      )}

      {/* ---------- CALLING / ONGOING ---------- */}
      {!showNotice && (isCalling || isOngoing) && (
        <div className="wc-stage">
          <div className="wc-top">
            <span className="wc-e2e">
              <Lock size={12} /> End-to-end encrypted
            </span>

            <div className="wc-chip">
              {isVideo && <span className="wc-chip-name">{peer.name || "Unknown"}</span>}
              <span className="wc-chip-status">{statusText}</span>
            </div>
          </div>

          {/* voice call: Google Meet jaisa — dono log ke tiles, naam ka pehla akshar */}
          {!isVideo && (
            <div className="wc-tiles">
              <div className="wc-tile">
                <div className={`wc-pulse ${isCalling ? "is-live" : ""}`}>
                  <CallAvatar name={peer.name} image={peer.image} size={132} />
                </div>
                <span className="wc-tile-name">{peer.name || "Unknown"}</span>
              </div>

              <div className="wc-tile">
                <div className="wc-pulse">
                  <CallAvatar name={me.name} image={me.image} size={132} />
                </div>
                <span className="wc-tile-name">You</span>
                {muted && (
                  <span className="wc-tile-mic" title="Muted">
                    <MicOff size={14} />
                  </span>
                )}
              </div>
            </div>
          )}

          {/* video call: camera band ho (samne wale ka ya apna calling ke waqt) to avatar + naam, warna khali */}
          {isVideo &&
            ((isOngoing && peerCamOff) || (isCalling && camOff) ? (
              <div className="wc-center">
                <CallAvatar name={peer.name} image={peer.image} size={168} />
                <div className="wc-name">{peer.name || "Unknown"}</div>
                {isOngoing && <div className="wc-status">Camera is off</div>}
              </div>
            ) : (
              <div />
            ))}

          <div className="wc-controls">
            {isVideo && (
              <button
                className={`wc-ctl ${camOff ? "is-on" : ""}`}
                onClick={toggleCam}
                title={camOff ? "Turn camera on" : "Turn camera off"}
              >
                {camOff ? <VideoOff size={24} /> : <Video size={24} />}
              </button>
            )}
            <button
              className={`wc-ctl ${muted ? "is-on" : ""}`}
              onClick={toggleMic}
              title={muted ? "Unmute" : "Mute"}
            >
              {muted ? <MicOff size={24} /> : <Mic size={24} />}
            </button>
            <button className="wc-ctl wc-end" onClick={() => endCall()} title={isCalling ? "Cancel" : "End call"}>
              <PhoneOff size={24} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}