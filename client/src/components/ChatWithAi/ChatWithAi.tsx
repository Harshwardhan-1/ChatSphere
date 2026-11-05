import { Children, isValidElement, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import EmojiPicker, { Theme as EmojiTheme } from "emoji-picker-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Sun, Moon, Plus, Pencil, Trash2, Smile, Send, Copy, Check, Search } from "lucide-react";
import { socket } from "../../utils/socket"; 
import "./ChatWithAi.css";

type ChatMsg = {
    _id: string;
    senderId: string;
    chatId: string;
    message: string;
    emoji?: string;
    role?: "user" | "ai";
    createdAt?: string;
};

type ChatListItem = {
    _id: string;
    userId: string;
    message: string;
};

// code block: language ka naam + copy button (GPT / Claude jaisa)
function CodeBlock({ children }: { children?: ReactNode }) {
    const [copied, setCopied] = useState(false);
    const child = Children.toArray(children)[0];
    const props: any = isValidElement(child) ? child.props : {};
    const lang = /language-([\w-]+)/.exec(props.className || "")?.[1] || "code";
    const raw = String(props.children ?? "").replace(/\n$/, "");

    const handleCopy = () => {
        navigator.clipboard.writeText(raw);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    return (
        <div className="ai-code-block">
            <div className="ai-code-head">
                <span>{lang}</span>
                <button type="button" onClick={handleCopy}>
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                    <span>{copied ? "Copied" : "Copy"}</span>
                </button>
            </div>
            <pre>
                <code className={props.className}>{raw}</code>
            </pre>
        </div>
    );
}

// AI ka reply markdown se proper format mein
function MarkdownMessage({ text }: { text: string }) {
    return (
        <div className="ai-md">
            <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                    pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
                    a: ({ children, href }) => (
                        <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>
                    ),
                    table: ({ children }) => (
                        <div className="ai-table-wrap"><table>{children}</table></div>
                    ),
                }}
            >
                {text}
            </ReactMarkdown>
        </div>
    );
}

