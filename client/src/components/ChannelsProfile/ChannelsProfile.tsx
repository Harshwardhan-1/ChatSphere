import { useEffect, useRef, useState } from "react";
import { socket } from "../../utils/socket";
import { env } from "../../configs/env.config";
import axiosInstance from "../../services/axiosInstance";
import { showApiError } from "../../utils/showApiError";
import { ChannelMedia } from "../ChannelMedia/Media/Media";
import { ChannelDocs } from "../ChannelMedia/Docs/Docs";
import { ChannelLinks } from "../ChannelMedia/Links/Link";
import { ChannelHook } from "../../hooks/use.channel.hook";

import "./ChannelsProfile.css";

interface ChannelProfileData {
    _id: string;
    name: string;
    profilePic?: string;
    description?: string;
    followers: string[];
    channelCreator: string;
    createdAt: string;
}

interface Props {
    onBack: () => void;
    senderId: string;
    channelId: string;
    isCreator: boolean;
    // parent (ChannelChat) ko batane ke liye taaki chat list + header turant update ho
    onChannelUpdated?: (patch: {
        name?: string;
        profilePic?: string;
        description?: string;
    }) => void;
}

const BackIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M15 18l-6-6 6-6" />
    </svg>
);

const PencilIcon = () => (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 20h9" />
        <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
);

const CameraIcon = () => (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
        <circle cx="12" cy="13" r="4" />
    </svg>
);

const MediaIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <path d="M21 15l-5-5L5 21" />
    </svg>
);

const LinkIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M10 13a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 0 0-7.07-7.07L11 5" />
        <path d="M14 11a5 5 0 0 0-7.07 0L4.1 13.83a5 5 0 0 0 7.07 7.07L13 19" />
    </svg>
);

const DocIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6" />
    </svg>
);

// windows ka backslash path (uploads\abc.png) bhi sahi URL bana deta hai
function resolveChannelPic(profilePic?: string) {
    if (!profilePic) return "/default.webp";
    if (/^(https?:|data:)/i.test(profilePic)) return profilePic;

    const clean = profilePic.replace(/\\/g, "/");
    const path = clean.startsWith("/") ? clean : `/${clean}`;
    return `${env.backendUrl}${path}`;
}

function formatFollowers(count: number): string {
    if (count >= 1_000_000) {
        const v = count / 1_000_000;
        return `${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)}M followers`;
    }

    if (count >= 1_000) {
        const v = count / 1_000;
        return `${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)}k followers`;
    }

    return `${count} follower${count === 1 ? "" : "s"}`;
}

function formatCreatedAt(dateStr?: string): string {
    if (!dateStr) return "";

    const d = new Date(dateStr);
    const day = d.toLocaleDateString(undefined, { weekday: "long" });
    const time = d.toLocaleTimeString(undefined, {
        hour: "numeric",
        minute: "2-digit"
    });

    return `Created ${day} at ${time}`;
}

