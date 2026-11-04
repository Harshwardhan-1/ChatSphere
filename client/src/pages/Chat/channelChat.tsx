import { useLocation } from "react-router-dom";
import { socket } from "../../utils/socket";
import { useEffect, useState, useRef } from "react";
import { CreateChannel } from "../../components/CreateChannel/CreateChannel";
import { env } from "../../configs/env.config";
import { ChannelHook } from "../../hooks/use.channel.hook";
import { userChatListPresence } from "../../services/user.presence.service";
import { ChannelProfile } from "../../components/ChannelsProfile/ChannelsProfile";
import EmojiPicker, { Theme as EmojiTheme } from "emoji-picker-react";
import { renderMessageWithLinks } from "../../utils/linkify/linkify";
import axiosInstance from "../../services/axiosInstance";
import { showApiError } from "../../utils/showApiError";
import { CreatePollModal } from "../../components/Poll/CreatePollMode";
import {
    Sun,
    Moon,
    Paperclip,
    BarChart2,
    Send,
    Smile,
    ChevronDown,
    X,
    Plus,
    Pencil,
    Copy,
    EyeOff,
    Trash2,
    FileText,
    Check,
} from "lucide-react";
import "./ChannelChat.css";


interface ChannelListItem {
    _id: string;
    name: string;
    description?: string;
    profilePic?: string;
    category: string;
    followers: string[];
    followersCount?: number; // present on category_data results, absent elsewhere
}

const CATEGORIES = ["sports", "entertainment", "technology", "news", "education", "business", "other"];

// windows ka backslash path (uploads\abc.png) bhi sahi URL bana deta hai
function resolveChannelPic(profilePic?: string) {
    if (!profilePic) return "/default.webp";
    if (/^(https?:|data:)/i.test(profilePic)) return profilePic;

    const clean = profilePic.replace(/\\/g, "/");
    const path = clean.startsWith("/") ? clean : `/${clean}`;
    return `${env.backendUrl}${path}`;
}

// reaction counts ko WhatsApp jaisa short format dene ke liye (23.2K, 1.8K, etc.)
function formatReactionCount(count: number): string {
    if (count >= 1_000_000) {
        const v = count / 1_000_000;
        return `${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)}M`;
    }
    if (count >= 1_000) {
        const v = count / 1_000;
        return `${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)}K`;
    }
    return `${count}`;
}

// channel list ke sidebar mein last message preview banane ke liye - GroupChat ke getGroupDisplayMessage jaisa hi
function getChannelDisplayMessage(last?: any): string {
    if (!last) return "";
    if (last.messageType === "file") {
        const mime = last.mimetype || "";
        if (mime.startsWith("image/")) return "📷 Image";
        if (mime.startsWith("video/")) return "🎥 Video";
        if (mime === "application/pdf") return "📄 PDF";
        return last.orignalname || last.filename || "📎 File";
    }
    if (last.messageType === "poll") return "📊 Poll";
    return last.message || "";
}

const BackIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M15 18l-6-6 6-6" />
    </svg>
);
const SearchIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
    </svg>
);