export function ChatWithAi() {
    const location = useLocation();
    const senderId: string | undefined = location.state?.senderId;

    // GroupChat jaisa hi theme (same localStorage key, same data-theme)
    const [theme, setTheme] = useState<"light" | "dark">(() => {
        const saved = localStorage.getItem("wp-theme");
        if (saved === "dark" || saved === "light") return saved;
        return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
    });

    useEffect(() => {
        document.documentElement.setAttribute("data-theme", theme);
        localStorage.setItem("wp-theme", theme);
    }, [theme]);

    const toggleTheme = () => {
        setTheme((prev) => (prev === "light" ? "dark" : "light"));
    };

    const [chatList, setChatList] = useState<ChatListItem[]>([]);
    const [messages, setMessages] = useState<ChatMsg[]>([]);
    const [activeChatId, setActiveChatId] = useState<string | null>(null);
    const [text, setText] = useState("");
    const [search, setSearch] = useState("");
    const [aiTyping, setAiTyping] = useState(false);
    const [error, setError] = useState("");

    const [reactionMessage, setReactionMessage] = useState<string | null>(null);
    const [showReactionDetail, setShowReactionDetail] = useState<string | null>(null);
    const reactionRef = useRef<HTMLDivElement | null>(null);
    const reactionDetailRef = useRef<HTMLDivElement | null>(null);

    const activeChatIdRef = useRef<string | null>(null);
    const chatListRef = useRef<ChatListItem[]>([]);
    const pendingMsgRef = useRef<string>("");
    const bottomRef = useRef<HTMLDivElement | null>(null);

    chatListRef.current = chatList;

    // ek chat kholo aur uske messages mangao
    const openChat = useCallback((chatId: string) => {
        activeChatIdRef.current = chatId;
        setActiveChatId(chatId);
        setMessages([]);
        setError("");
        setReactionMessage(null);
        setShowReactionDetail(null);
        if (senderId) {
            socket.emit("get_all_chat_message", { senderId, chatId });
        }
    }, [senderId]);

    useEffect(() => {
        if (!senderId) return;

        const onChatList = (list: ChatListItem[]) => {
            setChatList(list); 
            if (!activeChatIdRef.current && list.length > 0) {
                openChat(list[0]._id);
            }
        };

        const onChatCreated = (item: ChatListItem) => {
            setChatList((prev) => [item, ...prev.filter((c) => c._id !== item._id)]);
            activeChatIdRef.current = item._id;
            setActiveChatId(item._id);
            setMessages([]);
            const pending = pendingMsgRef.current;
            pendingMsgRef.current = "";
            if (pending) {
                socket.emit("create_prompt_msg", { senderId, chatId: item._id, message: pending });
            }
        };

        const onMsgCreated = (msg: ChatMsg) => {
            if (msg.role === "ai") setAiTyping(false);
            if (msg.chatId !== activeChatIdRef.current) return;
            setMessages((prev) => (prev.some((m) => m._id === msg._id) ? prev : [...prev, msg]));
        };

        const onAllMessages = (list: ChatMsg[]) => {
            const cid = activeChatIdRef.current;
            setMessages(list.filter((m) => m.chatId === cid));
        };

        const onMsgDeleted = (data: { msgId: string }) => {
            setMessages((prev) => prev.filter((m) => m._id !== data.msgId));
        };

        const onMovedTop = (item: ChatListItem) => {
            setChatList((prev) => [item, ...prev.filter((c) => c._id !== item._id)]);
        };

        const onListItemDeleted = (data: { chatlistId: string }) => {
            const list = chatListRef.current;
            const idx = list.findIndex((c) => c._id === data.chatlistId);
            const remaining = list.filter((c) => c._id !== data.chatlistId);
            setChatList(remaining);

            if (activeChatIdRef.current === data.chatlistId) {
                const next = remaining[Math.max(idx - 1, 0)];
                if (next) {
                    openChat(next._id);
                } else {
                    activeChatIdRef.current = null;
                    setActiveChatId(null);
                    setMessages([]);
                }
            }
        };

        const onListItemRenamed = (data: { chatListId: string; name: string }) => {
            setChatList((prev) =>
                prev.map((c) => (c._id === data.chatListId ? { ...c, message: data.name } : c))
            );
        };

        const onReaction = (msg: ChatMsg) => {
            setMessages((prev) => prev.map((m) => (m._id === msg._id ? msg : m)));
        };

        const onError = (err: string) => {
            setError(err);
            setAiTyping(false);
            pendingMsgRef.current = "";
        };

        socket.on("all_chat_list_title", onChatList);
        socket.on("prompt_chat_list_msg", onChatCreated);
        socket.on("msg_created", onMsgCreated);
        socket.on("all_chat_message", onAllMessages);
        socket.on("prompt_msg_deleted", onMsgDeleted);
        socket.on("chat_list_moved_up", onMovedTop);
        socket.on("chat_list_item_deleted", onListItemDeleted);
        socket.on("chat_list_item_renamed", onListItemRenamed);
        socket.on("ai_chat_reaction", onReaction);
        socket.on("prompt_error", onError);

        socket.emit("get_all_chat_list", { senderId });

        return () => {
            socket.off("all_chat_list_title", onChatList);
            socket.off("prompt_chat_list_msg", onChatCreated);
            socket.off("msg_created", onMsgCreated);
            socket.off("all_chat_message", onAllMessages);
            socket.off("prompt_msg_deleted", onMsgDeleted);
            socket.off("chat_list_moved_up", onMovedTop);
            socket.off("chat_list_item_deleted", onListItemDeleted);
            socket.off("chat_list_item_renamed", onListItemRenamed);
            socket.off("ai_chat_reaction", onReaction);
            socket.off("prompt_error", onError);
        };
    }, [senderId, openChat]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (reactionRef.current && !reactionRef.current.contains(event.target as Node)) {
                setReactionMessage(null);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (reactionDetailRef.current && !reactionDetailRef.current.contains(event.target as Node)) {
                setShowReactionDetail(null);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages, aiTyping]);

    const handleSend = () => {
        const msg = text.trim();
        if (!msg || aiTyping || !senderId) return;

        setText("");
        setError("");
        setAiTyping(true);

        if (!activeChatId) {
            pendingMsgRef.current = msg;
            socket.emit("create_chat_list_msg", { senderId, message: msg });
        } else {
            socket.emit("create_prompt_msg", { senderId, chatId: activeChatId, message: msg });
        }
    };

    const handleNewChat = () => {
        activeChatIdRef.current = null;
        setActiveChatId(null);
        setMessages([]);
        setError("");
    };

    const handleSelectChat = (chatId: string) => {
        if (chatId === activeChatId) return;
        openChat(chatId);
    };

    const handleRename = (item: ChatListItem) => {
        const name = window.prompt("Rename chat", item.message);
        if (!name || !name.trim() || name.trim() === item.message) return;
        socket.emit("rename_chat_list_item", { senderId, chatListId: item._id, name: name.trim() });
    };

    const handleDeleteChat = (item: ChatListItem) => {
        if (!window.confirm("Delete this chat and all its messages?")) return;
        socket.emit("delete_chat_list_item", { senderId, chatlistId: item._id });
    };

    const handleDeleteMsg = (msgId: string) => {
        socket.emit("delete_prompt_msg", { senderId, msgId });
    };

    const handleEmojiReaction = (msgId: string, emoji: string) => {
        socket.emit("prompt_reaction", { senderId, msgId, emoji });
    };

    const handleRemoveReaction = (msgId: string, currentEmoji: string) => {
        handleEmojiReaction(msgId, currentEmoji);
        setShowReactionDetail(null);
    };

    if (!senderId) {
        return <h2 className="ai-no-user">senderId nahi mila. Pehle login karke aao.</h2>;
    }

    const activeTitle = chatList.find((c) => c._id === activeChatId)?.message ?? "New chat";

    // title se search
    const q = search.trim().toLowerCase();
    const filteredChats = q
        ? chatList.filter((c) => (c.message || "").toLowerCase().includes(q))
        : chatList;

    return (
        <div className="ai-layout" data-theme={theme}>
            <aside className="ai-sidebar">
                <div className="ai-sidebar-top">
                    <h3>AI Chat</h3>
                    <button
                        type="button"
                        className="ai-icon-btn"
                        onClick={toggleTheme}
                        title={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
                    >
                        {theme === "dark" ? <Sun size={19} /> : <Moon size={19} />}
                    </button>
                </div>

                <button className="ai-new-chat" onClick={handleNewChat}>
                    <Plus size={18} />
                    <span>New chat</span>
                </button>

                <div className="ai-search">
                    <Search size={16} />
                    <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search chats"
                    />
                </div>

                <div className="ai-chat-list">
                    {filteredChats.map((item) => (
                        <div
                            key={item._id}
                            className={`ai-chat-item${item._id === activeChatId ? " active" : ""}`}
                            onClick={() => handleSelectChat(item._id)}
                        >
                            <span className="ai-chat-title">{item.message}</span>
                            <span className="ai-chat-actions">
                                <button
                                    title="Rename"
                                    aria-label="Rename chat"
                                    onClick={(e) => { e.stopPropagation(); handleRename(item); }}
                                ><Pencil size={15} /></button>
                                <button
                                    title="Delete"
                                    aria-label="Delete chat"
                                    onClick={(e) => { e.stopPropagation(); handleDeleteChat(item); }}
                                ><Trash2 size={15} /></button>
                            </span>
                        </div>
                    ))}
                    {chatList.length === 0 && <p className="ai-side-empty">No chats yet</p>}
                    {chatList.length > 0 && filteredChats.length === 0 && (
                        <p className="ai-side-empty">No chats found</p>
                    )}
                </div>
            </aside>

            <main className="ai-main">
                <header className="ai-header">
                    <span className="ai-header-title">{activeTitle}</span>
                    <button
                        type="button"
                        className="ai-icon-btn"
                        onClick={toggleTheme}
                        title={theme === "dark" ? "Light Mode" : "Dark Mode"}
                    >
                        {theme === "dark" ? <Sun size={20} /> : <Moon size={20} />}
                    </button>
                </header>

                <div className="ai-messages">
                    {messages.length === 0 && !aiTyping && (
                        <p className="ai-empty">Type a message below to start the chat.</p>
                    )}

                    {messages.map((m) => (
                        <div key={m._id} className={`ai-msg-row ${m.role === "ai" ? "ai" : "me"}`}>
                            <div className={`ai-bubble${m.emoji ? " has-rx" : ""}`}>
                                <div className="ai-msg-tools">
                                    <button
                                        className="ai-tool-btn"
                                        title="React"
                                        aria-label="React to message"
                                        onClick={(e) => { e.stopPropagation(); setReactionMessage(m._id); }}
                                    ><Smile size={15} /></button>
                                    <button
                                        className="ai-tool-btn"
                                        title="Delete message"
                                        aria-label="Delete message"
                                        onClick={() => handleDeleteMsg(m._id)}
                                    ><Trash2 size={15} /></button>
                                </div>

                                {m.role === "ai" ? (
                                    <MarkdownMessage text={m.message} />
                                ) : (
                                    <div className="ai-text">{m.message}</div>
                                )}

                                {m.emoji && (
                                    <div
                                        className="ai-reaction-badge"
                                        onClick={(e) => { e.stopPropagation(); setShowReactionDetail(m._id); }}
                                    >
                                        <span>{m.emoji}</span>
                                    </div>
                                )}
                            </div>

                            {/* emoji picker popup */}
                            {reactionMessage === m._id && (
                                <div className="ai-emoji-popup" ref={reactionRef}>
                                    <EmojiPicker
                                        theme={theme === "dark" ? EmojiTheme.DARK : EmojiTheme.LIGHT}
                                        onEmojiClick={(emojiData) => {
                                            handleEmojiReaction(m._id, emojiData.emoji);
                                            setReactionMessage(null);
                                        }}
                                    />
                                </div>
                            )}

                            {/* reaction detail popup */}
                            {showReactionDetail === m._id && m.emoji && (
                                <div className="ai-reaction-detail" ref={reactionDetailRef}>
                                    <div className="ai-reaction-detail-header">1 reaction</div>

                                    <div className="ai-reaction-pills-row">
                                        <button
                                            className="ai-add-reaction-pill"
                                            onClick={(e) => { e.stopPropagation(); setReactionMessage(m._id); }}
                                        >
                                            <Smile size={15} />
                                            <Plus size={12} />
                                        </button>
                                        <div className="ai-reaction-pill">
                                            <span>{m.emoji}</span>
                                            <span>1</span>
                                        </div>
                                    </div>

                                    <div className="ai-reaction-divider" />

                                    <div
                                        className="ai-reaction-user-row"
                                        onClick={(e) => { e.stopPropagation(); handleRemoveReaction(m._id, m.emoji as string); }}
                                    >
                                        <div className="ai-reaction-avatar">Y</div>
                                        <div className="ai-reaction-user-info">
                                            <span className="ai-reaction-user-name">You</span>
                                            <span className="ai-reaction-remove-hint">Click to remove</span>
                                        </div>
                                        <span className="ai-reaction-emoji-large">{m.emoji}</span>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}

                    {aiTyping && (
                        <div className="ai-msg-row ai">
                            <div className="ai-bubble ai-typing" aria-live="polite">
                                <span></span><span></span><span></span>
                            </div>
                        </div>
                    )}
                    <div ref={bottomRef} />
                </div>

                {error && <div className="ai-error">{error}</div>}

                <div className="ai-input-bar">
                    <input
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") handleSend(); }}
                        placeholder="Type your message here"
                    />
                    <button
                        className="ai-send-btn"
                        onClick={handleSend}
                        disabled={aiTyping || !text.trim()}
                        aria-label="Send"
                    >
                        <Send size={18} />
                    </button>
                </div>
            </main>
        </div>
    );
}