export function ChannelProfile({
    onBack,
    senderId,
    channelId,
    isCreator,
    onChannelUpdated
}: Props) {
    const [channel, setChannel] = useState<ChannelProfileData | null>(null);

    const [editingDescription, setEditingDescription] = useState(false);
    const [descriptionText, setDescriptionText] = useState("");

    const [editingName, setEditingName] = useState(false);
    const [nameText, setNameText] = useState("");

    const [followersCount, setFollowersCount] = useState<any>();

    const [activeSection, setActiveSection] = useState<
        "profile" | "media" | "links" | "docs"
    >("profile");

    const [hide, setHide] = useState<boolean>(false);
    const [isMuted, setIsMuted] = useState(false);

    // Delete channel state
    const [deleting, setDeleting] = useState(false);

    // profile pic upload ho rahi hai ya nahi
    const [uploadingPic, setUploadingPic] = useState(false);

    const fileInputRef = useRef<HTMLInputElement | null>(null);

    // socket listeners purane closure me na atke isliye ref use kiya
    const onChannelUpdatedRef = useRef(onChannelUpdated);
    onChannelUpdatedRef.current = onChannelUpdated;

    const handleChannelInfo = (data: { channel: ChannelProfileData }) => {
        if (data.channel._id.toString() !== channelId.toString()) return;

        setChannel(data.channel);
        setDescriptionText(data.channel.description || "");
        setNameText(data.channel.name || "");
        setFollowersCount(data.channel.followers?.length);
    };

    const handleDescriptionUpdated = (data: {
        channelId: string;
        description: string;
    }) => {
        if (data.channelId.toString() !== channelId.toString()) return;

        setChannel(prev =>
            prev ? { ...prev, description: data.description } : prev
        );

        onChannelUpdatedRef.current?.({ description: data.description });
    };

    const handleProfilePicUpdated = (data: {
        channelId: string;
        message: string;
    }) => {
        if (data.channelId.toString() !== channelId.toString()) return;

        setChannel(prev =>
            prev ? { ...prev, profilePic: data.message } : prev
        );

        setUploadingPic(false);
        onChannelUpdatedRef.current?.({ profilePic: data.message });
    };

    const handleNameUpdated = (data: {
        channelId: string;
        name: string;
    }) => {
        if (data.channelId.toString() !== channelId.toString()) return;

        setChannel(prev =>
            prev ? { ...prev, name: data.name } : prev
        );

        setNameText(data.name);
        onChannelUpdatedRef.current?.({ name: data.name });
    };

    const handleChannelFollowers = async (data: {
        channelId: string;
        count: number;
    }) => {
        if (data.channelId.toString() !== channelId.toString()) return;

        setFollowersCount(data?.count);
    };

    const handleMuteNotificationInfo = (data: {
        channelId: string;
        senderId: string;
        message: string;
        followingMsg: string;
    }) => {
        if (channelId !== data.channelId || senderId !== data.senderId) {
            return;
        }

        if (data.followingMsg === "off") {
            setHide(true);
            return;
        }

        if (data.message === "on") {
            setIsMuted(true);
        } else {
            setIsMuted(false);
        }
    };

    const { muteToggle } = ChannelHook();

    const handleMuteClick = () => {
        muteToggle({ channelId, senderId });
    };

    const handleToggleMute = (data: {
        channelId: string;
        senderId: string;
        message: string;
    }) => {
        if (channelId !== data.channelId || senderId !== data.senderId) {
            return;
        }

        if (data.message === "on") {
            setIsMuted(true);
        } else {
            setIsMuted(false);
        }
    };

    // Delete channel handler
    const handleDeleteChannel = () => {
        if (!isCreator || deleting) return;

        const confirmed = window.confirm(
            `Are you sure you want to delete "${channel?.name}"?\n\nThis action cannot be undone.`
        );

        if (!confirmed) return;

        setDeleting(true);

        socket.emit("delete_channel", {
            _id: channelId,
            senderId
        });
    };

    // Listen for successful channel deletion
    const handleChannelDeleted = (data: {
        _id: string;
        message: string;
    }) => {
        if (data._id.toString() !== channelId.toString()) return;

        setDeleting(false);
        onBack();
    };

    // Listen for channel deletion error
    const handleDeleteChannelError = (data: {
        message?: string;
    }) => {
        setDeleting(false);

        window.alert(
            data?.message || "Unable to delete channel. Please try again."
        );
    };

    // backend ka "channel_error" (jaise "don't have access to update profile pic") ab user ko dikhega
    const handleChannelError = (msg: string) => {
        setUploadingPic(false);
        window.alert(typeof msg === "string" ? msg : "Something went wrong");
    };

    useEffect(() => {
        if (!channelId || !senderId) return;

        socket.emit("channel_profile_info", { channelId, senderId });
        socket.emit("mute_notification_info", { channelId, senderId });

        socket.on("got_channel_profile_info", handleChannelInfo);
        socket.on("channel_description_changed", handleDescriptionUpdated);
        socket.on("channel_pic_updated", handleProfilePicUpdated);
        socket.on("channel_name_updated", handleNameUpdated);
        socket.on("channel_followers_update_toggle", handleChannelFollowers);
        socket.on("got_mute_notification_info", handleMuteNotificationInfo);
        socket.on("toggle_mute_notification", handleToggleMute);
        socket.on("channel_error", handleChannelError);

        // Delete channel listeners
        socket.on("channel_deleted", handleChannelDeleted);
        socket.on("delete_channel_error", handleDeleteChannelError);

        return () => {
            socket.off("got_channel_profile_info", handleChannelInfo);
            socket.off("channel_description_changed", handleDescriptionUpdated);
            socket.off("channel_pic_updated", handleProfilePicUpdated);
            socket.off("channel_name_updated", handleNameUpdated);
            socket.off("channel_followers_update_toggle", handleChannelFollowers);
            socket.off("got_mute_notification_info", handleMuteNotificationInfo);
            socket.off("toggle_mute_notification", handleToggleMute);
            socket.off("channel_error", handleChannelError);

            // Remove delete channel listeners
            socket.off("channel_deleted", handleChannelDeleted);
            socket.off("delete_channel_error", handleDeleteChannelError);
        };
    }, [channelId, senderId]);

    const startEditDescription = () => {
        setDescriptionText(channel?.description || "");
        setEditingDescription(true);
    };

    const cancelEditDescription = () => {
        setEditingDescription(false);
    };

    const saveDescription = () => {
        socket.emit("edit_channel_description", {
            _id: channelId,
            senderId,
            description: descriptionText
        });

        setEditingDescription(false);
    };

    const startEditName = () => {
        setNameText(channel?.name || "");
        setEditingName(true);
    };

    const cancelEditName = () => {
        setNameText(channel?.name || "");
        setEditingName(false);
    };

    const saveName = () => {
        if (!nameText.trim()) return;

        socket.emit("edit_channel_name", {
            channelId,
            senderId,
            name: nameText.trim()
        });

        setEditingName(false);
    };

    const handleAvatarClick = () => {
        if (!isCreator || uploadingPic) return;

        fileInputRef.current?.click();
    };

    const handleAvatarChange = async (
        e: React.ChangeEvent<HTMLInputElement>
    ) => {
        const file = e.target.files?.[0];

        // same file dobara choose ho sake
        e.target.value = "";

        if (!file) return;

        try {
            setUploadingPic(true);

            const formData = new FormData();
            formData.append("file", file);

            // ChannelChat jaisa hi upload endpoint
            const res = await axiosInstance.post("/upload", formData);

            if (res.data.success) {
                const path = res.data.data.path;

                socket.emit("edit_channel_profile_pic", {
                    channelId,
                    senderId,
                    profilePic: path
                });
                // uploadingPic ko "channel_pic_updated" ya "channel_error" event false karega
            } else {
                setUploadingPic(false);
            }
        } catch (err) {
            setUploadingPic(false);
            showApiError(err);
            console.log(err);
        }
    };

    if (activeSection === "media") {
        return (
            <ChannelMedia
                onBack={() => setActiveSection("profile")}
                channelId={channelId}
                senderId={senderId}
            />
        );
    }

    if (activeSection === "links") {
        return (
            <ChannelLinks
                onBack={() => setActiveSection("profile")}
                channelId={channelId}
                senderId={senderId}
            />
        );
    }

    if (activeSection === "docs") {
        return (
            <ChannelDocs
                onBack={() => setActiveSection("profile")}
                channelId={channelId}
                senderId={senderId}
            />
        );
    }

    if (!channel) {
        return (
            <div className="channel-profile-panel">
                <div className="channel-profile-header">
                    <button
                        className="channel-profile-back"
                        onClick={onBack}
                        type="button"
                        aria-label="Back"
                    >
                        <BackIcon />
                    </button>

                    <h2 className="channel-profile-title">
                        Channel info
                    </h2>

                    <span className="channel-profile-spacer" />
                </div>

                <p className="channel-profile-loading">
                    Loading...
                </p>
            </div>
        );
    }

    return (
        <div className="channel-profile-panel">
            <div className="channel-profile-header">
                <button
                    className="channel-profile-back"
                    onClick={onBack}
                    type="button"
                    aria-label="Back"
                >
                    <BackIcon />
                </button>

                <h2 className="channel-profile-title">
                    Channel info
                </h2>

                <span className="channel-profile-spacer" />
            </div>

            <div className="channel-profile-body">
                <div
                    className={`channel-profile-avatar-wrap ${
                        isCreator ? "channel-profile-avatar-editable" : ""
                    }`}
                    onClick={handleAvatarClick}
                    style={uploadingPic ? { opacity: 0.6, pointerEvents: "none" } : undefined}
                >
                    <img
                        src={resolveChannelPic(channel.profilePic)}
                        alt={channel.name}
                        className="channel-profile-avatar"
                    />

                    {isCreator && (
                        <div className="channel-profile-avatar-overlay">
                            <CameraIcon />
                        </div>
                    )}
                </div>

                {isCreator && (
                    <input
                        type="file"
                        accept="image/*"
                        ref={fileInputRef}
                        style={{ display: "none" }}
                        onChange={handleAvatarChange}
                    />
                )}

                {editingName ? (
                    <div className="channel-profile-name-edit">
                        <input
                            type="text"
                            value={nameText}
                            onChange={(e) => setNameText(e.target.value)}
                            autoFocus
                        />

                        <div className="channel-profile-name-edit-actions">
                            <button
                                type="button"
                                onClick={cancelEditName}
                            >
                                Cancel
                            </button>

                            <button
                                type="button"
                                onClick={saveName}
                            >
                                Save
                            </button>
                        </div>
                    </div>
                ) : (
                    <div className="channel-profile-name-row">
                        <h1 className="channel-profile-name">
                            {channel.name}
                        </h1>

                        {isCreator && (
                            <button
                                className="channel-profile-edit-btn"
                                onClick={startEditName}
                                type="button"
                                aria-label="Edit channel name"
                            >
                                <PencilIcon />
                            </button>
                        )}
                    </div>
                )}

                <p className="channel-profile-meta">
                    Channel · {formatFollowers(followersCount ?? 0)}
                </p>

                <div className="channel-profile-actions">
                    <div className="channel-profile-action">
                        <button
                            className="channel-profile-action-btn"
                            onClick={() => setActiveSection("media")}
                            type="button"
                        >
                            <MediaIcon />
                        </button>

                        <span>Media</span>
                    </div>

                    <div className="channel-profile-action">
                        <button
                            className="channel-profile-action-btn"
                            onClick={() => setActiveSection("links")}
                            type="button"
                        >
                            <LinkIcon />
                        </button>

                        <span>Links</span>
                    </div>

                    <div className="channel-profile-action">
                        <button
                            className="channel-profile-action-btn"
                            onClick={() => setActiveSection("docs")}
                            type="button"
                        >
                            <DocIcon />
                        </button>

                        <span>Docs</span>
                    </div>
                </div>

                <div className="channel-profile-section">
                    {editingDescription ? (
                        <div className="channel-profile-description-edit">
                            <textarea
                                value={descriptionText}
                                onChange={(e) =>
                                    setDescriptionText(e.target.value)
                                }
                                placeholder="Add channel description"
                                autoFocus
                            />

                            <div className="channel-profile-description-edit-actions">
                                <button
                                    type="button"
                                    onClick={cancelEditDescription}
                                >
                                    Cancel
                                </button>

                                <button
                                    type="button"
                                    onClick={saveDescription}
                                >
                                    Save
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className="channel-profile-description-row">
                            <span
                                className={`channel-profile-description-text ${
                                    !channel.description
                                        ? "channel-profile-description-placeholder"
                                        : ""
                                }`}
                            >
                                {channel.description ||
                                    "Add channel description"}
                            </span>

                            {isCreator && (
                                <button
                                    className="channel-profile-edit-btn"
                                    onClick={startEditDescription}
                                    type="button"
                                    aria-label="Edit description"
                                >
                                    <PencilIcon />
                                </button>
                            )}
                        </div>
                    )}
                </div>

                <p className="channel-profile-created">
                    {formatCreatedAt(channel.createdAt)}
                </p>
            </div>

            {!hide && (
                <div className="mute-row">
                    <span>Mute notifications</span>

                    <button
                        className={`toggle ${isMuted ? "active" : ""}`}
                        onClick={handleMuteClick}
                        type="button"
                    >
                        <span className="toggle-circle"></span>
                    </button>
                </div>
            )}

            {/* Delete channel button - only channel creator can see it */}
            {isCreator && (
                <div className="channel-delete-section">
                    <button
                        className="channel-delete-btn"
                        type="button"
                        onClick={handleDeleteChannel}
                        disabled={deleting}
                    >
                        {deleting ? "Deleting Channel..." : "Delete Channel"}
                    </button>
                </div>
            )}
        </div>
    );
}