export function ChannelChat() {

    const location = useLocation();
    const senderId = location.state?.senderId;

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
        setTheme(prev => (prev === "light" ? "dark" : "light"));
    };

    const [activeOption, setActiveOption] = useState<string | null>(null);
    const [myChannels, setMyChannels] = useState<ChannelListItem[]>([]);
    const [randomChannels, setRandomChannels] = useState<ChannelListItem[]>([]);
    const [exploreChannels, setExploreChannels] = useState<ChannelListItem[]>([]);
    const [explorePage, setExplorePage] = useState(2);
    const [selectedCategory, setSelectedCategory] = useState("other");
    const [hasMoreExplore, setHasMoreExplore] = useState(true);
    const [showFindPanel, setShowFindPanel] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedChannel, setSelectedChannel] = useState<ChannelListItem | null>(null);
    const [messageText, setMessageText] = useState("");
    const [channelLastMessages, setChannelLastMessages] = useState<any[]>([]);
    const [channelPendingCounts, setChannelPendingCounts] = useState<{id:string; count:number}[]>([]);
    // emoji reaction ke liye states - GroupChat ke reactionMessage/showReactionDetail jaisa hi
    const [reactionMessage, setReactionMessage] = useState<string | null>(null);
    const [showReactionDetail, setShowReactionDetail] = useState<string | null>(null);
    const [openMsgMenuId, setOpenMsgMenuId] = useState<string | null>(null);
    const reactionRef = useRef<HTMLDivElement | null>(null);
    const reactionDetailRef = useRef<HTMLDivElement | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    // channel info (profile) sliding panel ke liye state
    const [showChannelProfile, setShowChannelProfile] = useState<boolean>(false);

    // Channel delete hone par real-time lock/blur state
    const [isChannelDeleted, setIsChannelDeleted] = useState<boolean>(false);
    const selectedChannelRef = useRef<ChannelListItem | null>(null);
    selectedChannelRef.current = selectedChannel;

    // POLL ke states
    const [showCreatePoll, setShowCreatePoll] = useState<boolean>(false);
    // abhi-abhi bane poll messages (jo hook ke msg list me live nahi aate)
    const [livePollMsgs, setLivePollMsgs] = useState<any[]>([]);
    // pollId -> poll document (options + votes)
    const [pollsById, setPollsById] = useState<Record<string, any>>({});
    const requestedPollsRef = useRef<Set<string>>(new Set());

    const handleCreated = () => {
        setActiveOption(null);
        socket.emit("all_user_channel", senderId);
    };

    const handleChannel = (data: ChannelListItem[]) => setMyChannels(data);
    const allrandomchannels = (data: ChannelListItem[]) => setRandomChannels(data);

    const handleExploreData = (data: ChannelListItem[]) => {
        if (data.length === 0) {
            setHasMoreExplore(false);
            return;
        }
        setExploreChannels(prev => [...prev, ...data]);
    };

    const handleToggleFollow = (payload: { _id: string; count: number; message: string }) => {
        setRandomChannels(prev => prev.filter(c => c._id !== payload._id));
        setExploreChannels(prev => prev.filter(c => c._id !== payload._id));
        socket.emit("all_user_channel", senderId);
    };

    const [canSend,setCanSend]=useState<boolean>(false);

    const handleCanSend=(msg:string)=>{
        if(msg==="canSend"){
            setCanSend(true);
        }else{
            setCanSend(false);
        }
    };


    // ek hi jagah se channel ka name / pic / description sab lists + header me update hota hai
    // (socket event aaye ya ChannelProfile se callback aaye - dono ke liye same function)
    const applyChannelPatch = (channelId: string, patch: Partial<ChannelListItem>) => {
        const same = (c: ChannelListItem) => c._id.toString() === channelId.toString();
        const update = (list: ChannelListItem[]) => list.map(c => (same(c) ? { ...c, ...patch } : c));

        setMyChannels(update);
        setRandomChannels(update);
        setExploreChannels(update);
        setSelectedChannel(prev => (prev && same(prev) ? { ...prev, ...patch } : prev));
    };

    const handleProfilePicUpdated = (d: { channelId: string; message: string }) =>
        applyChannelPatch(d.channelId, { profilePic: d.message });

    const handleNameUpdated = (d: { channelId: string; name: string }) =>
        applyChannelPatch(d.channelId, { name: d.name });

    const handleDescriptionUpdated = (d: { channelId: string; description: string }) =>
        applyChannelPatch(d.channelId, { description: d.description });

    // Real-time channel delete handler
    const handleChannelDeletedRealtime = (data: { _id: string; message: string }) => {
        if (!data?._id) return;
        const deletedId = data._id.toString();

        // Sabhi chat lists / discover / explore lists se turant gayab karo
        setMyChannels(prev => prev.filter(c => c._id.toString() !== deletedId));
        setRandomChannels(prev => prev.filter(c => c._id.toString() !== deletedId));
        setExploreChannels(prev => prev.filter(c => c._id.toString() !== deletedId));
        setChannelLastMessages(prev => prev.filter(c => c.channelId?.toString() !== deletedId));
        setChannelPendingCounts(prev => prev.filter(p => p.id?.toString() !== deletedId));

        // Agar abhi wahi channel khula hua hai toh profile panel, reaction picker aur menu band karo, input blur/disable karo
        if (selectedChannelRef.current?._id?.toString() === deletedId) {
            setShowChannelProfile(false);
            setShowCreatePoll(false);
            setReactionMessage(null);
            setOpenMsgMenuId(null);
            setEditingMsgId(null);
            setCanSend(false);
            setIsChannelDeleted(true);
        }
    };


    const [showFollwingButton,setShowFollowingButton]=useState<boolean>(false);
    const [isCreator,setIsCreator]=useState<boolean>(false);
    const handleFollowing=(data:{channelId:string,senderId:string,msg:string,channelCreator:string})=>{
        if(data.channelId.toString()!==selectedChannel?._id)return;
        if(data.msg==="Not Following"){
            //toh Follow dikhana ha 
            setShowFollowingButton(true);
        }else{
            //un follow button dikha ah matlab
            setShowFollowingButton(false);
        }
        if(data.channelCreator==="yes"){
            setIsCreator(true);
        }else{
            setIsCreator(false);
        }
    }

    useEffect(()=>{
        socket.emit("random_channels", senderId);
        socket.emit("all_user_channel", senderId);
        socket.emit("category_data", { category: selectedCategory, page: 1, limit: 10, senderId });

        socket.on("channel_created", handleCreated);
        socket.on("all_user_channel", handleChannel);
        socket.on("got_all_random_channels", allrandomchannels);
        socket.on("category_data", handleExploreData);
        socket.on("toggle_follow", handleToggleFollow);
        socket.on("canSendMessage",handleCanSend);
        socket.on("channel_pic_updated",handleProfilePicUpdated);
        socket.on("channel_name_updated",handleNameUpdated);
        socket.on("channel_description_changed",handleDescriptionUpdated);
        socket.on("channel_deleted", handleChannelDeletedRealtime);


        return () => {
            socket.off("channel_created", handleCreated);
            socket.off("all_user_channel", handleChannel);
            socket.off("got_all_random_channels", allrandomchannels);
            socket.off("category_data", handleExploreData);
            socket.off("toggle_follow", handleToggleFollow);
            socket.off("canSendMessage",handleCanSend);
            socket.off("channel_pic_updated",handleProfilePicUpdated);
            socket.off("channel_name_updated",handleNameUpdated);
            socket.off("channel_description_changed",handleDescriptionUpdated);
            socket.off("channel_deleted", handleChannelDeletedRealtime);
        };
    }, []);

    useEffect(() => {
        if (!selectedChannel?._id || !senderId || isChannelDeleted) return;
        socket.emit("active_channel_user",{channelId:selectedChannel._id,senderId});
      
        socket.emit("_isFollowing",({channelId:selectedChannel._id,senderId}));

        socket.on("channel_following",handleFollowing);
        return()=>{
            socket.emit("not_active_channel_user",{channelId:selectedChannel._id,senderId});
            socket.off("channel_following",handleFollowing);
        };
    }, [selectedChannel?._id, senderId, isChannelDeleted]);

    // naya channel select hote hi profile panel band ho jaye
    useEffect(() => {
        setShowChannelProfile(false);
    }, [selectedChannel?._id]);

    useEffect(() => {
        if (!senderId) return;
        socket.emit("get_channel_last_message_stored", senderId);

        const handleAllLastMessages = (data: { channelId: string; lastMessageOfChannel: any }[]) => {
            setChannelLastMessages(data.map(d => d.lastMessageOfChannel));
        };

        const handleChatListUpdate = (data: any) => {
            // backend kabhi undefined bhej de toh crash na ho
            if (!data) return;
            setChannelLastMessages(prev => {
                const index = prev.findIndex(c => c.channelId === data.channelId);
                if (index !== -1) {
                    const temp = [...prev];
                    temp[index] = data;
                    return temp;
                }
                return [data, ...prev];
            });
        };

        socket.on("all_last_message_of_channels", handleAllLastMessages);
        socket.on("update_channel_chatlist", handleChatListUpdate);

        return () => {
            socket.off("all_last_message_of_channels", handleAllLastMessages);
            socket.off("update_channel_chatlist", handleChatListUpdate);
        };
    }, [senderId]);

    useEffect(() => {
        if (!senderId) return;
        socket.emit("all_pending_channel_messages", senderId);
        const handlePendingMessages=(data:{id:string;count:number}[])=>{
            setChannelPendingCounts(data);
        };

        socket.on("all_pending_channel_message", handlePendingMessages);

        return () => {
            socket.off("all_pending_channel_message", handlePendingMessages);
        };
    }, [senderId]);

    // emoji picker / reaction popup / message menu ke bahar click hone par band (GroupChat jaisa)
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

            if (!target.closest(".wa-menu")) {
                setOpenMsgMenuId(null);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // POLL ke live socket events (naya poll aaya / vote update / poll details / message delete)
    useEffect(() => {
        const channelId = selectedChannel?._id;
        if (!channelId) return;

        setLivePollMsgs([]);
        requestedPollsRef.current = new Set();

        const onPollMessage = (payload: { msg: any; poll: any }) => {
            if (!payload?.msg || !payload?.poll) return;
            if (payload.msg.channelId?.toString() !== channelId.toString()) return;
            setPollsById(prev => ({ ...prev, [payload.poll._id]: payload.poll }));
            setLivePollMsgs(prev =>
                prev.some(m => m._id === payload.msg._id) ? prev : [...prev, payload.msg]
            );
        };

        // vote update / poll details dono me poll document aata hai
        const onPollDoc = (poll: any) => {
            if (!poll?._id || !Array.isArray(poll.options)) return;
            setPollsById(prev => ({ ...prev, [poll._id]: poll }));
        };

        const onDeleted = (d: { channelId: string; msgId: string }) => {
            if (!d || d.channelId?.toString() !== channelId.toString()) return;
            setLivePollMsgs(prev => prev.filter(m => m._id !== d.msgId));
        };

        socket.on("channel_poll_message", onPollMessage);
        socket.on("channel_poll_updated", onPollDoc);
        socket.on("channel_pole_updated", onPollDoc); // title payload me options nahi hote, wo ignore ho jata hai
        socket.on("channel_poll_details", onPollDoc);
        socket.on("deleted_channel_msg", onDeleted);

        return () => {
            socket.off("channel_poll_message", onPollMessage);
            socket.off("channel_poll_updated", onPollDoc);
            socket.off("channel_pole_updated", onPollDoc);
            socket.off("channel_poll_details", onPollDoc);
            socket.off("deleted_channel_msg", onDeleted);
        };
    }, [selectedChannel?._id]);

    
    const handleCreate = () => setActiveOption("create channel");

    const loadMoreExplore = () => {
        socket.emit("category_data", { category: selectedCategory, page: explorePage, limit: 10, senderId });
        setExplorePage(prev => prev + 1);
    };

    const handleCategoryClick = (cat: string) => {
        if (cat === selectedCategory) return;
        setSelectedCategory(cat);
        setExploreChannels([]);
        setHasMoreExplore(true);
        socket.emit("category_data", { category: cat, page: 1, limit: 10, senderId });
        setExplorePage(2);
    };

    

    const handleHide = (channelId: string) => {
        socket.emit("hide_channel", { _id: channelId, senderId });
        setRandomChannels(prev => prev.filter(c => c._id !== channelId));
        setExploreChannels(prev => prev.filter(c => c._id !== channelId));
    };

    const openFindPanel = () => {
        setShowFindPanel(true);
        setSearchQuery("");
    };
    const closeFindPanel = () => {
        setShowFindPanel(false);
        setSearchQuery("");
    };

    const handleOpenChannel = (ch: ChannelListItem) => {
        setIsChannelDeleted(false);
        setSelectedChannel(ch);
        setMessageText("");
        setCanSend(false); 
        socket.emit("can_send_message", {channelId: ch._id,senderId});

        setChannelPendingCounts(prev => prev.map(p => p.id === ch._id ? { ...p, count: 0 } : p));
        socket.emit("user_open_channel_chat", { channelId: ch._id, senderId });
    };

    const panelChannels = searchQuery.trim()
        ? exploreChannels.filter(c => c.name.toLowerCase().includes(searchQuery.trim().toLowerCase()))
        : exploreChannels;

    const sortedMyChannels = [...(myChannels || [])].sort((a, b) => {
        const aLast = channelLastMessages.find(c => c.channelId === a._id);
        const bLast = channelLastMessages.find(c => c.channelId === b._id);
        const aTime = aLast ? new Date(aLast.updatedAt).getTime() : 0;
        const bTime = bLast ? new Date(bLast.updatedAt).getTime() : 0;
        return bTime - aTime;
    });



    const handleFollowButton=()=>{
        if (isChannelDeleted) return;
        socket.emit("update_channel_followers_list",({channelId:selectedChannel?._id,senderId}));
    }

    const renderMyChannelRow = (ch: ChannelListItem) => {
        const last = channelLastMessages.find(c => c.channelId === ch._id);
        const pending = channelPendingCounts.find(p => p.id === ch._id);
        return (
            <div
                key={ch._id}
                className={`channel-row ${selectedChannel?._id === ch._id ? "channel-row--active" : ""}`}
                onClick={() => handleOpenChannel(ch)}
            >
                <div className="channel-row-avatar">
                    <img src={resolveChannelPic(ch.profilePic)} alt={ch.name} />
                </div>
                <div className="channel-row-info">
                    <div className="channel-row-top">
                        <span className="channel-row-name">{ch.name}</span>
                        <span className="channel-row-time">
                            {last ? userChatListPresence(last.updatedAt) : ""}
                        </span>
                    </div>
                    <div className="channel-row-bottom">
                        <span className="channel-row-last-msg">
                            {getChannelDisplayMessage(last)}
                        </span>
                        {pending && pending.count > 0 && (
                            <span className="unread-badge">{pending.count > 99 ? "99+" : pending.count}</span>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    const renderRow = (ch: ChannelListItem, withActions: boolean) => (
    <div
        key={ch._id}
        className={`channel-row ${selectedChannel?._id === ch._id ? "channel-row--active" : ""}`}
        onClick={() => handleOpenChannel(ch)}
    >
        <div className="channel-row-avatar">
            <img src={resolveChannelPic(ch.profilePic)} alt={ch.name} />
        </div>
        <div className="channel-row-info">
            <span className="channel-row-name">{ch.name}</span>
        </div>
        {withActions && (
            <div className="channel-row-actions">
                <button  className="channel-follow-btn" onClick={handleFollowButton}
                    type="button"
                >
                    Follow
                </button>
                <button
                    className="channel-hide-btn"
                    onClick={(e) => { e.stopPropagation(); handleHide(ch._id); }}
                    type="button"
                    aria-label="Not interested"
                >
                    ✕
                </button>
            </div>
        )}
    </div>
);

const renderFindRow = (ch: ChannelListItem) => (
    <div
        key={ch._id}
        className={`find-row ${selectedChannel?._id === ch._id ? "find-row--active" : ""}`}
        onClick={() => handleOpenChannel(ch)}
    >
        <div className="find-row-avatar">
            <img src={resolveChannelPic(ch.profilePic)} alt={ch.name} />
        </div>
        <div className="find-row-info">
            <span className="find-row-name">{ch.name}</span>
        </div>
        <button className="find-follow-btn" onClick={handleFollowButton}
            type="button">Follow</button>
    </div>
);

const {msg,editMsg,deleteForMe,deleteForEveryone,sendFileMsg,sendMessage,sendReaction}=ChannelHook(selectedChannel?._id,senderId);

// hook ke messages + live bane poll messages (duplicate hatake)
const baseMsgs: any[] = (msg as any[]) || [];
const displayMsgs: any[] = [
    ...baseMsgs,
    ...livePollMsgs.filter(p => !baseMsgs.some((m: any) => m._id === p._id)),
];

// jin poll messages ka data abhi nahi aaya unka poll document server se mangwao
useEffect(() => {
    if (!selectedChannel?._id || isChannelDeleted) return;
    baseMsgs.forEach((m: any) => {
        if (m.messageType !== "poll") return;
        const pollId = m.message;
        if (!pollId || pollsById[pollId] || requestedPollsRef.current.has(pollId)) return;
        requestedPollsRef.current.add(pollId);
        socket.emit("get_channel_poll", { channelId: selectedChannel._id, pollId });
    });
}, [msg, selectedChannel?._id, pollsById, isChannelDeleted]);

const removeLivePoll = (msgId: string) => {
    setLivePollMsgs(prev => prev.filter(m => m._id !== msgId));
};

const handleSubmit=async(e:React.FormEvent<HTMLFormElement>)=>{
    e.preventDefault();
    if(isChannelDeleted || !canSend) return;
    if(messageText.trim().length===0){
        alert("msg field cannot be empty");
        return;
    }
    sendMessage({channelId:selectedChannel!._id,senderId:senderId,message:messageText});
    setMessageText('');
}

const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
const [editText, setEditText] = useState<string>("");

const handleEditClick = (item: any) => {
    if (isChannelDeleted) return;
    setEditingMsgId(item._id);
    setEditText(item.message);
    setOpenMsgMenuId(null);
};

const cancelEdit = () => {
    setEditingMsgId(null);
    setEditText("");
};

const saveEdit = (msgId: string) => {
    if (isChannelDeleted) return;
    if (editText.trim().length === 0) return;
    editMsg({channelId:selectedChannel!._id,senderId,msgId,message:editText});
    setEditingMsgId(null);
    setEditText("");
};

// file choose hote hi seedha upload + send (alag se "Send File" button nahi)
const uploadAndSendFile = async (picked: File) => {
    if (!selectedChannel || !canSend || isChannelDeleted) return;
    try {
        const formData = new FormData();
        formData.append("file", picked);
        const res = await axiosInstance.post("/upload", formData);
        if (res.data.success) {
            const data = res.data.data;
            sendFileMsg({
                channelId: selectedChannel._id,
                senderId,
                message: data.path,
                messageType: "file",
                mimetype: data.mimetype,
                orignalname: data.orignalname ?? data.originalname ?? data.name ?? picked.name,
                sizeInKb: data.sizeInKb,
                sizeInMb: data.sizeInMb,
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

// POLL create - CreatePollModal se data aata hai (GroupChat jaisa hi)
const handleCreatePoll = (data: {
    title: string;
    selectOptions: boolean;
    polldata: { msg: string; peoplesId: string[] }[];
}) => {
    if (!selectedChannel?._id || isChannelDeleted) return;
    socket.emit("create_channel_poll", {
        channelId: selectedChannel._id,
        senderId,
        title: data.title,
        canSelectMultiple: data.selectOptions,
        pollData: data.polldata,
    });
};

// POLL vote - single choice ya multiple choice poll ke hisaab se alag event
const handlePollVote = (item: any, poll: any, optionId: string) => {
    if (!selectedChannel?._id || isChannelDeleted) return;
    socket.emit(
        poll.canSelectMultiple ? "channel_poll_toggle_multiple" : "channel_poll_toggle",
        { channelId: selectedChannel._id, senderId, msgId: item._id, pollId: optionId }
    );
};

const renderPollBody = (item: any) => {
    const poll = pollsById[item.message];
    if (!poll) return <div className="channel-poll-hint">Loading poll…</div>;

    const multi = !!poll.canSelectMultiple;
    const options: any[] = poll.options || [];

    const voterSet = new Set<string>();
    options.forEach((o: any) => (o.peoplesId || []).forEach((id: any) => voterSet.add(id.toString())));
    const totalVoters = voterSet.size;

    return (
        <div className="channel-poll">
            <div className="channel-poll-title">{poll.title}</div>
            <div className="channel-poll-hint">{multi ? "Select one or more" : "Select one"}</div>

            {options.map((o: any) => {
                const count = (o.peoplesId || []).length;
                const voted = (o.peoplesId || []).some((id: any) => id.toString() === senderId?.toString());
                const pct = totalVoters ? Math.round((count / totalVoters) * 100) : 0;
                return (
                    <button
                        key={o._id}
                        type="button"
                        disabled={isChannelDeleted}
                        className={`channel-poll-option${voted ? " channel-poll-option--voted" : ""}`}
                        onClick={(e) => { e.stopPropagation(); handlePollVote(item, poll, o._id); }}
                    >
                        <div className="channel-poll-option-row">
                            <span className={`channel-poll-check${multi ? " channel-poll-check--multi" : ""}`}>
                                {voted && <Check size={12} />}
                            </span>
                            <span className="channel-poll-option-text">{o.msg}</span>
                            <span className="channel-poll-option-count">{count}</span>
                        </div>
                        <div className="channel-poll-bar">
                            <div className="channel-poll-bar-fill" style={{ width: `${pct}%` }} />
                        </div>
                    </button>
                );
            })}

            <div className="channel-poll-footer">
                {totalVoters} vote{totalVoters !== 1 ? "s" : ""}
            </div>
        </div>
    );
};

// reactions ko emoji ke hisaab se group karta hai - GroupChat ka groupReactions helper, hubahu
const groupReactions = (reactions: { userId: string; emoji: string }[] = []) => {
    return reactions.reduce((acc, r) => {
        if (!acc[r.emoji]) acc[r.emoji] = [];
        acc[r.emoji].push(r.userId);
        return acc;
    }, {} as Record<string, string[]>);
};

const handleEmojiReaction=(msgId:string,emoji:string)=>{
    if(!selectedChannel || isChannelDeleted) return;
    sendReaction({channelId:selectedChannel._id,msgId,senderId,emoji});
};

// apna hi reaction hai toh use dobara bhej ke toggle-off karna (backend same-emoji pe hata deta hai)
const handleRemoveReaction = (msgId: string, currentEmoji: string) => {
    if (isChannelDeleted) return;
    handleEmojiReaction(msgId, currentEmoji);
    setShowReactionDetail(null);
};

    return (
        <div className="channel-chat-page" data-theme={theme}>
            <div className="channel-list-column">
                {showFindPanel ? (
                    <div className="find-panel">
                        <div className="find-panel-header">
                            <button className="find-icon-btn" onClick={closeFindPanel} type="button" aria-label="Back">
                                <BackIcon />
                            </button>
                            <h2 className="find-panel-title">Find channels</h2>
                            <span className="find-panel-spacer" />
                        </div>

                        <div className="find-search-wrap">
                            <SearchIcon />
                            <input
                                className="find-search-input"
                                placeholder="Search"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>

                        <div className="find-category-scroll">
                            {CATEGORIES.map((cat) => (
                                <button
                                    key={cat}
                                    type="button"
                                    className={`channel-category-chip ${selectedCategory === cat ? "channel-category-chip--active" : ""}`}
                                    onClick={() => handleCategoryClick(cat)}
                                >
                                    {cat.charAt(0).toUpperCase() + cat.slice(1)}
                                </button>
                            ))}
                        </div>

                        <div className="find-list">
                            {panelChannels.length === 0 && (
                                <p className="channel-empty">
                                    {searchQuery ? "No channels match your search" : "No channels in this category yet"}
                                </p>
                            )}
                            {panelChannels.map(renderFindRow)}
                            {hasMoreExplore && !searchQuery && (
                                <button className="find-load-more" onClick={loadMoreExplore} type="button">
                                    Load more
                                </button>
                            )}
                        </div>
                    </div>
                ) : (
                    <>
                        <div className="channel-list-header">
                            <h1>Channels</h1>
                            <div className="channel-header-actions">
                                <button
                                    className="channel-icon-btn"
                                    onClick={toggleTheme}
                                    aria-label="Toggle theme"
                                    title={theme === "dark" ? "Switch to Light Mode" : "Switch to Dark Mode"}
                                    type="button"
                                >
                                    {theme === "dark" ? <Sun size={19} /> : <Moon size={19} />}
                                </button>
                                <button className="channel-icon-btn" onClick={openFindPanel} aria-label="Find channels" type="button">
                                    <SearchIcon />
                                </button>
                                <button className="channel-new-btn" onClick={handleCreate} aria-label="New channel" type="button">✎</button>
                            </div>
                        </div>

                        {myChannels.length > 0 && (
                            <div className="channel-section">
                                <p className="channel-section-title">Your channels</p>
                                {sortedMyChannels.map(renderMyChannelRow)}
                            </div>
                        )}

                        <div className="channel-section">
                            <p className="channel-section-title">Discover</p>
                            {randomChannels.length === 0 && (
                                <p className="channel-empty">no channels to show right now</p>
                            )}
                            {randomChannels.map((ch) => renderRow(ch, true))}
                        </div>

                        <div className="channel-section">
                            <button className="channel-find-more-btn" onClick={openFindPanel} type="button">
                                Find more channels
                            </button>
                        </div>

                        {activeOption === "create channel" && (
                            <CreateChannel onBack={() => setActiveOption(null)} senderId={senderId} />
                        )}
                    </>
                )}
            </div>



            <div className="channel-window-column">
                {selectedChannel ? (
                    <div className="channel-window">
                        <div className="channel-window-header">
                            <div
                                className="channel-window-info-clickable"
                                onClick={() => {
                                    if (!isChannelDeleted) setShowChannelProfile(true);
                                }}
                                style={
                                    isChannelDeleted
                                        ? { pointerEvents: "none", cursor: "default", opacity: 0.6 }
                                        : undefined
                                }
                            >
                                <div className="channel-window-avatar">
                                    <img src={resolveChannelPic(selectedChannel?.profilePic)} alt={selectedChannel?.name} style={{ pointerEvents: "none" }} />
                                </div>
                                <div className="channel-window-info">
                                    <span className="channel-window-name">{selectedChannel?.name}</span>
                                </div>
                            </div>

                           {/* //here we want to show button to user if it is creator don't 
                           //show button else show button according to condition to show follow 
                           // or unfollow
                          */}

                          {!isCreator && !isChannelDeleted && (
                            <button className="channel-follow-btn" onClick={handleFollowButton}>{showFollwingButton?"Follow":"Unfollow"}</button>
                          )}
                        </div>

                        {showChannelProfile && selectedChannel && !isChannelDeleted && (
                            <ChannelProfile
                                onBack={() => setShowChannelProfile(false)}
                                senderId={senderId}
                                channelId={selectedChannel._id}
                                isCreator={isCreator}
                                onChannelUpdated={(patch) => applyChannelPatch(selectedChannel._id, patch)}
                            />
                        )}

<div className="channel-window-messages">
    {displayMsgs.map((item:any, index:number)=>{
        const mine=item.senderId?.toString()===senderId?.toString();
        const isFile = !!item.mimetype;
        const isPoll = item.messageType === "poll";
        const hasReactions = Array.isArray(item.reaction) && item.reaction.length > 0;
        const isMenuOpen = openMsgMenuId === item._id;
        const isReactionOpen = reactionMessage === item._id;
        const menuOpensUp = displayMsgs.length > 3 && index >= displayMsgs.length - 2;

        return <div
            key={item._id}
            className={`${mine ? "message sender" : "message receiver"}${isFile ? " media-bubble" : ""}${isPoll ? " poll-bubble" : ""}${hasReactions ? " has-reactions" : ""}`}
        >
            {/* SMILE BUTTON - channel delete hone par hide */}
            {!isChannelDeleted && (
                <button
                    type="button"
                    className={`wa-rx-btn${isReactionOpen ? " active" : ""}`}
                    title="React"
                    onClick={(e) => {
                        e.stopPropagation();
                        setOpenMsgMenuId(null);
                        setShowReactionDetail(null);
                        setReactionMessage(prev => (prev === item._id ? null : item._id));
                    }}
                >
                    <Smile size={16} />
                </button>
            )}

            {/* CHEVRON MENU - channel delete hone par hide */}
            {!isChannelDeleted && (
                <div className={`wa-menu${isMenuOpen ? " open" : ""}${menuOpensUp ? " up" : ""}`}>
                    <button
                        type="button"
                        className="wa-menu-btn"
                        title="Message options"
                        onClick={(e) => {
                            e.stopPropagation();
                            setReactionMessage(null);
                            setOpenMsgMenuId(isMenuOpen ? null : item._id);
                        }}
                    >
                        <ChevronDown size={16} />
                    </button>
                    {isMenuOpen && (
                        <div className="wa-menu-dropdown" onClick={(e) => e.stopPropagation()}>
                            {mine ? (
                                <>
                                    {item.messageType==="text" && (
                                        <div className="wa-menu-item" onClick={()=>handleEditClick(item)}>
                                            <Pencil size={16} />
                                            <span>Edit</span>
                                        </div>
                                    )}
                                    {item.messageType==="text" && (
                                        <div className="wa-menu-item" onClick={()=>{navigator.clipboard.writeText(item.message||""); setOpenMsgMenuId(null);}}>
                                            <Copy size={16} />
                                            <span>Copy</span>
                                        </div>
                                    )}
                                    <div className="wa-menu-item" onClick={()=>{deleteForMe({channelId:selectedChannel._id,senderId,msgId:item._id}); removeLivePoll(item._id); setOpenMsgMenuId(null);}}>
                                        <EyeOff size={16} />
                                        <span>Delete for me</span>
                                    </div>
                                    <div className="wa-menu-item danger" onClick={()=>{deleteForEveryone({channelId:selectedChannel?._id,senderId,msgId:item._id}); removeLivePoll(item._id); setOpenMsgMenuId(null);}}>
                                        <Trash2 size={16} />
                                        <span>Delete for everyone</span>
                                    </div>
                                </>
                            ):(
                                <>
                                    <div className="wa-menu-item" onClick={()=>{deleteForMe({channelId:selectedChannel._id,senderId,msgId:item._id}); removeLivePoll(item._id); setOpenMsgMenuId(null);}}>
                                        <EyeOff size={16} />
                                        <span>Delete for me</span>
                                    </div>
                                    {item.messageType==="text" && (
                                        <div className="wa-menu-item" onClick={()=>{navigator.clipboard.writeText(item.message); setOpenMsgMenuId(null);}}>
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

            {item.messageType==="text" && <span className="message-text">{renderMessageWithLinks(item.message)}</span>}

            {isPoll && renderPollBody(item)}

            {item.mimetype?.startsWith("image/") && (
                <div className="message-file message-image">
                    <img
                        src={`${env.backendUrl}${item.message}`}
                        alt={item.orignalname || "media"}
                        className="message-image-preview"
                        onClick={() => window.open(`${env.backendUrl}${item.message}`, "_blank")}
                    />
                </div>
            )}

            {item.mimetype?.startsWith("video/") && (
                <div className="message-file message-video">
                    <video src={`${env.backendUrl}${item.message}`} controls className="message-video-preview" />
                </div>
            )}

            {item.mimetype === "application/pdf" && (
                <a href={`${env.backendUrl}${item.message}`} target="_blank" rel="noreferrer" className="message-file message-doc">
                    <div className="file-icon pdf-icon">PDF</div>
                    <div className="file-info">
                        <span className="file-name">{item.orignalname || "file"}</span>
                    </div>
                </a>
            )}

            {item.mimetype && !item.mimetype.startsWith("image/") && !item.mimetype.startsWith("video/") && item.mimetype !== "application/pdf" && (
                <a href={`${env.backendUrl}${item.message}`} target="_blank" rel="noreferrer" download className="message-file message-doc">
                    <div className="file-icon generic-icon"><FileText size={18} /></div>
                    <div className="file-info">
                        <span className="file-name">{item.orignalname || "file"}</span>
                    </div>
                </a>
            )}

            {/* EMOJI PICKER OVERLAY */}
            {isReactionOpen && !isChannelDeleted && (
                <div
                    className="gc-emoji-overlay"
                    onClick={(e) => { e.stopPropagation(); setReactionMessage(null); }}
                >
                    <div
                        className="gc-emoji-picker-popup"
                        ref={reactionRef}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <EmojiPicker
                            theme={theme === "dark" ? EmojiTheme.DARK : EmojiTheme.LIGHT}
                            onEmojiClick={(emojiData) => {
                                handleEmojiReaction(item._id, emojiData.emoji);
                                setReactionMessage(null);
                            }}
                        />
                    </div>
                </div>
            )}

            {/* REACTION BADGE - channel delete hone par bhi dikhega aur click karke dekh sakenge */}
            {hasReactions && (
                <div
                    className="gc-reaction-badge"
                    onClick={(e) => {
                        e.stopPropagation();
                        setShowReactionDetail(prev => (prev === item._id ? null : item._id));
                    }}
                >
                    {Object.entries(groupReactions(item.reaction))
                        .sort((a, b) => b[1].length - a[1].length)
                        .slice(0, 3)
                        .map(([emoji]) => (
                            <span key={emoji} className="gc-reaction-emoji">{emoji}</span>
                        ))}
                    <span className="gc-reaction-count">{formatReactionCount(item.reaction.length)}</span>
                </div>
            )}

            {/* REACTION DETAIL POPUP - dekh sakte hain par channel delete hone par add/remove nahi kar sakte */}
            {showReactionDetail === item._id && hasReactions && (
                <div
                    className="gc-reaction-overlay"
                    onClick={(e) => { e.stopPropagation(); setShowReactionDetail(null); }}
                >
                    <div
                        className="gc-reaction-detail-popup"
                        ref={reactionDetailRef}
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="gc-reaction-detail-header">
                            <span>{formatReactionCount(item.reaction.length)} reaction{item.reaction.length > 1 ? "s" : ""}</span>
                            <button
                                type="button"
                                className="gc-reaction-close-btn"
                                onClick={() => setShowReactionDetail(null)}
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <div className="gc-reaction-pills-row">
                            {!isChannelDeleted && (
                                <button
                                    type="button"
                                    className="gc-add-reaction-pill"
                                    title="Add reaction"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setShowReactionDetail(null);
                                        setReactionMessage(item._id);
                                    }}
                                >
                                    <Smile size={15} />
                                    <Plus size={12} />
                                </button>
                            )}
                            {Object.entries(groupReactions(item.reaction))
                                .sort((a, b) => b[1].length - a[1].length)
                                .map(([emoji, users]: [string, any]) => {
                                    const isMine = users.includes(senderId);
                                    return (
                                        <div
                                            key={emoji}
                                            className={`gc-reaction-pill${isMine ? " gc-reaction-pill--mine" : ""}`}
                                            title={isMine && !isChannelDeleted ? "Tap to remove" : undefined}
                                            style={isChannelDeleted ? { cursor: "default" } : undefined}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (isMine && !isChannelDeleted) handleRemoveReaction(item._id, emoji);
                                            }}
                                        >
                                            <span>{emoji}</span>
                                            <span className="gc-reaction-pill-count">{formatReactionCount(users.length)}</span>
                                        </div>
                                    );
                                })}
                        </div>
                    </div>
                </div>
            )}

            {editingMsgId === item._id && !isChannelDeleted && (
                <div className="inline-edit-box" onClick={(e)=>e.stopPropagation()}>
                    <input type="text" value={editText} onChange={(e) => setEditText(e.target.value)} autoFocus />
                    <button type="button" onClick={() => saveEdit(item._id)}>Save</button>
                    <button type="button" onClick={cancelEdit}>Cancel</button>
                </div>
            )}
        </div>
    })}
</div>

                <div
                    className="channel-window-input-wrap"
                    style={
                        isChannelDeleted
                            ? { filter: "blur(2px)", opacity: 0.5, pointerEvents: "none", userSelect: "none" }
                            : undefined
                    }
                >

                    {/* File: choose karte hi auto send */}
                    <div className="footer-file-form">
                        <input
                            ref={fileInputRef}
                            type="file"
                            style={{ display: "none" }}
                            disabled={!canSend || isChannelDeleted}
                            onChange={handleFilePick}
                        />
                        <button
                            type="button"
                            className="footer-icon-btn"
                            title="Attach File"
                            disabled={!canSend || isChannelDeleted}
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <Paperclip size={20} />
                        </button>
                    </div>

                    {/* Poll icon - GroupChat jaisa */}
                    <button
                        type="button"
                        className="footer-icon-btn pollTriggerBtn"
                        title="Create Poll"
                        disabled={!canSend || isChannelDeleted}
                        onClick={() => setShowCreatePoll(true)}
                    >
                        <BarChart2 size={20} />
                    </button>

                    <form onSubmit={handleSubmit} className="message-form">
                        <input
                            disabled={!canSend || isChannelDeleted}
                            type="text"
                            placeholder={isChannelDeleted ? "This channel was deleted" : "Type an Update"}
                            value={messageText}
                            onChange={(e)=>setMessageText(e.target.value)}
                        />
                        <button type="submit" className="send-msg-btn" disabled={!canSend || isChannelDeleted}>
                            <Send size={18} />
                        </button>
                    </form>
                        </div>    
                    </div>
                ) :(
                    <div className="channel-window-empty">
                        <img src="/WhatsApp.svg" alt="WhatsApp" />
                        <p>Select a channel to view it here</p>
                    </div>
                )}
            </div>

            {showCreatePoll && !isChannelDeleted && (
                <div className="wp-themed-modal-scope">
                    <CreatePollModal
                        onClose={() => setShowCreatePoll(false)}
                        onCreate={handleCreatePoll}
                    />
                </div>
            )}
        </div>
    );
}