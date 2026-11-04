import { useState } from "react";
import {
    LiveKitRoom,
    RoomAudioRenderer,
    useParticipants,
    useLocalParticipant,
    VideoTrack,
    useTracks,
    isTrackReference,
} from "@livekit/components-react";
import { Track } from "livekit-client";
import "@livekit/components-styles";
import "./GroupCall.css";
import { CallChatPanel } from "../CallChatPanel/CallChatPanel";
import { env } from "../../configs/env.config";
import {
    Mic,
    MicOff,
    Video,
    VideoOff,
    PhoneOff,
    MessageSquare,
    X,
    Users,
} from "lucide-react";

export type GroupCallUser = {
    _id: string;
    name: string;
    avatar?: string;
};

type GroupCallProps = {
    token: string;
    callType: "voice" | "video";
    onClose: () => void;
    callId: string;
    groupId: string;
    groupName?: string;
    senderId: string;
    getMemberName: (id: string) => string;
    users?: GroupCallUser[];
};

const AVATAR_COLORS = [
    "#00a884",
    "#1c7ed6",
    "#7c5cff",
    "#e64980",
    "#f76707",
    "#00afaf",
    "#e542a3",
    "#2b8a3e",
];

function getAvatarColor(id: string) {
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
        hash = id.charCodeAt(i) + ((hash << 5) - hash);
    }
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function resolveAvatarUrl(avatar?: string) {
    if (!avatar) return "";
    if (/^(https?:|data:|blob:)/i.test(avatar)) return avatar;
    return `${env.backendUrl}${avatar.startsWith("/") ? "" : "/"}${avatar}`;
}

