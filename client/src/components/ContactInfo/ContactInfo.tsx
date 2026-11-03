import { useEffect, useRef, useState } from "react";
import {
  X,
  Camera,
  Pencil,
  Check,
  Trash2,
  Clock,
  VolumeX,
  Image as ImageIcon,
  FileText,
  Link2,
  Bell,
  BellOff,
  ChevronRight,
} from "lucide-react";
import { socket } from "../../utils/socket";
import { env } from "../../configs/env.config";
import axiosInstance from "../../services/axiosInstance";
import { showApiError } from "../../utils/showApiError";
import type { MessageItem } from "../../hooks/use.chatTalk";
import "./ContactInfo.css";

interface ContactUser {
  _id: string;
  name: string;
  email: string;
  avatar?: string;
  description?: string;
}

interface Props {
  contact: ContactUser;
  isSelf: boolean;
  statusText: string;
  avatarColor: string;
  messages: MessageItem[];
  favouriteLabel: string;
  onToggleFavourite: () => void;
  onSelect: (value: string) => void;
  onClose: () => void;
}

const resolveAvatarUrl = (path?: string) => {
  if (!path) return "";
  return /^(https?:|data:|blob:)/i.test(path)
    ? path
    : `${env.backendUrl}${path.startsWith("/") ? "" : "/"}${path}`;
};

