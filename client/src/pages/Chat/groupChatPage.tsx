import { useState, useRef, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { groupChatHook } from "../../hooks/use.groupChat.hook";
import { usePollHook } from "../../hooks/Use.pole.hook";
import { AddGroupMembersModal } from "../../components/AddGroupMembers/AddGroupMembersModel";
import "./GroupChatPage.css";
import "./GroupChatSelection.css";
import { socket } from "../../utils/socket";
import { MsgInfo } from "../../components/msgInfo/msgInfo";
import EmojiPicker, { Theme as EmojiTheme } from "emoji-picker-react";
import { env } from '../../configs/env.config';
import { showApiError } from "../../utils/showApiError";
import { GroupMedia } from "../../components/GroupMedia/media/media";
import { GroupDocs } from "../../components/GroupMedia/docs/docs";
import { renderMessageWithLinks } from "../../utils/linkify/linkify";
import { GroupLinks } from "../../components/GroupMedia/links/link";
import { GroupMuteNotification } from "../../components/GroupMuteNotification/GroupMuteNotification";
import { GroupDisappearingMessage } from "../../components/GroupDisappearingMessage/GroupDisappearingMessage";
import { GroupProfile } from "../../components/GroupProfile/GroupProfile";
import { ForwardModal } from "../../components/ForwardMessage/ForwardModel";
import { userChatListPresence } from "../../services/user.presence.service";
import { PollMessage } from "../../components/Poll/PollMessage";
import { CreatePollModal } from "../../components/Poll/CreatePollMode";
import { FooterEmoji } from "../../components/FooterEmoji/FooterEmoji";
import {
    Phone,
    Video,
    Paperclip,
    BarChart2,
    Send,
    Plus,
    Sun,
    Moon,
    Trash2,
    Clock,
    VolumeX,
    Image as ImageIcon,
    FileText,
    Link2,
    LogOut,
    Pencil,
    Forward,
    Copy,
    Info,
    EyeOff,
    Smile,
    MoreVertical,
    ChevronDown,
    X,
    Check
} from "lucide-react";
import { groupCall as useGroupCallHook } from "../../hooks/use.group.call.hook";
import axiosInstance from "../../services/axiosInstance";

const senderColors = ["#e542a3", "#f5793a", "#00a884", "#7c5cff", "#00afaf", "#e64980", "#f76707", "#1c7ed6"];

function getSenderColor(id: string) {
    let hash = 0;
    for (let i = 0; i < id.length; i++) {
        hash = id.charCodeAt(i) + ((hash << 5) - hash);
    }
    return senderColors[Math.abs(hash) % senderColors.length];
}

function formatFileSize(sizeInKb?: number) {
    if (sizeInKb === undefined || sizeInKb === null || isNaN(sizeInKb)) return "";
    if (sizeInKb < 1024) return `${Number(sizeInKb).toFixed(2)} KB`;
    return `${(Number(sizeInKb) / 1024).toFixed(2)} MB`;
}

function resolveFileUrl(fileUrl?: string) {
    if (!fileUrl) return "";
    if (fileUrl.startsWith("http://") || fileUrl.startsWith("https://")) return fileUrl;
    return `${env.backendUrl}${fileUrl.startsWith("/") ? "" : "/"}${fileUrl}`;
}

function Tick({ isSeen, isDelivered, isSend }: { isSeen: boolean; isDelivered: boolean; isSend: boolean }) {
    if (isSeen) return <span className="tick tick-seen">✓✓</span>;
    if (isDelivered) return <span className="tick tick-delivered">✓✓</span>;
    if (isSend) return <span className="tick tick-sent">✓</span>;
    return null;
}

export function GroupChat() {
    const location = useLocation();
    const senderId = location.state?.senderId;

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
        setTheme(prev => (prev === "light" ? "dark" : "light"));
    };

    const {
        users,
        allGroupsList,
        sendMessage,
        messages,
        setGroupId,
        handleDeleteFromEveryone,
        handelDeleteFromMy,
        handleEditMessage,
        messageInfo,
        groupEmoji,
        groupFile,
        clearGroupChatUser,
        checkIsCreator,
        deleteGroup,
        exitGroup,
        exitThisGroup,
    } = groupChatHook(senderId);

    const {
        activeCall,
        callError,
        busyGroups,
        startGroupCall,
        joinOngoingCall,
        setCallError,
    } = useGroupCallHook(senderId);

    const {
        pollsById,
        createPoll,
        fetchPollDetails,
        votePoll,
        votePollMultiple,
        updatePollTitle,
        viewPollVotes,
        voteDetails,
    } = usePollHook(senderId);

    const [showModal, setShowModal] = useState(false);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [selectedGroup, setSelectedGroup] = useState<any>(null);
    const [message, setMessage] = useState<string>("");
    const [showMsgInfo, setShowMsgInfo] = useState(false);
    const [selectedMsgId, setSelectedMsgId] = useState<string>("");
    const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
    const [editText, setEditText] = useState<string>("");
    const [reactionMessage, setReactionMessage] = useState<string | null>(null);
    const [showReactionDetail, setShowReactionDetail] = useState<string | null>(null);
    const reactionRef = useRef<HTMLDivElement | null>(null);
    const reactionDetailRef = useRef<HTMLDivElement | null>(null);
    const [isCreator, setIsCreator] = useState<string>("");
    const [groupStatus, setGroupStatus] = useState<boolean>(false);
    const [leavesTheGroup, setLeavesTheGroup] = useState<boolean>(false);
    const [chatLocked, setChatLocked] = useState<boolean>(false);
    const [selectionMode, setSelectionMode] = useState<boolean>(false);
    const [selectedMsgIds, setSelectedMsgIds] = useState<string[]>([]);
    const [showForwardModal, setShowForwardModal] = useState<boolean>(false);
    const [showCreatePoll, setShowCreatePoll] = useState<boolean>(false);
    const [groupLastMessages, setGroupLastMessages] = useState<any[]>([]);
    const [groupPendingCounts, setGroupPendingCounts] = useState<{ id: string; count: number }[]>([]);
    const [showMenu, setShowMenu] = useState<boolean>(false);
    const [openMsgMenuId, setOpenMsgMenuId] = useState<string | null>(null);
    const [activeOption, setActiveOption] = useState<string | null>(null);

    const messagesEndRef = useRef<HTMLDivElement | null>(null);
    const prevGroupIdRef = useRef<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const liveSelectedGroup = allGroupsList?.find((g: any) => g._id === selectedGroup?._id) ?? selectedGroup;

    useEffect(() => {
        if (!senderId) return;

        socket.emit("get_group_last_message_stored", senderId);
        socket.emit("all_pending_messages", senderId);

        const handleAllLastMessages = (data: { groupId: string; lastMessageOfGroup: any }[]) => {
            setGroupLastMessages(data.map(d => d.lastMessageOfGroup));
        };

        const handleGroupChatListUpdate = (data: any) => {
            setGroupLastMessages(prev => {
                const index = prev.findIndex(g => g.groupId === data.groupId);
                if (index !== -1) {
                    const temp = [...prev];
                    temp[index] = data;
                    return temp;
                }
                return [data, ...prev];
            });
        };

        const handlePendingMessages = (data: { id: string; count: number }[]) => {
            setGroupPendingCounts(data);
        };

        socket.on("allLastMessageOfGroups", handleAllLastMessages);
        socket.on("group_chat_list_update", handleGroupChatListUpdate);
        socket.on("allPendingMessage", handlePendingMessages);

        return () => {
            socket.off("allLastMessageOfGroups", handleAllLastMessages);
            socket.off("group_chat_list_update", handleGroupChatListUpdate);
            socket.off("allPendingMessage", handlePendingMessages);
        };
    }, [senderId]);

    useEffect(() => {
        if (!selectedGroup?._id || !senderId) return;

        setGroupId(selectedGroup?._id);
        setGroupStatus(false);
        setLeavesTheGroup(false);
        setIsCreator("");
        setActiveOption(null);
        setShowMenu(false);
        setSelectionMode(false);
        setSelectedMsgIds([]);
        setEditingMsgId(null);
        setShowMsgInfo(false);

        socket.emit("clear_all_pending_messages", ({ _id: selectedGroup._id, senderId: senderId }));
        socket.emit("active_group_user", ({ senderId: senderId, groupId: selectedGroup?._id }));
        socket.emit("previousMessage", { _id: selectedGroup._id, senderId: senderId });
        socket.emit("user_open_group_chat", ({ _id: selectedGroup._id, senderId: senderId }));
        socket.emit("check_group_exist", ({ _id: selectedGroup._id, senderId }));
        socket.emit("check_is_a_member", ({ _id: selectedGroup._id, senderId }));
        socket.emit("is_chat_locked", ({ _id: selectedGroup._id, senderId }));

        socket.on("is_present_in_group", (info: string) => {
            setLeavesTheGroup(info === "true");
        });

        socket.on("group_name_changed", (data: { groupId: string, name: string }) => {
            if (data.groupId === selectedGroup._id) {
                setSelectedGroup((prev: any) => prev ? { ...prev, groupName: data.name } : prev);
            }
        });

        socket.on("group_image_changed", (data: { groupId: string, message: string }) => {
            if (data.groupId === selectedGroup._id) {
                setSelectedGroup((prev: any) => prev ? { ...prev, groupImage: data.message } : prev);
            }
        });

        socket.on("setCreator", (message: string) => {
            if (message === "isGroupCreator") {
                setIsCreator("Delete Group");
            } else {
                setIsCreator("");
            }
        });

        socket.on("group_status", (existance: string) => {
            if (existance === "group not exist") {
                setGroupStatus(true);
            }
        });

        socket.on("group_deleted_successfully", (data: { groupId: string }) => {
            if (data.groupId === selectedGroup._id) {
                setGroupStatus(true);
            }
        });

        socket.on("chat_operation", (permission: string) => {
            if (permission === "chat not locked") {
                setChatLocked(false);
            } else {
                setChatLocked(true);
            }
        });

        socket.on("group_settings_changed", (data: { groupId: string }) => {
            if (data.groupId === selectedGroup._id) {
                socket.emit("is_chat_locked", ({ _id: selectedGroup._id, senderId }));
            }
        });

        return () => {
            socket.emit("not_activeGroupChatUser", ({ senderId: senderId, groupId: selectedGroup?._id }));
            socket.off("setCreator");
            socket.off("group_status");
            socket.off("group_deleted_successfully");
            socket.off("group_name_changed");
            socket.off("group_image_changed");
            socket.off("is_present_in_group");
            socket.off("chat_operation");
            socket.off("group_settings_changed");
        };
    }, [selectedGroup?._id, senderId]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as HTMLElement;

            if (
                reactionRef.current &&
                !reactionRef.current.contains(target) &&
                !target.closest(".wa-rx-btn") &&
                !target.closest(".gc-add-reaction-pill")
            ) {
                setReactionMessage(null);
            }

            if (
                reactionDetailRef.current &&
                !reactionDetailRef.current.contains(target) &&
                !target.closest(".gc-reaction-badge")
            ) {
                setShowReactionDetail(null);
            }

            if (!target.closest(".chatOptions")) {
                setShowMenu(false);
            }

            if (!target.closest(".wa-menu")) {
                setOpenMsgMenuId(null);
            }
        };

        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    useEffect(() => {
        const isNewGroup = prevGroupIdRef.current !== selectedGroup?._id;
        messagesEndRef.current?.scrollIntoView({ behavior: isNewGroup ? "auto" : "smooth" });
        prevGroupIdRef.current = selectedGroup?._id ?? null;
    }, [messages]);

    const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        try {
            if (groupStatus) return;
            if (message.trim().length === 0) {
                alert("message field cannot be empty");
                return;
            }
            sendMessage({ _id: selectedGroup._id, senderId, message, messageType: "text" });
            setMessage('');
        } catch (err) {
            throw err;
        }
    };

    const handleDeleteForEveryone = (_id: string) => {
        if (groupStatus) return;
        handleDeleteFromEveryone({ _id: selectedGroup._id, msgId: _id, senderId });
        setOpenMsgMenuId(null);
    };

    const handleDeleteForMe = (_id: string) => {
        handelDeleteFromMy({ _id: selectedGroup._id, msgId: _id, senderId });
        setOpenMsgMenuId(null);
    };

    const handleEdit = (msg: any) => {
        if (groupStatus) return;
        setEditingMsgId(msg._id);
        setEditText(msg.message);
        setOpenMsgMenuId(null);
    };

    const cancelEdit = () => {
        setEditingMsgId(null);
        setEditText("");
    };

    const saveEdit = (_id: string) => {
        if (groupStatus) return;
        handleEditMessage({ _id: selectedGroup._id, msgId: _id, message: editText, senderId });
        setEditingMsgId(null);
    };

    const handleMsgInfo = (_id: string) => {
        setSelectedMsgId(_id);
        setShowMsgInfo(true);
        messageInfo({ _id: selectedGroup._id, msgId: _id, senderId });
        setOpenMsgMenuId(null);
    };

    const getMemberName = (userId: string) => {
        const person = liveSelectedGroup?.peoplesId?.find((p: any) => {
            const pid = typeof p === "object" ? p._id : p;
            return pid?.toString() === userId?.toString();
        });
        if (person && typeof person === "object" && person.name) return person.name;
        const u = users?.find((usr: any) => usr._id?.toString() === userId?.toString());
        return u?.name || "Unknown";
    };

    const groupReactions = (reactions: { userId: string; emoji: string }[] = []) => {
        return reactions.reduce((acc, r) => {
            if (!acc[r.emoji]) acc[r.emoji] = [];
            acc[r.emoji].push(r.userId);
            return acc;
        }, {} as Record<string, string[]>);
    };

    const handleEmojiReaction = (_id: string, emoji: string) => {
        if (groupStatus) return;
        groupEmoji({ _id: selectedGroup._id, msgId: _id, senderId, emoji });
    };

    const handleRemoveReaction = (msgId: string, currentEmoji: string) => {
        if (groupStatus) return;
        handleEmojiReaction(msgId, currentEmoji);
        setShowReactionDetail(null);
    };

    const startForwardSelection = (msgId: string) => {
        setSelectionMode(true);
        setSelectedMsgIds([msgId]);
        setOpenMsgMenuId(null);
    };

    const toggleMessageSelection = (msgId: string) => {
        setSelectedMsgIds((prev) =>
            prev.includes(msgId) ? prev.filter((id) => id !== msgId) : [...prev, msgId]
        );
    };

    const cancelSelection = () => {
        setSelectionMode(false);
        setSelectedMsgIds([]);
    };

    const openForwardModal = () => {
        if (selectedMsgIds.length === 0) return;
        setShowForwardModal(true);
    };

    // file choose hote hi seedha upload + send (alag se "Send File" nahi)
    const uploadAndSendFile = async (pickedFile: File) => {
        if (groupStatus) return;
        try {
            const formData = new FormData();
            formData.append("file", pickedFile);
            const res = await axiosInstance.post("/upload", formData);
            if (res.data.success) {
                const data = res.data.data;
                groupFile({
                    _id: selectedGroup._id,
                    senderId,
                    message: data.path,
                    messageType: "file",
                    fileUrl: data.path,
                    mimetype: data.mimetype,
                    sizeInKb: Number(data.sizeInKb),
                    sizeInMb: Number(data.sizeInMb),
                    filename: data.name || data.originalname || pickedFile.name,
                    orignalname: data.originalname || data.name || pickedFile.name,
                });
            }
        } catch (err) {
            showApiError(err);
            console.log(err);
        }
    };

    const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
        const picked = e.target.files?.[0];
        e.target.value = ""; // taaki same file dobara bhi choose ho sake
        if (picked) uploadAndSendFile(picked);
    };

    const handleSelect = (value: string) => {
        if (value === "clear chat") {
            setShowMenu(false);
            if (!window.confirm("confirm you want to clear chat")) {
                return;
            }
            clearGroupChatUser({ _id: selectedGroup._id, senderId });
            return;
        }
        if (value === "media") {
            setActiveOption("media");
            setShowMenu(false);
        }
        if (value === "docs") {
            setActiveOption("docs");
            setShowMenu(false);
        }
        if (value === "links") {
            setActiveOption("links");
            setShowMenu(false);
        }
        if (value === "mute notification") {
            if (groupStatus) return;
            setActiveOption("mute notification");
            setShowMenu(false);
        }
        if (value === "disappearing message") {
            if (groupStatus) return;
            setActiveOption("disappearing message");
            setShowMenu(false);
        }
    };

    const emitTheSocket = async () => {
        checkIsCreator({ _id: selectedGroup._id, senderId });
    };

    const handleGroupDelete = async () => {
        if (groupStatus) return;
        setShowMenu(false);
        deleteGroup({ _id: selectedGroup._id, senderId });
    };

    const handleExitAndDelete = async () => {
        setShowMenu(false);
        if (!window.confirm("you will not see this chat anymore confirm you want to delete")) {
            return;
        }
        exitGroup({ _id: selectedGroup._id, senderId });
        setActiveOption(null);
        setSelectedGroup(null);
        setGroupStatus(false);
    };

    const handleExit = async () => {
        setShowMenu(false);
        setActiveOption(null);
        exitThisGroup({ _id: selectedGroup._id, senderId });
    };

    const getGroupDisplayMessage = (last?: any) => {
        if (!last) return "";
        if (last.messageType === "file") {
            const mime = last.mimetype || "";
            if (mime.startsWith("image/")) return "📷 Image";
            if (mime.startsWith("video/")) return "🎥 Video";
            if (mime === "application/pdf") return "📄 PDF";
            return last.orignalname || last.filename || "📎 File";
        }
        if (last.messageType === "poll" || last.messageType === "pole") return "📊 Poll";
        return last.message || "";
    };

    const sortedGroups = [...(allGroupsList || [])].sort((a: any, b: any) => {
        const aLast = groupLastMessages.find(g => g.groupId === a._id);
        const bLast = groupLastMessages.find(g => g.groupId === b._id);
        const aTime = aLast ? new Date(aLast.updatedAt).getTime() : 0;
        const bTime = bLast ? new Date(bLast.updatedAt).getTime() : 0;
        return bTime - aTime;
    });

    const handleCreatePoll = (data: { title: string, selectOptions: boolean, polldata: { msg: string, peoplesId: string[] }[] }) => {
        if (!selectedGroup?._id) return;
        createPoll({ _id: selectedGroup._id, ...data });
    };

    const buildReceiverIds = () => {
        const ids = new Set<string>();
        (liveSelectedGroup?.peoplesId || []).forEach((p: any) => {
            const id = typeof p === "object" ? p._id : p;
            if (id && id.toString() !== senderId?.toString()) ids.add(id.toString());
        });
        (liveSelectedGroup?.admin || []).forEach((a: any) => {
            const id = typeof a === "object" ? a._id : a;
            if (id && id.toString() !== senderId?.toString()) ids.add(id.toString());
        });
        return Array.from(ids);
    };

    const lastCallMessage = [...(messages || [])].reverse().find((m: any) => m.messageType === "call");
    const realtimeBusy = selectedGroup?._id ? busyGroups[selectedGroup._id] : undefined;
    const isCallStillActive =
        realtimeBusy !== undefined
            ? realtimeBusy !== null
            : liveSelectedGroup?.callStatus === "busy";
    const ongoingCallMsgId = isCallStillActive
        ? (realtimeBusy || lastCallMessage?._id || null)
        : null;

    const handleGroupVoiceCall = () => {
        if (groupStatus || leavesTheGroup || !selectedGroup?._id) return;
        const receiverId = buildReceiverIds();
        if (receiverId.length === 0) {
            alert("No other members to call");
            return;
        }
        startGroupCall({ groupId: selectedGroup._id, receiverId, messageType: "voice" });
    };

    const handleGroupVideoCall = () => {
        if (groupStatus || leavesTheGroup || !selectedGroup?._id) return;
        const receiverId = buildReceiverIds();
        if (receiverId.length === 0) {
            alert("No other members to call");
            return;
        }
        startGroupCall({ groupId: selectedGroup._id, receiverId, messageType: "video" });
    };

    return (
        <div className="group-chat" data-theme={theme}>
            {/* LEFT : GROUP LIST */}
            <div className="group-list">
                <div className="group-list-header">
                    <h3>Groups</h3>
                    <div className="group-list-header-actions">
                        <button
                            type="button"
                            className="wp-icon-btn theme-toggle-btn"
                            onClick={toggleTheme}
                            title={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
                        >
                            {theme === "dark" ? <Sun size={19} /> : <Moon size={19} />}
                        </button>
                        <button className="create-group-btn" onClick={() => setShowModal(true)}>
                            <Plus size={18} />
                            <span>Create Group</span>
                        </button>
                    </div>
                </div>
                <div className="group-list-items">
                    {sortedGroups?.map((group: any) => {
                        const last = groupLastMessages.find(g => g.groupId === group._id);
                        const pending = groupPendingCounts.find(p => p.id === group._id);
                        const isActive = selectedGroup?._id === group._id;
                        return (
                            <div
                                key={group._id}
                                className={`group-item ${isActive ? "active" : ""}`}
                                onClick={() => {
                                    setActiveOption(null);
                                    setShowMenu(false);
                                    setSelectedGroup(group);
                                }}
                            >
                                <div className="group-item-avatar">
                                    {group.groupImage ? (
                                        <img src={resolveFileUrl(group.groupImage)} alt={group.groupName} />
                                    ) : (
                                        <span>{group.groupName?.charAt(0)?.toUpperCase()}</span>
                                    )}
                                </div>
                                <div className="group-item-content">
                                    <div className="group-item-top">
                                        <span className="group-item-name">{group.groupName}</span>
                                        <span className="group-item-time">
                                            {last ? userChatListPresence(last?.updatedAt) : ""}
                                        </span>
                                    </div>
                                    <div className="group-item-bottom">
                                        <span className="group-item-last">
                                            {getGroupDisplayMessage(last)}
                                        </span>
                                        {pending && pending.count > 0 && (
                                            <span className="unread-badge">{pending.count > 99 ? "99+" : pending.count}</span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* RIGHT : CHAT */}
            <div className="group-chat-area">
                {!selectedGroup ? (
                    <div className="whatsapp-screen">
                        <img src="/WhatsApp.svg" alt="WhatsApp" />
                        <p className="empty-chat-hint">Select a group to start messaging</p>
                    </div>
                ) : (
                    <div className={`chat-screen ${activeOption ? "has-side-panel" : ""}`}>
                        {/* TOP BAR : HEADER OR SELECTION BAR */}
                        {selectionMode ? (
                            <div className="selectionBar">
                                <button className="selectionCancelBtn" onClick={cancelSelection}>
                                    <X size={20} />
                                </button>
                                <span className="selectionCount">{selectedMsgIds.length} selected</span>
                                <button
                                    className="selectionForwardBtn"
                                    disabled={selectedMsgIds.length === 0}
                                    onClick={openForwardModal}
                                >
                                    <Forward size={20} />
                                </button>
                            </div>
                        ) : (
                            <div className="chatHeader">
                                <div
                                    className="chatHeaderLeft"
                                    onClick={() => setActiveOption(prev => (prev === "profile" ? null : "profile"))}
                                    style={{ cursor: "pointer" }}
                                    title="Click for Group Info & Settings"
                                >
                                    <div className="chat-logo">
                                        {liveSelectedGroup.groupImage ? (
                                            <img src={resolveFileUrl(liveSelectedGroup.groupImage)} alt="group logo" />
                                        ) : (
                                            <span>
                                                {liveSelectedGroup.groupName?.charAt(0)?.toUpperCase()}
                                            </span>
                                        )}
                                    </div>
                                    <div className="chat-header-info">
                                        <h2>{liveSelectedGroup.groupName}</h2>
                                        <p>
                                            {liveSelectedGroup.peoplesId?.map((person: any, index: number) => (
                                                <span key={person._id || index}>
                                                    {person._id === senderId ? "(You)" : person.name}
                                                    {index < liveSelectedGroup.peoplesId.length - 1 ? ", " : ""}
                                                </span>
                                            ))}
                                        </p>
                                    </div>
                                </div>
                                <div className="chatHeaderCallBtns">
                                    <button
                                        type="button"
                                        className="themeToggleHeaderBtn"
                                        onClick={toggleTheme}
                                        title={theme === "dark" ? "Light Mode" : "Dark Mode"}
                                    >
                                        {theme === "dark" ? <Sun size={20} /> : <Moon size={20} />}
                                    </button>
                                    <Phone size={20} className="callIconBtn" onClick={handleGroupVoiceCall} />
                                    <Video size={20} className="callIconBtn" onClick={handleGroupVideoCall} />
                                </div>
                                <div className="chatOptions">
                                    <button
                                        type="button"
                                        className="threeDotBtn"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setShowMenu(prev => !prev);
                                            emitTheSocket();
                                        }}
                                        aria-label="Group options"
                                    >
                                        <MoreVertical size={20} />
                                    </button>
                                    {showMenu && (
                                        <div className="optionsMenu" onClick={(e) => e.stopPropagation()}>
                                            <button type="button" onClick={() => { setActiveOption("profile"); setShowMenu(false); }}>
                                                <Info size={18} />
                                                <span>Group info & settings</span>
                                            </button>
                                            <button type="button" onClick={() => handleSelect("clear chat")}>
                                                <Trash2 size={18} />
                                                <span>Clear chat</span>
                                            </button>
                                            <button type="button" disabled={groupStatus || chatLocked} onClick={() => handleSelect("disappearing message")}>
                                                <Clock size={18} />
                                                <span>Disappearing messages</span>
                                            </button>
                                            <button type="button" disabled={groupStatus} onClick={() => handleSelect("mute notification")}>
                                                <VolumeX size={18} />
                                                <span>Mute notifications</span>
                                            </button>
                                            <button type="button" onClick={() => handleSelect("media")}>
                                                <ImageIcon size={18} />
                                                <span>Media</span>
                                            </button>
                                            <button type="button" onClick={() => handleSelect("docs")}>
                                                <FileText size={18} />
                                                <span>Docs</span>
                                            </button>
                                            <button type="button" onClick={() => handleSelect("links")}>
                                                <Link2 size={18} />
                                                <span>Links</span>
                                            </button>
                                            {!isCreator && !groupStatus && (
                                                <button type="button" className="danger-item" onClick={handleExit} disabled={leavesTheGroup}>
                                                    <LogOut size={18} />
                                                    <span>Leave Group</span>
                                                </button>
                                            )}
                                            {isCreator && (
                                                <button type="button" className="danger-item" disabled={groupStatus} onClick={handleGroupDelete}>
                                                    <Trash2 size={18} />
                                                    <span>Delete Group</span>
                                                </button>
                                            )}
                                            {(groupStatus || leavesTheGroup) && (
                                                <button type="button" className="danger-item" onClick={handleExitAndDelete}>
                                                    <LogOut size={18} />
                                                    <span>Exit Group</span>
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                        {groupStatus && (
                            <div className="groupDeletedBanner">
                                <p>This group no longer exists</p>
                            </div>
                        )}

                        {/* SIDE PANELS / DRAWERS FOR GROUP PROFILE & SETTINGS */}
                        {activeOption && (
                            <div className="group-side-panel-wrapper" key={`${selectedGroup._id}-${activeOption}`}>
                                {activeOption === "media" && (
                                    <GroupMedia
                                        onBack={() => setActiveOption(null)}
                                        _id={selectedGroup._id}
                                        senderId={senderId}
                                    />
                                )}
                                {activeOption === "docs" && (
                                    <GroupDocs
                                        onBack={() => setActiveOption(null)}
                                        _id={selectedGroup._id}
                                        senderId={senderId}
                                    />
                                )}
                                {activeOption === "links" && (
                                    <GroupLinks
                                        onBack={() => setActiveOption(null)}
                                        _id={selectedGroup._id}
                                        senderId={senderId}
                                    />
                                )}
                                {activeOption === "mute notification" && !groupStatus && !leavesTheGroup && (
                                    <GroupMuteNotification
                                        onBack={() => setActiveOption(null)}
                                        _id={selectedGroup._id}
                                        senderId={senderId}
                                    />
                                )}
                                {activeOption === "disappearing message" && !groupStatus && !leavesTheGroup && (
                                    <GroupDisappearingMessage
                                        onBack={() => setActiveOption(null)}
                                        _id={selectedGroup._id}
                                        senderId={senderId}
                                    />
                                )}
                                {activeOption === "profile" && (
                                    <GroupProfile
                                        key={selectedGroup._id}
                                        onBack={() => setActiveOption(null)}
                                        _id={selectedGroup._id}
                                        senderId={senderId}
                                        GroupName={liveSelectedGroup.groupName}
                                        GroupImage={liveSelectedGroup?.groupImage}
                                        leavesTheGroup={leavesTheGroup}
                                        groupStatus={groupStatus}
                                        onNameUpdated={(name: string) =>
                                            setSelectedGroup((prev: any) =>
                                                prev ? { ...prev, groupName: name } : prev
                                            )
                                        }
                                        users={users}
                                    />
                                )}
                            </div>
                        )}

                        <div className="messages-area">
                            {messages?.map((msg: any, index: number) => {
                                const msgSenderId = typeof msg.senderId === "object" ? msg.senderId?._id : msg.senderId;
                                const isSender = msgSenderId?.toString() === senderId?.toString();
                                const isSystem = msg.messageType === "system";
                                const isText = msg.messageType === "text";
                                const isFileMsg = msg.messageType === "file";
                                const isPoll = msg.messageType === "poll";
                                const isVoiceCall = msg.messageType === "call" && msg.message === "voice";
                                const isVideoCall = msg.messageType === "call" && msg.message === "video";
                                const isCallMsg = isVoiceCall || isVideoCall;
                                const isImage = isFileMsg && msg.mimetype?.startsWith("image");
                                const isVideo = isFileMsg && msg.mimetype?.startsWith("video");
                                const isPdf = isFileMsg && msg.mimetype === "application/pdf";
                                const isOtherFile = isFileMsg && !isImage && !isVideo && !isPdf;
                                const fileSrc = isFileMsg ? resolveFileUrl(msg.fileUrl || msg.message) : "";
                                const displayFileName = msg.orignalname || msg.originalname || msg.filename || "file";
                                const isMenuOpen = openMsgMenuId === msg._id;
                                const isReactionOpen = reactionMessage === msg._id;
                                const hasReactions = !isCallMsg && Array.isArray(msg.reaction) && msg.reaction.length > 0;
                                const menuOpensUp = (messages?.length || 0) > 3 && index >= (messages?.length || 0) - 2;

                                if (isSystem) {
                                    return (
                                        <div key={msg._id || index} className="system-message-row">
                                            <div className="system-message">
                                                {msg.message}
                                            </div>
                                        </div>
                                    );
                                }

                                if (isPoll) {
                                    return (
                                        <div
                                            key={msg._id || index}
                                            className={`${isSender ? "message sender" : "message receiver"} poll-message-wrapper`}
                                        >
                                            {!isSender && (
                                                <span className="message-sender-name" style={{ color: getSenderColor(msgSenderId?.toString() || "") }}>
                                                    {typeof msg.senderId === "object" ? msg.senderId?.name : getMemberName(msgSenderId?.toString() || "")}
                                                </span>
                                            )}
                                            <PollMessage
                                                msg={msg}
                                                senderId={senderId}
                                                groupId={selectedGroup._id}
                                                pollsById={pollsById}
                                                fetchPollDetails={fetchPollDetails}
                                                votePoll={votePoll}
                                                votePollMultiple={votePollMultiple}
                                                updatePollTitle={updatePollTitle}
                                                viewPollVotes={viewPollVotes}
                                                voteDetails={voteDetails}
                                            />
                                        </div>
                                    );
                                }

                                return (
                                    <div
                                        key={msg._id || index}
                                        className={`${isSender ? "message sender" : "message receiver"}${isFileMsg ? " media-bubble" : ""}${hasReactions ? " has-reactions" : ""}${selectionMode ? " selectable" : ""}${selectedMsgIds.includes(msg._id) ? " selectedMsg" : ""}`}
                                        onClick={() => { if (selectionMode) toggleMessageSelection(msg._id); }}
                                    >
                                        {selectionMode && (
                                            <input
                                                type="checkbox"
                                                className="messageSelectCheckbox"
                                                checked={selectedMsgIds.includes(msg._id)}
                                                onChange={() => toggleMessageSelection(msg._id)}
                                                onClick={(e) => e.stopPropagation()}
                                            />
                                        )}

                                        {/* SMILE BUTTON & 3-DOT MENU BUTTON */}
                                        {!isCallMsg && !selectionMode && (
                                            <button
                                                type="button"
                                                className={`wa-rx-btn${isReactionOpen ? " active" : ""}`}
                                                disabled={groupStatus || leavesTheGroup}
                                                title="React"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setOpenMsgMenuId(null);
                                                    setShowReactionDetail(null);
                                                    setReactionMessage(prev => (prev === msg._id ? null : msg._id));
                                                }}
                                            >
                                                <Smile size={16} />
                                            </button>
                                        )}

                                        {!isCallMsg && !selectionMode && (
                                            <div className={`wa-menu${isMenuOpen ? " open" : ""}${menuOpensUp ? " up" : ""}`}>
                                                <button
                                                    type="button"
                                                    className="wa-menu-btn"
                                                    title="Message options"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setReactionMessage(null);
                                                        setOpenMsgMenuId(isMenuOpen ? null : msg._id);
                                                    }}
                                                >
                                                    <ChevronDown size={16} />
                                                </button>
                                                {isMenuOpen && (
                                                    <div className="wa-menu-dropdown" onClick={(e) => e.stopPropagation()}>
                                                        {!isSender ? (
                                                            <>
                                                                <div className="wa-menu-item" onClick={(e) => { e.stopPropagation(); startForwardSelection(msg._id); }}>
                                                                    <Forward size={16} />
                                                                    <span>Forward</span>
                                                                </div>
                                                                <div className="wa-menu-item" onClick={() => handleDeleteForMe(msg._id)}>
                                                                    <EyeOff size={16} />
                                                                    <span>Delete for me</span>
                                                                </div>
                                                                {isText && (
                                                                    <div className="wa-menu-item" onClick={() => { navigator.clipboard.writeText(msg.message); setOpenMsgMenuId(null); }}>
                                                                        <Copy size={16} />
                                                                        <span>Copy</span>
                                                                    </div>
                                                                )}
                                                            </>
                                                        ) : (
                                                            <>
                                                                <div className="wa-menu-item" onClick={(e) => { e.stopPropagation(); startForwardSelection(msg._id); }}>
                                                                    <Forward size={16} />
                                                                    <span>Forward</span>
                                                                </div>
                                                                {isText && !groupStatus && !leavesTheGroup && !chatLocked && (
                                                                    <div className="wa-menu-item" onClick={() => handleEdit(msg)}>
                                                                        <Pencil size={16} />
                                                                        <span>Edit</span>
                                                                    </div>
                                                                )}
                                                                <div className="wa-menu-item" onClick={() => handleDeleteForMe(msg._id)}>
                                                                    <EyeOff size={16} />
                                                                    <span>Delete for me</span>
                                                                </div>
                                                                {!groupStatus && !leavesTheGroup && !chatLocked && (
                                                                    <div className="wa-menu-item danger" onClick={() => handleDeleteForEveryone(msg._id)}>
                                                                        <Trash2 size={16} />
                                                                        <span>Delete for everyone</span>
                                                                    </div>
                                                                )}
                                                                <div className="wa-menu-item" onClick={() => handleMsgInfo(msg._id)}>
                                                                    <Info size={16} />
                                                                    <span>Msg Info</span>
                                                                </div>
                                                                {isText && (
                                                                    <div className="wa-menu-item" onClick={() => { navigator.clipboard.writeText(msg.message); setOpenMsgMenuId(null); }}>
                                                                        <Copy size={16} />
                                                                        <span>Copy</span>
                                                                    </div>
                                                                )}
                                                            </>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {!isSender && (
                                            <span className="message-sender-name" style={{ color: getSenderColor(msgSenderId?.toString() || "") }}>
                                                {typeof msg.senderId === "object" ? msg.senderId?.name : getMemberName(msgSenderId?.toString() || "")}
                                            </span>
                                        )}

                                        {isText && (
                                            <span className="message-text">{renderMessageWithLinks(msg.message)}</span>
                                        )}

                                        {isVoiceCall && (
                                            <div className="call-message voice-call-message">
                                                <Phone size={22} />
                                                <div className="call-message-info">
                                                    <span>Voice call</span>
                                                    <small>
                                                        {ongoingCallMsgId === msg._id
                                                            ? "Ongoing • Tap Join Now"
                                                            : isSender
                                                              ? "Outgoing"
                                                              : "Call ended"}
                                                    </small>
                                                </div>
                                                {ongoingCallMsgId === msg._id && activeCall?.msgId !== msg._id && (
                                                    <button
                                                        type="button"
                                                        className="joinOngoingCallBtn"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            joinOngoingCall(selectedGroup._id, msg._id, "voice");
                                                        }}
                                                    >
                                                        Join Now
                                                    </button>
                                                )}
                                            </div>
                                        )}

                                        {isVideoCall && (
                                            <div className="call-message video-call-message">
                                                <Video size={22} />
                                                <div className="call-message-info">
                                                    <span>Video call</span>
                                                    <small>
                                                        {ongoingCallMsgId === msg._id
                                                            ? "Ongoing • Tap Join Now"
                                                            : isSender
                                                              ? "Outgoing"
                                                              : "Call ended"}
                                                    </small>
                                                </div>
                                                {ongoingCallMsgId === msg._id && activeCall?.msgId !== msg._id && (
                                                    <button
                                                        type="button"
                                                        className="joinOngoingCallBtn"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            joinOngoingCall(selectedGroup._id, msg._id, "video");
                                                        }}
                                                    >
                                                        Join Now
                                                    </button>
                                                )}
                                            </div>
                                        )}

                                        {isImage && (
                                            <div className="message-file message-image">
                                                <img
                                                    src={fileSrc}
                                                    alt={displayFileName}
                                                    className="message-image-preview"
                                                    onClick={() => window.open(fileSrc, "_blank")}
                                                />
                                                <div className="file-meta">
                                                    <span className="file-size">{formatFileSize(msg.sizeInKb)}</span>
                                                </div>
                                            </div>
                                        )}

                                        {isVideo && (
                                            <div className="message-file message-video">
                                                <video src={fileSrc} controls className="message-video-preview" />
                                                <div className="file-meta">
                                                    <span className="file-size">{formatFileSize(msg.sizeInKb)}</span>
                                                </div>
                                            </div>
                                        )}

                                        {isPdf && (
                                            <a href={fileSrc} target="_blank" rel="noopener noreferrer" className="message-file message-doc">
                                                <div className="file-icon pdf-icon">PDF</div>
                                                <div className="file-info">
                                                    <span className="file-name">{displayFileName}</span>
                                                    <span className="file-size">{formatFileSize(msg.sizeInKb)}</span>
                                                </div>
                                            </a>
                                        )}

                                        {isOtherFile && (
                                            <a href={fileSrc} target="_blank" rel="noopener noreferrer" download className="message-file message-doc">
                                                <div className="file-icon generic-icon">
                                                    <FileText size={18} />
                                                </div>
                                                <div className="file-info">
                                                    <span className="file-name">{displayFileName}</span>
                                                    <span className="file-size">{formatFileSize(msg.sizeInKb)}</span>
                                                </div>
                                            </a>
                                        )}

                                        {/* EMOJI PICKER MODAL OVERLAY */}
                                        {!isCallMsg && isReactionOpen && !groupStatus && !leavesTheGroup && (
                                            <div
                                                className="gc-emoji-overlay"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setReactionMessage(null);
                                                }}
                                            >
                                                <div
                                                    className="gc-emoji-picker-popup"
                                                    ref={reactionRef}
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    <EmojiPicker
                                                        theme={theme === "dark" ? EmojiTheme.DARK : EmojiTheme.LIGHT}
                                                        onEmojiClick={(emojiData) => {
                                                            handleEmojiReaction(msg._id, emojiData.emoji);
                                                            setReactionMessage(null);
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                        )}

                                        {/* REACTION BADGE ON MESSAGE BOTTOM */}
                                        {hasReactions && (
                                            <div
                                                className="gc-reaction-badge"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setShowReactionDetail(prev => (prev === msg._id ? null : msg._id));
                                                }}
                                            >
                                                {Object.keys(groupReactions(msg.reaction)).slice(0, 3).map((emoji: string) => (
                                                    <span key={emoji} className="gc-reaction-emoji">{emoji}</span>
                                                ))}
                                                {msg.reaction.length > 1 && (
                                                    <span className="gc-reaction-count">{msg.reaction.length}</span>
                                                )}
                                            </div>
                                        )}

                                        {/* REACTION DETAIL POPUP OVERLAY */}
                                        {!isCallMsg && showReactionDetail === msg._id && hasReactions && (
                                            <div
                                                className="gc-reaction-overlay"
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    setShowReactionDetail(null);
                                                }}
                                            >
                                                <div
                                                    className="gc-reaction-detail-popup"
                                                    ref={reactionDetailRef}
                                                    onClick={(e) => e.stopPropagation()}
                                                >
                                                    <div className="gc-reaction-detail-header">
                                                        <span>{msg.reaction.length} reaction{msg.reaction.length > 1 ? "s" : ""}</span>
                                                        <button
                                                            type="button"
                                                            className="gc-reaction-close-btn"
                                                            onClick={() => setShowReactionDetail(null)}
                                                        >
                                                            <X size={16} />
                                                        </button>
                                                    </div>
                                                    <div className="gc-reaction-pills-row">
                                                        <button
                                                            type="button"
                                                            className="gc-add-reaction-pill"
                                                            disabled={groupStatus || leavesTheGroup}
                                                            title="Add reaction"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setShowReactionDetail(null);
                                                                setReactionMessage(msg._id);
                                                            }}
                                                        >
                                                            <Smile size={15} />
                                                            <Plus size={12} />
                                                        </button>
                                                        {Object.entries(groupReactions(msg.reaction)).map(([emoji, emojiUsers]: [string, any]) => (
                                                            <div key={emoji} className="gc-reaction-pill">
                                                                <span>{emoji}</span>
                                                                <span className="gc-reaction-pill-count">{emojiUsers.length}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                    <div className="gc-reaction-divider" />
                                                    <div className="gc-reaction-user-list">
                                                        {msg.reaction.map((r: any, rIdx: number) => {
                                                            const rUserId = r.userId?.toString();
                                                            const isMe = rUserId === senderId?.toString();
                                                            const mName = isMe ? "You" : getMemberName(rUserId);
                                                            return (
                                                                <div
                                                                    key={`${rUserId}-${rIdx}`}
                                                                    className={`gc-reaction-user-row${isMe ? " is-me" : ""}`}
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        if (isMe) handleRemoveReaction(msg._id, r.emoji);
                                                                    }}
                                                                >
                                                                    <div
                                                                        className="gc-reaction-avatar"
                                                                        style={{ backgroundColor: isMe ? "#00a884" : getSenderColor(rUserId || "") }}
                                                                    >
                                                                        {mName.charAt(0).toUpperCase()}
                                                                    </div>
                                                                    <div className="gc-reaction-user-info">
                                                                        <span className="gc-reaction-user-name">{mName}</span>
                                                                        {isMe && <span className="gc-reaction-remove-hint">Tap to remove</span>}
                                                                    </div>
                                                                    <span className="gc-reaction-emoji-large">{r.emoji}</span>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        {!isCallMsg && (
                                            <span className="message-meta">
                                                {msg.isEdited && <span className="message-edited">edited</span>}
                                                {isSender && (<Tick isSeen={msg.isSeen} isDelivered={msg.isDelivered} isSend={msg.isSend} />)}
                                            </span>
                                        )}
                                        {editingMsgId === msg._id && (
                                            <div className="inline-edit-box" onClick={(e) => e.stopPropagation()}>
                                                <input type="text" value={editText} onChange={(e) => setEditText(e.target.value)} autoFocus />
                                                <button type="button" onClick={() => saveEdit(msg._id)}>
                                                    <Check size={14} /> Save
                                                </button>
                                                <button type="button" onClick={cancelEdit}>Cancel</button>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                            <div ref={messagesEndRef} />
                        </div>

                        {leavesTheGroup && (
                            <div className="chat-restriction-banner">
                                You can't send messages to this group because you are no longer a participant.
                            </div>
                        )}
                        {chatLocked && (
                            <div className="chat-restriction-banner">
                                Only admins are allowed to send messages to this group.
                            </div>
                        )}

                        {/* WHATSAPP STYLE FOOTER BAR — only-admin mode me non-admin ko footer nahi dikhega */}
                        {!chatLocked && (
                        <div className="group-chat-footer">
                            <FooterEmoji setMsg={setMessage} />

                            {/* File Upload — file choose karte hi auto send */}
                            <div className="footer-file-form">
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    style={{ display: "none" }}
                                    onChange={handleFilePick}
                                    disabled={groupStatus || leavesTheGroup || chatLocked}
                                />
                                <button
                                    type="button"
                                    className="wp-icon-btn footer-icon-btn"
                                    title="Attach File"
                                    disabled={groupStatus || leavesTheGroup || chatLocked}
                                    onClick={() => fileInputRef.current?.click()}
                                >
                                    <Paperclip size={20} />
                                </button>
                            </div>

                            {/* Poll Icon Trigger */}
                            <button
                                type="button"
                                className="wp-icon-btn footer-icon-btn pollTriggerBtn"
                                title="Create Poll"
                                disabled={groupStatus || leavesTheGroup || chatLocked}
                                onClick={() => setShowCreatePoll(true)}
                            >
                                <BarChart2 size={20} />
                            </button>

                            {/* Text Message Form */}
                            <form onSubmit={handleSubmit} className="message-form">
                                <input
                                    type="text"
                                    placeholder="Type a message"
                                    value={message}
                                    onChange={(e) => setMessage(e.target.value)}
                                    disabled={groupStatus || leavesTheGroup || chatLocked}
                                />
                                <button type="submit" className="send-msg-btn" disabled={groupStatus || leavesTheGroup || chatLocked}>
                                    <Send size={18} />
                                </button>
                            </form>
                        </div>
                        )}
                    </div>
                )}

                <MsgInfo
                    open={showMsgInfo}
                    onClose={() => setShowMsgInfo(false)}
                    messageId={selectedMsgId}
                />
            </div>

            {showModal && (
                <div className="wp-themed-modal-scope">
                    <AddGroupMembersModal
                        users={users}
                        selectedIds={selectedIds}
                        setSelectedIds={setSelectedIds}
                        senderId={senderId}
                        onClose={() => setShowModal(false)}
                    />
                </div>
            )}

            {showForwardModal && (
                <div className="wp-themed-modal-scope">
                    <ForwardModal
                        onClose={() => setShowForwardModal(false)}
                        senderId={senderId}
                        users={users}
                        groups={allGroupsList}
                        selectedMessageIds={selectedMsgIds}
                        onForwarded={cancelSelection}
                    />
                </div>
            )}

            {showCreatePoll && (
                <div className="wp-themed-modal-scope">
                    <CreatePollModal
                        onClose={() => setShowCreatePoll(false)}
                        onCreate={handleCreatePoll}
                    />
                </div>
            )}

            {callError && (
                <div className="call-error-banner" onClick={() => setCallError("")}>
                    {callError}
                </div>
            )}
        </div>
    );
}