function CallStageInner({
    callType,
    onClose,
    callId,
    groupId,
    groupName,
    senderId,
    getMemberName,
    users = [],
}: Omit<GroupCallProps, "token">) {
    const participants = useParticipants();
    const { localParticipant } = useLocalParticipant();
    const [showChat, setShowChat] = useState(false);

    const videoTracks = useTracks(
        [{ source: Track.Source.Camera, withPlaceholder: false }],
        { onlySubscribed: false }
    ).filter(isTrackReference);

    const isMicOn = localParticipant.isMicrophoneEnabled;
    const isCamOn = localParticipant.isCameraEnabled;

    const toggleMic = async () => {
        try {
            await localParticipant.setMicrophoneEnabled(!isMicOn);
        } catch (err) {
            console.error("Mic toggle error:", err);
        }
    };

    const toggleCam = async () => {
        try {
            await localParticipant.setCameraEnabled(!isCamOn);
        } catch (err) {
            console.error("Camera toggle error:", err);
        }
    };

    const getUserProfile = (identity: string) => {
        const found = users.find((u) => String(u._id) === String(identity));
        const rawName =
            found?.name ||
            getMemberName(identity) ||
            (String(identity) === String(senderId) ? "You" : "Member");
        const cleanName =
            rawName === "Unknown" && String(identity) === String(senderId)
                ? "You"
                : rawName;
        const avatar = resolveAvatarUrl(found?.avatar);
        return { name: cleanName, avatar };
    };

    return (
        <div className="wa-gc-stage">
            {/* Top Header */}
            <header className="wa-gc-topbar">
                <div className="wa-gc-topbar-left">
                    <span className="wa-gc-encrypted-dot" />
                    <div>
                        <h3 className="wa-gc-title">
                            {groupName || (callType === "video" ? "Group Video Call" : "Group Voice Call")}
                        </h3>
                        <span className="wa-gc-subtitle">
                            <Users size={13} /> {participants.length}{" "}
                            {participants.length === 1 ? "participant" : "participants"}
                        </span>
                    </div>
                </div>

                <button
                    type="button"
                    className={`wa-gc-chat-toggle-btn ${showChat ? "active" : ""}`}
                    onClick={() => setShowChat((prev) => !prev)}
                >
                    <MessageSquare size={17} />
                    <span>Chat</span>
                </button>
            </header>

            {/* Main 1-on-1 Style Grid */}
            <div className="wa-gc-body">
                <div className={`wa-gc-grid count-${Math.max(1, Math.min(participants.length, 6))}`}>
                    {participants.map((p) => {
                        const identity = String(p.identity || "");
                        const isMe = identity === String(senderId);
                        const { name, avatar } = getUserProfile(identity);
                        const initial = (name?.trim()?.[0] || "U").toUpperCase();

                        const camTrackRef = videoTracks.find(
                            (t) => String(t.participant.identity) === identity
                        );
                        const showVideo =
                            callType === "video" &&
                            p.isCameraEnabled &&
                            Boolean(camTrackRef);

                        return (
                            <div
                                key={p.sid || identity}
                                className={`wa-gc-tile ${p.isSpeaking ? "is-speaking" : ""}`}
                            >
                                {showVideo && camTrackRef ? (
                                    <VideoTrack
                                        trackRef={camTrackRef}
                                        className="wa-gc-video"
                                    />
                                ) : (
                                    <div className="wa-gc-avatar-stage">
                                        <div
                                            className={`wa-gc-avatar-ring ${
                                                p.isSpeaking ? "speaking-pulse" : ""
                                            }`}
                                            style={{ backgroundColor: getAvatarColor(identity) }}
                                        >
                                            {avatar ? (
                                                <img
                                                    src={avatar}
                                                    alt={name}
                                                    className="wa-gc-avatar-img"
                                                />
                                            ) : (
                                                <span className="wa-gc-avatar-letter">
                                                    {initial}
                                                </span>
                                            )}
                                        </div>
                                        <span className="wa-gc-tile-big-name">
                                            {isMe ? `${name} (You)` : name}
                                        </span>
                                        <span className="wa-gc-tile-state">
                                            {p.isMicrophoneEnabled
                                                ? callType === "video"
                                                    ? "Camera off"
                                                    : "Voice connected"
                                                : "Muted"}
                                        </span>
                                    </div>
                                )}

                                <div className="wa-gc-tile-footer">
                                    <span className="wa-gc-tile-name">
                                        {isMe ? "You" : name}
                                    </span>
                                    {!p.isMicrophoneEnabled && (
                                        <span className="wa-gc-muted-badge" title="Muted">
                                            <MicOff size={13} />
                                        </span>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* In-Call Chat Drawer */}
                {showChat && (
                    <aside className="wa-gc-chat-drawer">
                        <div className="wa-gc-chat-drawer-header">
                            <h4>In-Call Chat</h4>
                            <button
                                type="button"
                                className="wa-gc-chat-close"
                                onClick={() => setShowChat(false)}
                            >
                                <X size={18} />
                            </button>
                        </div>
                        <div className="wa-gc-chat-drawer-body">
                            <CallChatPanel
                                callId={callId}
                                groupId={groupId}
                                senderId={senderId}
                                getMemberName={getMemberName}
                                onClose={() => setShowChat(false)}
                            />
                        </div>
                    </aside>
                )}
            </div>

            {/* Bottom 1-on-1 Style Controls */}
            <footer className="wa-gc-controls">
                <button
                    type="button"
                    className={`wa-gc-ctrl-btn ${!isMicOn ? "is-off" : ""}`}
                    onClick={toggleMic}
                    title={isMicOn ? "Mute" : "Unmute"}
                >
                    {isMicOn ? <Mic size={22} /> : <MicOff size={22} />}
                </button>

                {callType === "video" && (
                    <button
                        type="button"
                        className={`wa-gc-ctrl-btn ${!isCamOn ? "is-off" : ""}`}
                        onClick={toggleCam}
                        title={isCamOn ? "Turn off camera" : "Turn on camera"}
                    >
                        {isCamOn ? <Video size={22} /> : <VideoOff size={22} />}
                    </button>
                )}

                <button
                    type="button"
                    className={`wa-gc-ctrl-btn ${showChat ? "is-active" : ""}`}
                    onClick={() => setShowChat((prev) => !prev)}
                    title="In-call chat"
                >
                    <MessageSquare size={21} />
                </button>

                <button
                    type="button"
                    className="wa-gc-ctrl-btn wa-gc-hangup-btn"
                    onClick={onClose}
                    title="Leave call"
                >
                    <PhoneOff size={22} />
                </button>
            </footer>
        </div>
    );
}

export function GroupCall({
    token,
    callType,
    onClose,
    callId,
    groupId,
    groupName,
    senderId,
    getMemberName,
    users = [],
}: GroupCallProps) {
    const liveKitUrl = import.meta.env.VITE_LIVEKIT_URL;

    if (!liveKitUrl) {
        return (
            <div className="wa-gc-overlay">
                <div className="wa-gc-call-card">
                    <h3 className="wa-gc-call-card-title">LiveKit URL not found</h3>
                    <p className="wa-gc-call-card-sub">Please configure VITE_LIVEKIT_URL</p>
                    <button className="wa-gc-action-pill reject" onClick={onClose}>
                        Close
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="wa-gc-overlay">
            <LiveKitRoom
                token={token}
                serverUrl={liveKitUrl}
                connect={true}
                audio={true}
                video={callType === "video"}
                onDisconnected={onClose}
                onError={(error) => {
                    console.error("LiveKit error:", error);
                }}
                className="wa-gc-livekit-root"
            >
                <RoomAudioRenderer />
                <CallStageInner
                    callType={callType}
                    onClose={onClose}
                    callId={callId}
                    groupId={groupId}
                    groupName={groupName}
                    senderId={senderId}
                    getMemberName={getMemberName}
                    users={users}
                />
            </LiveKitRoom>
        </div>
    );
}