export const ContactInfo = ({
  contact,
  isSelf,
  statusText,
  avatarColor,
  messages,
  favouriteLabel,
  onToggleFavourite,
  onSelect,
  onClose,
}: Props) => {
  const [avatar, setAvatar] = useState<string>(contact.avatar || "");
  const [imgError, setImgError] = useState<boolean>(false);
  const [uploading, setUploading] = useState<boolean>(false);

  const [description, setDescription] = useState<string>(
    contact.description || "Life is Short Keep Enjoying"
  );
  const [isEditingDesc, setIsEditingDesc] = useState<boolean>(false);
  const [descDraft, setDescDraft] = useState<string>(
    contact.description || "Life is Short Keep Enjoying"
  );

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Jab parent (ChatListPage / ChatPage) se contact prop update ho ya doosra user select ho
  useEffect(() => {
    setAvatar(contact.avatar || "");
    setImgError(false);
    const initialDesc = contact.description || "Life is Short Keep Enjoying";
    setDescription(initialDesc);
    setDescDraft(initialDesc);
    setIsEditingDesc(false);
  }, [contact._id, contact.avatar, contact.description]);

  // Real-time socket listeners: jab khud ya samne wala user apni DP ya About change kare
  useEffect(() => {
    const handlePicChanged = (payload: {
      data?: { senderId: string; avatar: string };
      senderId?: string;
      avatar?: string;
    }) => {
      const changed = payload?.data ?? payload;
      if (changed?.senderId === contact._id) {
        setAvatar(changed.avatar || "");
        setImgError(false);
      }
    };

    const handleDescChanged = (payload: {
      senderId: string;
      description: string;
    }) => {
      if (payload?.senderId === contact._id) {
        const updatedDesc = payload.description || "Life is Short Keep Enjoying";
        setDescription(updatedDesc);
        setDescDraft(updatedDesc);
      }
    };

    socket.on("profile_pic_changed", handlePicChanged);
    socket.on("profile_description_changed", handleDescChanged);

    return () => {
      socket.off("profile_pic_changed", handlePicChanged);
      socket.off("profile_description_changed", handleDescChanged);
    };
  }, [contact._id]);

  // Profile image upload + real-time socket emit
  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !isSelf) return;

    const previewUrl = URL.createObjectURL(file);
    setAvatar(previewUrl);
    setImgError(false);

    try {
      setUploading(true);
      const formData = new FormData();
      formData.append("file", file);
      const res = await axiosInstance.post("/upload", formData);

      if (res.data.success) {
        const uploadedPath = res.data.data.path;
        setAvatar(uploadedPath);
        socket.emit("profile_image", {
          senderId: contact._id,
          avatar: uploadedPath,
        });
      }
    } catch (err) {
      showApiError(err);
      setAvatar(contact.avatar || "");
    } finally {
      setUploading(false);
      URL.revokeObjectURL(previewUrl);
    }
  };

  // Description save + real-time socket emit
  const handleSaveDescription = () => {
    if (!isSelf) return;
    const trimmed = descDraft.trim() || "Life is Short Keep Enjoying";
    setDescription(trimmed);
    setIsEditingDesc(false);

    socket.emit("description", {
      senderId: contact._id,
      description: trimmed,
    });
  };

  // Media preview (recent 3 images/videos)
  const mediaMessages = messages.filter(
    (m) =>
      m.messageType === "file" &&
      (m.mimetype?.startsWith("image/") || m.mimetype?.startsWith("video/"))
  );

  const avatarSrc = resolveAvatarUrl(avatar);
  const showImage = !!avatarSrc && !imgError;

  return (
    <aside className="ci-overlay" onClick={onClose}>
      <div className="ci-panel" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <header className="ci-header">
          <button
            type="button"
            className="ci-close-btn"
            onClick={onClose}
            aria-label="Close contact info"
          >
            <X size={20} />
          </button>
          <h3 className="ci-header-title">
            {isSelf ? "Profile info" : "Contact info"}
          </h3>
        </header>

        <div className="ci-body">
          {/* Hero Section: Avatar, Name, Email, Status */}
          <section className="ci-card ci-hero">
            <div className="ci-avatar-wrapper">
              <div
                className="ci-avatar"
                style={{ backgroundColor: avatarColor }}
              >
                {showImage ? (
                  <img
                    src={avatarSrc}
                    alt={contact.name}
                    onError={() => setImgError(true)}
                  />
                ) : (
                  <span>{contact.name?.charAt(0)?.toUpperCase()}</span>
                )}
              </div>

              {isSelf && (
                <>
                  <button
                    type="button"
                    className="ci-camera-btn"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    title="Change profile photo"
                  >
                    <Camera size={18} />
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    style={{ display: "none" }}
                    onChange={handleAvatarUpload}
                  />
                </>
              )}
            </div>

            <h2 className="ci-name">
              {contact.name} {isSelf ? "(You)" : ""}
            </h2>
            <p className="ci-email">{contact.email}</p>
            <span className="ci-status">{statusText}</span>
          </section>

          {/* About / Description Section */}
          <section className="ci-card ci-about">
            <div className="ci-section-head">
              <span className="ci-section-label">About</span>
              {isSelf && !isEditingDesc && (
                <button
                  type="button"
                  className="ci-icon-btn"
                  onClick={() => {
                    setDescDraft(description);
                    setIsEditingDesc(true);
                  }}
                  title="Edit about"
                >
                  <Pencil size={16} />
                </button>
              )}
            </div>

            {isSelf && isEditingDesc ? (
              <div className="ci-desc-edit">
                <input
                  type="text"
                  className="ci-desc-input"
                  value={descDraft}
                  maxLength={140}
                  onChange={(e) => setDescDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSaveDescription();
                    if (e.key === "Escape") setIsEditingDesc(false);
                  }}
                  autoFocus
                />
                <button
                  type="button"
                  className="ci-save-btn"
                  onClick={handleSaveDescription}
                  title="Save"
                >
                  <Check size={18} />
                </button>
              </div>
            ) : (
              <p className="ci-desc-text">{description}</p>
            )}
          </section>

          {/* Media, Links & Docs Preview */}
          <section className="ci-card ci-links-group">
            <button
              type="button"
              className="ci-ActionRow"
              onClick={() => onSelect("media")}
            >
              <ImageIcon size={19} className="ci-row-icon" />
              <span className="ci-row-text">Media</span>
              <span className="ci-row-count">{mediaMessages.length}</span>
              <ChevronRight size={18} className="ci-row-arrow" />
            </button>

            {mediaMessages.length > 0 && (
              <div className="ci-media-strip">
                {mediaMessages
                  .slice(-3)
                  .reverse()
                  .map((m) => {
                    const src = resolveAvatarUrl(m.message);
                    return (
                      <div
                        key={m._id}
                        className="ci-media-thumb"
                        onClick={() => onSelect("media")}
                      >
                        {m.mimetype?.startsWith("image/") ? (
                          <img src={src} alt={m.filename || "media"} />
                        ) : (
                          <video src={src} muted />
                        )}
                      </div>
                    );
                  })}
              </div>
            )}

            <button
              type="button"
              className="ci-ActionRow"
              onClick={() => onSelect("docs")}
            >
              <FileText size={19} className="ci-row-icon" />
              <span className="ci-row-text">Docs</span>
              <ChevronRight size={18} className="ci-row-arrow" />
            </button>

            <button
              type="button"
              className="ci-ActionRow"
              onClick={() => onSelect("links")}
            >
              <Link2 size={19} className="ci-row-icon" />
              <span className="ci-row-text">Links</span>
              <ChevronRight size={18} className="ci-row-arrow" />
            </button>
          </section>

          {/* Chat Settings & Actions */}
          <section className="ci-card ci-links-group">
            <button
              type="button"
              className="ci-ActionRow"
              onClick={() => onSelect("mute notification")}
            >
              <VolumeX size={19} className="ci-row-icon" />
              <span className="ci-row-text">Mute notifications</span>
              <ChevronRight size={18} className="ci-row-arrow" />
            </button>

            <button
              type="button"
              className="ci-ActionRow"
              onClick={() => onSelect("disappearing message")}
            >
              <Clock size={19} className="ci-row-icon" />
              <span className="ci-row-text">Disappearing messages</span>
              <ChevronRight size={18} className="ci-row-arrow" />
            </button>

            <button
              type="button"
              className="ci-ActionRow"
              onClick={onToggleFavourite}
            >
              {favouriteLabel === "Remove From Favourites" ? (
                <BellOff size={19} className="ci-row-icon" />
              ) : (
                <Bell size={19} className="ci-row-icon" />
              )}
              <span className="ci-row-text">{favouriteLabel}</span>
            </button>

            <button
              type="button"
              className="ci-ActionRow ci-ActionRow--danger"
              onClick={() => onSelect("clear chat")}
            >
              <Trash2 size={19} className="ci-row-icon" />
              <span className="ci-row-text">Clear chat</span>
            </button>
          </section>
        </div>
      </div>
    </aside>
  );
};