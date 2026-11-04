import { useEffect, useRef, useState } from "react";
import EmojiPicker, { Theme as EmojiTheme } from "emoji-picker-react";
import {
    MessageCircle,
    X,
    Send,
    Smile,
    ChevronDown,
    Copy,
    Pencil,
    Trash2,
    Eye,
    Heart,
    CornerUpLeft,
    Plus,
    Check,
} from "lucide-react";
import { useDocsMessage } from "../../hooks/use.docs.message.hook";
import type { DocsChatMessage } from "../../hooks/use.docs.message.hook";
import { renderMessageWithLinks } from "../../utils/linkify/linkify";
import "./DocsChatPanel.css";

interface Props {
    docsId: string;
    senderId: string;
    getMemberName: (id: string) => string;
    theme?: "light" | "dark";
}

const senderColors = ["#e542a3", "#f5793a", "#00a884", "#7c5cff", "#00afaf", "#e64980", "#f76707", "#1c7ed6"];

function getSenderColor(id: string) {
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
        hash = id.charCodeAt(i) + ((hash << 5) - hash);
    }
    return senderColors[Math.abs(hash) % senderColors.length];
}

export function DocsChatPanel({ docsId, senderId, getMemberName, theme = "light" }: Props) {
    const {
        messages, viewedByList,
        sendMessage, sendReply, deleteMessage, editMessage,
        toggleLike, toggleReaction, markViewed, fetchViewedBy,
    } = useDocsMessage(docsId, senderId);

    const [isOpen, setIsOpen] = useState(false);
    const [unread, setUnread] = useState(0);
    const [text, setText] = useState("");
    const [replyTarget, setReplyTarget] = useState<DocsChatMessage | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editText, setEditText] = useState("");
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);
    const [reactionFor, setReactionFor] = useState<string | null>(null);
    const [reactionDetailFor, setReactionDetailFor] = useState<string | null>(null);
    const [likersFor, setLikersFor] = useState<string | null>(null);
    const [viewedByFor, setViewedByFor] = useState<string | null>(null);

    const bottomRef = useRef<HTMLDivElement | null>(null);
    const reactionRef = useRef<HTMLDivElement | null>(null);
    const reactionDetailRef = useRef<HTMLDivElement | null>(null);
    const likersRef = useRef<HTMLDivElement | null>(null);
    const viewedByRef = useRef<HTMLDivElement | null>(null);
    const prevCount = useRef(0);

    useEffect(() => {
        if (!isOpen && messages.length > prevCount.current) {
            setUnread((u) => u + (messages.length - prevCount.current));
        }
        prevCount.current = messages.length;
    }, [messages.length, isOpen]);

    useEffect(() => {
        if (isOpen) {
            markViewed();
            setUnread(0);
            bottomRef.current?.scrollIntoView({ behavior: "smooth" });
        }
    }, [isOpen, messages.length, markViewed]);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (
                reactionRef.current &&
                !reactionRef.current.contains(target) &&
                !target.closest(".dcp-rx-btn") &&
                !target.closest(".dcp-add-rx-pill")
            ) {
                setReactionFor(null);
            }
            if (
                reactionDetailRef.current &&
                !reactionDetailRef.current.contains(target) &&
                !target.closest(".dcp-reaction-badge")
            ) {
                setReactionDetailFor(null);
            }
            if (likersRef.current && !likersRef.current.contains(target)) {
                setLikersFor(null);
            }
            if (viewedByRef.current && !viewedByRef.current.contains(target)) {
                setViewedByFor(null);
            }
            if (!target.closest(".dcp-menu-wrap")) {
                setOpenMenuId(null);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    const groupReactions = (reactions: { userId: string; emoji: string }[] = []) =>
        reactions.reduce((acc, r) => {
            if (!acc[r.emoji]) acc[r.emoji] = [];
            acc[r.emoji].push(r.userId);
            return acc;
        }, {} as Record<string, string[]>);

    const handleSend = (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!text.trim()) return;
        if (replyTarget) sendReply(text.trim(), replyTarget);
        else sendMessage(text.trim());
        setText("");
        setReplyTarget(null);
    };

    const handleOpenViewedBy = (msgId: string) => {
        fetchViewedBy(msgId);
        setViewedByFor(msgId);
        setOpenMenuId(null);
    };

    const nameOf = (id: string) => (id?.toString() === senderId?.toString() ? "You" : getMemberName(id));

    return (
        <>
            <button
                type="button"
                className="docsChatToggleBtn"
                onClick={() => setIsOpen((v) => !v)}
                title="Open Document Chat"
            >
                <MessageCircle size={22} />
                {unread > 0 && <span className="docsChatUnreadBadge">{unread > 99 ? "99+" : unread}</span>}
            </button>

            {isOpen && (
                <div className="docsChatPanel" data-theme={theme}>
                    {/* HEADER */}
                    <div className="docsChatHeader">
                        <div className="docsChatHeaderTitle">
                            <MessageCircle size={18} />
                            <span>Document Chat</span>
                        </div>
                        <button
                            type="button"
                            className="docsChatCloseBtn"
                            onClick={() => setIsOpen(false)}
                            aria-label="Close chat"
                        >
                            <X size={18} />
                        </button>
                    </div>

                    {/* MESSAGES AREA (Exact GroupChat / ChatPage style) */}
                    <div className="docsChatBody">
                        {messages.length === 0 && (
                            <div className="dcp-empty-notice">
                                Messages in this document chat are visible to everyone with document access.
                            </div>
                        )}

                        {messages.map((msg, index) => {
                            const msgSenderId = typeof msg.senderId === "object" ? msg.senderId._id : msg.senderId;
                            const isSender = msgSenderId?.toString() === senderId?.toString();
                            const isDeleted = msg.message === "This Message Is Deleted";
                            const parent = msg.reply?.[0];
                            const likedByMe = msg.toggleLike?.includes(senderId);
                            const hasReactions = !isDeleted && Array.isArray(msg.reaction) && msg.reaction.length > 0;
                            const hasLikes = !isDeleted && Array.isArray(msg.toggleLike) && msg.toggleLike.length > 0;
                            const isMenuOpen = openMenuId === msg._id;
                            const menuOpensUp = messages.length > 3 && index >= messages.length - 2;

                            const timeText = msg.createdAt
                                ? new Date(msg.createdAt).toLocaleTimeString([], {
                                      hour: "numeric",
                                      minute: "2-digit",
                                      hour12: true,
                                  })
                                : "";

                            return (
                                <div
                                    key={msg._id || index}
                                    className={`dcp-message ${isSender ? "sender" : "receiver"}${
                                        hasReactions || hasLikes ? " has-badges" : ""
                                    }`}
                                >
                                    {/* HOVER FLOATING ACTIONS (Smile, Reply, Like, Menu) */}
                                    {!isDeleted && (
                                        <div className="dcp-hover-bar">
                                            <button
                                                type="button"
                                                className="dcp-action-circle dcp-rx-btn"
                                                title="React"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setOpenMenuId(null);
                                                    setReactionFor(reactionFor === msg._id ? null : msg._id);
                                                }}
                                            >
                                                <Smile size={15} />
                                            </button>

                                            <button
                                                type="button"
                                                className="dcp-action-circle"
                                                title="Reply"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setReplyTarget(msg);
                                                }}
                                            >
                                                <CornerUpLeft size={15} />
                                            </button>

                                            <button
                                                type="button"
                                                className={`dcp-action-circle ${likedByMe ? "liked" : ""}`}
                                                title="Like"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    toggleLike(msg._id);
                                                }}
                                            >
                                                <Heart size={14} fill={likedByMe ? "#ea0038" : "none"} />
                                            </button>

                                            <div className={`dcp-menu-wrap${isMenuOpen ? " open" : ""}${menuOpensUp ? " up" : ""}`}>
                                                <button
                                                    type="button"
                                                    className="dcp-action-circle"
                                                    title="Options"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setReactionFor(null);
                                                        setOpenMenuId(isMenuOpen ? null : msg._id);
                                                    }}
                                                >
                                                    <ChevronDown size={15} />
                                                </button>

                                                {isMenuOpen && (
                                                    <div className="dcp-menu-dropdown" onClick={(e) => e.stopPropagation()}>
                                                        <div
                                                            className="dcp-menu-item"
                                                            onClick={() => {
                                                                setReplyTarget(msg);
                                                                setOpenMenuId(null);
                                                            }}
                                                        >
                                                            <CornerUpLeft size={15} />
                                                            <span>Reply</span>
                                                        </div>
                                                        <div
                                                            className="dcp-menu-item"
                                                            onClick={() => {
                                                                navigator.clipboard.writeText(msg.message);
                                                                setOpenMenuId(null);
                                                            }}
                                                        >
                                                            <Copy size={15} />
                                                            <span>Copy</span>
                                                        </div>
                                                        {isSender && (
                                                            <>
                                                                <div
                                                                    className="dcp-menu-item"
                                                                    onClick={() => {
                                                                        setEditingId(msg._id);
                                                                        setEditText(msg.message);
                                                                        setOpenMenuId(null);
                                                                    }}
                                                                >
                                                                    <Pencil size={15} />
                                                                    <span>Edit</span>
                                                                </div>
                                                                <div
                                                                    className="dcp-menu-item"
                                                                    onClick={() => handleOpenViewedBy(msg._id)}
                                                                >
                                                                    <Eye size={15} />
                                                                    <span>Seen by</span>
                                                                </div>
                                                                <div
                                                                    className="dcp-menu-item danger"
                                                                    onClick={() => {
                                                                        deleteMessage(msg._id);
                                                                        setOpenMenuId(null);
                                                                    }}
                                                                >
                                                                    <Trash2 size={15} />
                                                                    <span>Delete</span>
                                                                </div>
                                                            </>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* SENDER NAME */}
                                    {!isSender && (
                                        <span
                                            className="dcp-sender-name"
                                            style={{ color: getSenderColor(msgSenderId?.toString() || "") }}
                                        >
                                            {typeof msg.senderId === "object" ? msg.senderId.name : getMemberName(msgSenderId)}
                                        </span>
                                    )}

                                    {/* QUOTED REPLY BLOCK */}
                                    {parent && !isDeleted && (
                                        <div className="dcp-quoted">
                                            <span className="dcp-quoted-name">{nameOf(parent.senderId)}</span>
                                            <span className="dcp-quoted-text">{parent.message}</span>
                                        </div>
                                    )}

                                    {/* MESSAGE CONTENT OR INLINE EDIT */}
                                    {editingId === msg._id ? (
                                        <div className="dcp-inline-edit" onClick={(e) => e.stopPropagation()}>
                                            <input
                                                type="text"
                                                value={editText}
                                                onChange={(e) => setEditText(e.target.value)}
                                                autoFocus
                                            />
                                            <div className="dcp-inline-edit-actions">
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        if (editText.trim()) {
                                                            editMessage(msg._id, editText.trim());
                                                        }
                                                        setEditingId(null);
                                                    }}
                                                >
                                                    <Check size={13} /> Save
                                                </button>
                                                <button type="button" onClick={() => setEditingId(null)}>
                                                    Cancel
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            <span className={`dcp-text ${isDeleted ? "deleted" : ""}`}>
                                                {isDeleted ? msg.message : renderMessageWithLinks(msg.message)}
                                            </span>
                                            <span className="dcp-meta">
                                                {msg.isEdited && !isDeleted && <span className="dcp-edited">edited</span>}
                                                {timeText && <span className="dcp-time">{timeText}</span>}
                                            </span>
                                        </>
                                    )}

                                    {/* BOTTOM REACTION & LIKE PILLS */}
                                    {(hasReactions || hasLikes) && (
                                        <div className="dcp-badges-row">
                                            {hasReactions && (
                                                <div
                                                    className="dcp-reaction-badge"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setReactionDetailFor(
                                                            reactionDetailFor === msg._id ? null : msg._id
                                                        );
                                                    }}
                                                >
                                                    {Object.keys(groupReactions(msg.reaction))
                                                        .slice(0, 3)
                                                        .map((e) => (
                                                            <span key={e}>{e}</span>
                                                        ))}
                                                    {msg.reaction.length > 1 && (
                                                        <span className="dcp-badge-count">{msg.reaction.length}</span>
                                                    )}
                                                </div>
                                            )}

                                            {hasLikes && (
                                                <div
                                                    className={`dcp-like-badge ${likedByMe ? "liked" : ""}`}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setLikersFor(likersFor === msg._id ? null : msg._id);
                                                    }}
                                                >
                                                    <Heart size={12} fill="#ea0038" color="#ea0038" />
                                                    <span className="dcp-badge-count">{msg.toggleLike.length}</span>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* EMOJI PICKER OVERLAY */}
                                    {reactionFor === msg._id && (
                                        <div
                                            className="dcp-overlay"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setReactionFor(null);
                                            }}
                                        >
                                            <div
                                                className="dcp-emoji-popup"
                                                ref={reactionRef}
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                <EmojiPicker
                                                    theme={theme === "dark" ? EmojiTheme.DARK : EmojiTheme.LIGHT}
                                                    onEmojiClick={(e) => {
                                                        toggleReaction(msg._id, e.emoji);
                                                        setReactionFor(null);
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    )}

                                    {/* REACTION DETAIL POPUP */}
                                    {reactionDetailFor === msg._id && hasReactions && (
                                        <div
                                            className="dcp-overlay"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setReactionDetailFor(null);
                                            }}
                                        >
                                            <div
                                                className="dcp-modal-card"
                                                ref={reactionDetailRef}
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                <div className="dcp-modal-header">
                                                    <span>
                                                        {msg.reaction.length} reaction{msg.reaction.length > 1 ? "s" : ""}
                                                    </span>
                                                    <button
                                                        type="button"
                                                        className="dcp-modal-close"
                                                        onClick={() => setReactionDetailFor(null)}
                                                    >
                                                        <X size={16} />
                                                    </button>
                                                </div>
                                                <div className="dcp-pills-row">
                                                    <button
                                                        type="button"
                                                        className="dcp-add-rx-pill"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setReactionDetailFor(null);
                                                            setReactionFor(msg._id);
                                                        }}
                                                    >
                                                        <Smile size={14} />
                                                        <Plus size={11} />
                                                    </button>
                                                    {Object.entries(groupReactions(msg.reaction)).map(
                                                        ([emoji, emojiUsers]) => (
                                                            <div key={emoji} className="dcp-rx-pill">
                                                                <span>{emoji}</span>
                                                                <span className="dcp-rx-pill-count">
                                                                    {emojiUsers.length}
                                                                </span>
                                                            </div>
                                                        )
                                                    )}
                                                </div>
                                                <div className="dcp-modal-divider" />
                                                <div className="dcp-modal-list">
                                                    {msg.reaction.map((r, rIdx) => {
                                                        const isMe = r.userId?.toString() === senderId?.toString();
                                                        const uName = nameOf(r.userId);
                                                        return (
                                                            <div
                                                                key={r._id || `${r.userId}-${rIdx}`}
                                                                className={`dcp-modal-row ${isMe ? "is-me" : ""}`}
                                                                onClick={() => {
                                                                    if (isMe) {
                                                                        toggleReaction(msg._id, r.emoji);
                                                                        setReactionDetailFor(null);
                                                                    }
                                                                }}
                                                            >
                                                                <div
                                                                    className="dcp-modal-avatar"
                                                                    style={{
                                                                        backgroundColor: isMe
                                                                            ? "#00a884"
                                                                            : getSenderColor(r.userId || ""),
                                                                    }}
                                                                >
                                                                    {uName.charAt(0).toUpperCase()}
                                                                </div>
                                                                <div className="dcp-modal-user-info">
                                                                    <span className="dcp-modal-user-name">{uName}</span>
                                                                    {isMe && (
                                                                        <span className="dcp-modal-hint">
                                                                            Tap to remove
                                                                        </span>
                                                                    )}
                                                                </div>
                                                                <span className="dcp-modal-emoji">{r.emoji}</span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* LIKERS POPUP */}
                                    {likersFor === msg._id && hasLikes && (
                                        <div
                                            className="dcp-overlay"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setLikersFor(null);
                                            }}
                                        >
                                            <div
                                                className="dcp-modal-card"
                                                ref={likersRef}
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                <div className="dcp-modal-header">
                                                    <span>Liked by ({msg.toggleLike.length})</span>
                                                    <button
                                                        type="button"
                                                        className="dcp-modal-close"
                                                        onClick={() => setLikersFor(null)}
                                                    >
                                                        <X size={16} />
                                                    </button>
                                                </div>
                                                <div className="dcp-modal-divider" />
                                                <div className="dcp-modal-list">
                                                    {msg.toggleLike.map((uid) => {
                                                        const uName = nameOf(uid);
                                                        return (
                                                            <div key={uid} className="dcp-modal-row">
                                                                <div
                                                                    className="dcp-modal-avatar"
                                                                    style={{ backgroundColor: getSenderColor(uid) }}
                                                                >
                                                                    {uName.charAt(0).toUpperCase()}
                                                                </div>
                                                                <div className="dcp-modal-user-info">
                                                                    <span className="dcp-modal-user-name">{uName}</span>
                                                                </div>
                                                                <Heart size={15} fill="#ea0038" color="#ea0038" />
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* VIEWED BY POPUP */}
                                    {viewedByFor === msg._id && isSender && (
                                        <div
                                            className="dcp-overlay"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                setViewedByFor(null);
                                            }}
                                        >
                                            <div
                                                className="dcp-modal-card"
                                                ref={viewedByRef}
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                <div className="dcp-modal-header">
                                                    <span>Seen by</span>
                                                    <button
                                                        type="button"
                                                        className="dcp-modal-close"
                                                        onClick={() => setViewedByFor(null)}
                                                    >
                                                        <X size={16} />
                                                    </button>
                                                </div>
                                                <div className="dcp-modal-divider" />
                                                <div className="dcp-modal-list">
                                                    {viewedByList.filter((u) => u._id !== senderId).length === 0 && (
                                                        <div className="dcp-modal-empty">No one has seen this yet</div>
                                                    )}
                                                    {viewedByList
                                                        .filter((u) => u._id !== senderId)
                                                        .map((u) => (
                                                            <div key={u._id} className="dcp-modal-row">
                                                                <div
                                                                    className="dcp-modal-avatar"
                                                                    style={{ backgroundColor: getSenderColor(u._id) }}
                                                                >
                                                                    {(u.name || "U").charAt(0).toUpperCase()}
                                                                </div>
                                                                <div className="dcp-modal-user-info">
                                                                    <span className="dcp-modal-user-name">
                                                                        {u.name || "Unknown"}
                                                                    </span>
                                                                </div>
                                                            </div>
                                                        ))}
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                        <div ref={bottomRef} />
                    </div>

                    {/* REPLY PREVIEW BAR */}
                    {replyTarget && (
                        <div className="docsChatReplyPreview">
                            <div className="docsChatReplyContent">
                                <span className="dcp-quoted-name">
                                    {nameOf(
                                        typeof replyTarget.senderId === "object"
                                            ? replyTarget.senderId._id
                                            : replyTarget.senderId
                                    )}
                                </span>
                                <span className="dcp-quoted-text">{replyTarget.message}</span>
                            </div>
                            <button
                                type="button"
                                className="docsChatReplyClose"
                                onClick={() => setReplyTarget(null)}
                            >
                                <X size={16} />
                            </button>
                        </div>
                    )}

                    {/* FOOTER COMPOSER */}
                    <form className="docsChatComposer" onSubmit={handleSend}>
                        <input
                            type="text"
                            placeholder="Type a message"
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                        />
                        <button type="submit" disabled={!text.trim()} aria-label="Send message">
                            <Send size={17} />
                        </button>
                    </form>
                </div>
            )}
        </>
    );
}