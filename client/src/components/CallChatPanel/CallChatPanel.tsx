import { useEffect, useRef, useState } from "react";
import EmojiPicker from "emoji-picker-react";
import { MessageCircle, X, Send, Smile, MoreVertical, Copy, Pencil, Trash2, Eye, Heart, CornerUpLeft } from "lucide-react";
import { useInCallChat, type CallChatMessage } from "../../hooks/use.inCallChat.hook";
import "./CallChatPanel.css";

interface Props {
    callId:string;
    groupId:string;
    senderId:string;
    getMemberName:(id:string)=>string;
    onClose?:()=>void;
}

export function CallChatPanel({ callId, groupId, senderId, getMemberName, onClose }: Props) {
    const {
        messages, viewedByList,
        sendMessage, sendReply, deleteMessage, editMessage,
        toggleLike, toggleReaction, markViewed, fetchViewedBy,
    } = useInCallChat(callId, groupId, senderId);

    const [isOpen, setIsOpen] = useState(true);
    const [unread, setUnread] = useState(0);
    const [text, setText] = useState("");
    const [replyTarget, setReplyTarget] = useState<CallChatMessage | null>(null);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [editText, setEditText] = useState("");
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
            setUnread(u => u + (messages.length - prevCount.current));
        }
        prevCount.current = messages.length;
    }, [messages.length, isOpen]);

    useEffect(() => {
        if (isOpen) {
            markViewed();
            setUnread(0);
            bottomRef.current?.scrollIntoView({ behavior: "smooth" });
        }
    }, [isOpen, messages.length]);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (reactionRef.current && !reactionRef.current.contains(e.target as Node)) setReactionFor(null);
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (reactionDetailRef.current && !reactionDetailRef.current.contains(e.target as Node)) setReactionDetailFor(null);
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (likersRef.current && !likersRef.current.contains(e.target as Node)) setLikersFor(null);
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (viewedByRef.current && !viewedByRef.current.contains(e.target as Node)) setViewedByFor(null);
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

    const handleSend = () => {
        if (!text.trim()) return;
        if (replyTarget) sendReply(text.trim(), replyTarget);
        else sendMessage(text.trim());
        setText("");
        setReplyTarget(null);
    };

    const handleOpenViewedBy = (msgId: string) => {
        fetchViewedBy(msgId);
        setViewedByFor(msgId);
    };

    const handleClosePanel = () => {
        setIsOpen(false);
        onClose?.();
    };

    return (
        <>
            {!isOpen && (
                <button className="callChatToggleBtn" onClick={() => setIsOpen(true)}>
                    <MessageCircle size={20} />
                    {unread > 0 && <span className="callChatUnreadBadge">{unread > 99 ? "99+" : unread}</span>}
                </button>
            )}

            {isOpen && (
                <div className="callChatPanel">
                    <div className="callChatHeader">
                        <span>Call Chat</span>
                        <button onClick={handleClosePanel}><X size={18} /></button>
                    </div>

                    <div className="callChatBody">
                        {messages.map((msg) => {
                            const msgSenderId = typeof msg.senderId === "object" ? msg.senderId._id : msg.senderId;
                            const isSender = msgSenderId?.toString() === senderId?.toString();
                            const isDeleted = msg.message === "This Message Was Deleted";
                            const parent = msg.parentReply?.[0];
                            const likedByMe = msg.toggleLike?.includes(senderId);

                            return (
                                <div key={msg._id} className={`callChatMsgRow ${isSender ? "sender" : "receiver"}`}>
                                    {!isDeleted && (
                                        <div className="callChatLikeBlock">
                                            <button
                                                className={`callChatLikeBtn ${likedByMe ? "liked" : ""}`}
                                                onClick={() => toggleLike(msg._id)}
                                            >
                                                <Heart size={14} fill={likedByMe ? "#ff3040" : "none"} />
                                            </button>
                                            {msg.toggleLike?.length > 0 && (
                                                <span
                                                    className="callChatLikeCount"
                                                    onClick={() => !isSender && setLikersFor(msg._id)}
                                                >
                                                    {msg.toggleLike.length}
                                                </span>
                                            )}
                                            {!isSender && likersFor === msg._id && (
                                                <div className="callChatLikersPopup" ref={likersRef}>
                                                    {msg.toggleLike.map(uid => (
                                                        <div key={uid}>{uid === senderId ? "You" : getMemberName(uid)}</div>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    <div className={`callChatBubble${msg.reaction?.length > 0 ? " hasReactions" : ""}`}>
                                        {!isSender && (
                                            <span className="callChatSenderName">
                                                {typeof msg.senderId === "object" ? msg.senderId.name : getMemberName(msgSenderId)}
                                            </span>
                                        )}

                                        {parent && !isDeleted && (
                                            <div className="callChatQuoted">
                                                <span className="callChatQuotedName">
                                                    {parent.senderId === senderId ? "You" : getMemberName(parent.senderId)}
                                                </span>
                                                <span className="callChatQuotedText">{parent.message}</span>
                                            </div>
                                        )}

                                        <p className={`callChatText ${isDeleted ? "deleted" : ""}`}>{msg.message}</p>

                                        {msg.isEdited && !isDeleted && <span className="callChatEdited">edited</span>}

                                        {!isDeleted && (
                                            <div className="callChatMsgActions">
                                                <button onClick={() => setReplyTarget(msg)} title="Reply">
                                                    <CornerUpLeft size={13} />
                                                </button>
                                                <button onClick={() => setReactionFor(reactionFor === msg._id ? null : msg._id)} title="React">
                                                    <Smile size={13} />
                                                </button>
                                                {isSender && (
                                                    <button onClick={() => handleOpenViewedBy(msg._id)} title="Seen by">
                                                        <Eye size={13} />
                                                    </button>
                                                )}
                                                <div className="callChatMenu">
                                                    <button><MoreVertical size={13} /></button>
                                                    <div className="callChatMenuDropdown">
                                                        <button onClick={() => navigator.clipboard.writeText(msg.message)}>
                                                            <Copy size={12} /> Copy
                                                        </button>
                                                        {isSender && (
                                                            <>
                                                                <button onClick={() => { setEditingId(msg._id); setEditText(msg.message); }}>
                                                                    <Pencil size={12} /> Edit
                                                                </button>
                                                                <button onClick={() => deleteMessage(msg._id)}>
                                                                    <Trash2 size={12} /> Delete for everyone
                                                                </button>
                                                            </>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {reactionFor === msg._id && (
                                            <div
                                                style={{
                                                    position: "fixed",
                                                    inset: 0,
                                                    zIndex: 10000,
                                                    display: "flex",
                                                    alignItems: "center",
                                                    justifyContent: "center",
                                                    background: "rgba(0,0,0,0.4)",
                                                }}
                                            >
                                                <div ref={reactionRef}>
                                                    <EmojiPicker
                                                        width={320}
                                                        height={400}
                                                        onEmojiClick={(e) => { toggleReaction(msg._id, e.emoji); setReactionFor(null); }}
                                                    />
                                                </div>
                                            </div>
                                        )}

                                        {msg.reaction?.length > 0 && (
                                            <div className="callChatReactionBadge" onClick={() => setReactionDetailFor(msg._id)}>
                                                {Object.keys(groupReactions(msg.reaction)).slice(0, 3).map(e => <span key={e}>{e}</span>)}
                                                {msg.reaction.length > 1 && <span className="callChatReactionCount">{msg.reaction.length}</span>}
                                            </div>
                                        )}

                                        {reactionDetailFor === msg._id && msg.reaction?.length > 0 && (
                                            <div className="callChatRxOverlay">
                                                <div className="callChatReactionDetail" ref={reactionDetailRef}>
                                                    <div className="callChatRxHead">
                                                        <span>{msg.reaction.length} reaction{msg.reaction.length > 1 ? "s" : ""}</span>
                                                        <button type="button" onClick={() => setReactionDetailFor(null)}>
                                                            <X size={16} />
                                                        </button>
                                                    </div>

                                                    <div className="callChatRxPills">
                                                        {Object.entries(groupReactions(msg.reaction)).map(([emoji, emojiUsers]) => (
                                                            <div key={emoji} className="callChatRxPill">
                                                                <span>{emoji}</span>
                                                                <span className="callChatRxPillN">{emojiUsers.length}</span>
                                                            </div>
                                                        ))}
                                                    </div>

                                                    <div className="callChatRxDivider" />

                                                    <div className="callChatRxList">
                                                        {msg.reaction.map((r) => {
                                                            const isMe = r.userId === senderId;
                                                            const rName = isMe ? "You" : getMemberName(r.userId);
                                                            return (
                                                                <div
                                                                    key={r._id || r.userId + r.emoji}
                                                                    className={`callChatReactionRow${isMe ? " is-me" : ""}`}
                                                                    onClick={() => { if (isMe) toggleReaction(msg._id, r.emoji); }}
                                                                >
                                                                    <div className="callChatRxAvatar">
                                                                        {rName.charAt(0).toUpperCase()}
                                                                    </div>
                                                                    <div className="callChatRxInfo">
                                                                        <span className="callChatRxName">{rName}</span>
                                                                        {isMe && <span className="callChatRxHint">Tap to remove</span>}
                                                                    </div>
                                                                    <span className="callChatRxEmoji">{r.emoji}</span>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {viewedByFor === msg._id && isSender && (
                                            <div className="callChatRxOverlay">
                                                <div className="callChatViewedByPopup" ref={viewedByRef}>
                                                    <div className="callChatRxHead">
                                                        <span>Seen by</span>
                                                        <button type="button" onClick={() => setViewedByFor(null)}>
                                                            <X size={16} />
                                                        </button>
                                                    </div>
                                                    {viewedByList.filter(u => u._id !== senderId).length === 0 && (
                                                        <div className="callChatSeenEmpty">No one yet</div>
                                                    )}
                                                    {viewedByList.filter(u => u._id !== senderId).map(u => {
                                                        const vName = u.name || u.username || "Unknown";
                                                        return (
                                                            <div key={u._id} className="callChatSeenRow">
                                                                <div className="callChatRxAvatar">
                                                                    {vName.charAt(0).toUpperCase()}
                                                                </div>
                                                                <span className="callChatRxName">{vName}</span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        )}

                                        {editingId === msg._id && (
                                            <div className="callChatEditBox">
                                                <input value={editText} onChange={(e) => setEditText(e.target.value)} autoFocus />
                                                <button onClick={() => { editMessage(msg._id, editText); setEditingId(null); }}>Save</button>
                                                <button onClick={() => setEditingId(null)}>Cancel</button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                        <div ref={bottomRef} />
                    </div>

                    {replyTarget && (
                        <div className="callChatReplyPreview">
                            <div>
                                <span className="callChatQuotedName">
                                    {(typeof replyTarget.senderId === "object" ? replyTarget.senderId._id : replyTarget.senderId) === senderId
                                        ? "You" : getMemberName(typeof replyTarget.senderId === "object" ? replyTarget.senderId._id : replyTarget.senderId)}
                                </span>
                                <span className="callChatQuotedText">{replyTarget.message}</span>
                            </div>
                            <button onClick={() => setReplyTarget(null)}><X size={14} /></button>
                        </div>
                    )}

                    <div className="callChatComposer">
                        <input
                            type="text"
                            placeholder="Message..."
                            value={text}
                            onChange={(e) => setText(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleSend()}
                        />
                        <button onClick={handleSend}><Send size={16} /></button>
                    </div>
                </div>
            )}
        </>
    );
}