import { useLocation } from "react-router-dom";
import { socket } from "../../utils/socket";
import { useEffect, useState, useRef } from "react";
import { CreateChannel } from "../../components/CreateChannel/CreateChannel";
import { env } from "../../configs/env.config";
import { ChannelHook } from "../../hooks/use.channel.hook";
import { userChatListPresence } from "../../services/user.presence.service";
import { ChannelProfile } from "../../components/ChannelsProfile/ChannelsProfile";
import EmojiPicker from "emoji-picker-react";
import { renderMessageWithLinks } from "../../utils/linkify/linkify";
import axiosInstance from "../../services/axiosInstance";
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

function resolveChannelPic(profilePic?: string) {
    return profilePic ? `${env.backendUrl}${profilePic}` : "/default.webp";
}

// function getFollowerCount(ch: ChannelListItem): number {
//     return typeof ch.followersCount === "number" ? ch.followersCount : (ch.followers?.length ?? 0);
// }

// function formatFollowers(count: number): string {
//     if (count >= 1_000_000) {
//         const v = count / 1_000_000;
//         return `${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)}M followers`;
//     }
//     if (count >= 1_000) {
//         const v = count / 1_000;
//         return `${v % 1 === 0 ? v.toFixed(0) : v.toFixed(1)}k followers`;
//     }
//     return `${count} follower${count === 1 ? "" : "s"}`;
// }

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
    const [file,setFile]=useState<File>();
    const [channelLastMessages, setChannelLastMessages] = useState<any[]>([]);
    const [channelPendingCounts, setChannelPendingCounts] = useState<{id:string; count:number}[]>([]);
    // emoji reaction ke liye states - GroupChat ke reactionMessage/showReactionDetail jaisa hi
    const [reactionMessage, setReactionMessage] = useState<string | null>(null);
    const [showReactionDetail, setShowReactionDetail] = useState<string | null>(null);
    const reactionRef = useRef<HTMLDivElement | null>(null);
    const reactionDetailRef = useRef<HTMLDivElement | null>(null);
    // channel info (profile) sliding panel ke liye state
    const [showChannelProfile, setShowChannelProfile] = useState<boolean>(false);

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



const handleProfilePicUpdated = (data: {
    channelId: string;
    message: string;
}) => {
    setMyChannels(prev =>
        prev.map(channel=>channel._id.toString() === data.channelId.toString()
        ?{ ...channel, profilePic: data.message }:channel
        )
    );

    setRandomChannels(prev=>prev.map(channel =>channel._id.toString() === data.channelId.toString()
                ? { ...channel, profilePic: data.message }:channel
        )
    );

    setExploreChannels(prev =>
        prev.map(channel=>channel._id.toString() === data.channelId.toString()
                ? { ...channel, profilePic: data.message }: channel
        )
    );

    setSelectedChannel(prev =>
        prev && prev._id.toString() === data.channelId.toString()?
        {...prev, profilePic: data.message}:prev
    );
};



const handleNameUpdated=(data:{channelId:string,name:string})=>{
    setMyChannels(prev =>
        prev.map(channel =>channel._id.toString()===data.channelId.toString()
                ? {...channel,name:data.name}: channel
        )
    );
    setRandomChannels(prev =>
        prev.map(channel =>channel._id.toString()===data.channelId.toString()
                ? {...channel,name:data.name}:channel
        )
    );
    setExploreChannels(prev =>
        prev.map(channel =>
            channel._id.toString()===data.channelId.toString()
                ? {...channel,name:data.name}:channel
        )
    );
    setSelectedChannel(prev =>
        prev && prev._id.toString()===data.channelId.toString()
            ? {...prev,name:data.name}:prev
    );
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


        return () => {
            socket.off("channel_created", handleCreated);
            socket.off("all_user_channel", handleChannel);
            socket.off("got_all_random_channels", allrandomchannels);
            socket.off("category_data", handleExploreData);
            socket.off("toggle_follow", handleToggleFollow);
            socket.off("canSendMessage",handleCanSend);
            socket.off("channel_pic_updated",handleProfilePicUpdated);
            socket.off("channel_name_updated",handleNameUpdated);
        };
    }, []);

useEffect(() => {
    if (!selectedChannel?._id || !senderId) return;
    socket.emit("active_channel_user",{channelId:selectedChannel._id,senderId});
  
    socket.emit("_isFollowing",({channelId:selectedChannel._id,senderId}));

    socket.on("channel_following",handleFollowing);
    return()=>{
        socket.emit("not_active_channel_user",{channelId:selectedChannel._id,senderId});
        socket.off("channel_following",handleFollowing);
    };
}, [selectedChannel?._id, senderId]);

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

    // emoji picker ke bahar click hone par band ho jaye
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (reactionRef.current && !reactionRef.current.contains(event.target as Node)) {
                setReactionMessage(null);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // reaction detail popup ke bahar click hone par band ho jaye
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (reactionDetailRef.current && !reactionDetailRef.current.contains(event.target as Node)) {
                setShowReactionDetail(null);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    
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
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span className="channel-row-name">{ch.name}</span>
                        <span style={{ fontSize: "12px", color: "#667781" }}>
                            {last ? userChatListPresence(last.updatedAt) : ""}
                        </span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span
                            className="channel-row-last-msg"
                            style={{ fontSize: "13px", color: "#667781", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "180px" }}
                        >
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
            {/* <span className="find-row-count">{formatFollowers(getFollowerCount(ch))}</span> */}
        </div>
        <button className="find-follow-btn" onClick={handleFollowButton}
            type="button">Follow</button>
    </div>
);

const {msg,editMsg,deleteForMe,deleteForEveryone,sendFileMsg,sendMessage,sendReaction}=ChannelHook(selectedChannel?._id,senderId);

const handleSubmit=async(e:React.FormEvent<HTMLFormElement>)=>{
    e.preventDefault();
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
    setEditingMsgId(item._id);
    setEditText(item.message);
};

const cancelEdit = () => {
    setEditingMsgId(null);
    setEditText("");
};

const saveEdit = (msgId: string) => {
    if (editText.trim().length === 0) return;
    editMsg({channelId:selectedChannel!._id,senderId,msgId,message:editText});
    setEditingMsgId(null);
    setEditText("");
};

const handleFileSubmit=async(e:React.FormEvent<HTMLFormElement>)=>{
    e.preventDefault();
    if(!file){
        alert("file not found");
        return;
    }
    const formData=new FormData();
    formData.append("file",file);    
    const res=await axiosInstance.post("/upload",formData);
    if(res.data.success){
        const data=res.data.data;
        sendFileMsg({channelId:selectedChannel!._id,senderId,message:data.path,messageType:"file",mimetype:data.mimetype,
            orignalname:data.orignalname,sizeInKb:data.sizeInKb,sizeInMb:data.sizeInMb})
    }
}

// reactions ko emoji ke hisaab se group karta hai - GroupChat ka groupReactions helper, hubahu
const groupReactions = (reactions: { userId: string; emoji: string }[] = []) => {
    return reactions.reduce((acc, r) => {
        if (!acc[r.emoji]) acc[r.emoji] = [];
        acc[r.emoji].push(r.userId);
        return acc;
    }, {} as Record<string, string[]>);
};

const handleEmojiReaction=(msgId:string,emoji:string)=>{
    if(!selectedChannel) return;
    sendReaction({channelId:selectedChannel._id,msgId,senderId,emoji});
};

// apna hi reaction hai toh use dobara bhej ke toggle-off karna (backend same-emoji pe hata deta hai)
const handleRemoveReaction = (msgId: string, currentEmoji: string) => {
    handleEmojiReaction(msgId, currentEmoji);
    setShowReactionDetail(null);
};

    return (
        <div className="channel-chat-page">
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
                                onClick={() => setShowChannelProfile(true)}
                                style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer", flex: 1 }}
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

                          {!isCreator && (
                            <button className="channel-follow-btn" onClick={handleFollowButton}>{showFollwingButton?"Follow":"Unfollow"}</button>
                          )}
                        </div>

                        {showChannelProfile && selectedChannel && (
                            <ChannelProfile
                                onBack={() => setShowChannelProfile(false)}
                                senderId={senderId}
                                channelId={selectedChannel._id}
                                isCreator={isCreator}
                            />
                        )}

<div className="channel-window-messages">
    {msg.map((item:any)=>{
        const mine=item.senderId?.toString()===senderId?.toString();
        return <div key={item._id} className={mine ? "message sender" : "message receiver"}>
            {item.messageType==="text" && <span className="message-text">{renderMessageWithLinks(item.message)}</span>}

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
                    <div className="file-icon generic-icon">📄</div>
                    <div className="file-info">
                        <span className="file-name">{item.orignalname || "file"}</span>
                    </div>
                </a>
            )}

            {/* emoji reaction button - GroupChat jaisa hi */}
            <button className="reaction-btn" onClick={(e) => { e.stopPropagation(); setReactionMessage(item._id); }}>
                😊
            </button>

            {reactionMessage === item._id && (
                <div className="emoji-picker-popup" ref={reactionRef}>
                    <EmojiPicker
                        onEmojiClick={(emojiData) => {
                            handleEmojiReaction(item._id, emojiData.emoji);
                            setReactionMessage(null);
                        }}
                    />
                </div>
            )}

            {item.reaction && item.reaction.length > 0 && (
                <div className="reaction-badge" onClick={(e) => { e.stopPropagation(); setShowReactionDetail(item._id); }}>
                    {Object.entries(groupReactions(item.reaction))
                        .sort((a, b) => b[1].length - a[1].length)
                        .slice(0, 3)
                        .map(([emoji]) => (
                            <span key={emoji}>{emoji}</span>
                        ))}
                    <span className="reaction-count">{formatReactionCount(item.reaction.length)}</span>
                </div>
            )}

            {showReactionDetail === item._id && (
                <div className="reaction-detail-popup" ref={reactionDetailRef}>
                    <div className="reaction-detail-header">
                        {formatReactionCount(item.reaction.length)} reaction{item.reaction.length > 1 ? "s" : ""}
                    </div>

                    <div className="reaction-pills-row">
                        {Object.entries(groupReactions(item.reaction))
                            .sort((a, b) => b[1].length - a[1].length)
                            .map(([emoji, users]: [string, any]) => {
                                const isMine = users.includes(senderId);
                                return (
                                    <div
                                        key={emoji}
                                        className={`reaction-pill ${isMine ? "reaction-pill--mine" : ""}`}
                                        onClick={(e) => { e.stopPropagation(); if (isMine) handleRemoveReaction(item._id, emoji); }}
                                    >
                                        <span>{emoji}</span>
                                        <span>{formatReactionCount(users.length)}</span>
                                    </div>
                                );
                            })}
                    </div>
                </div>
            )}

            <div className="message-menu">
                <button className="menu-button" onClick={(e)=>e.stopPropagation()}>⋮</button>
                <div className="message-menu-dropdown">
                    {mine ? (
                        <>
                            {item.messageType==="text" && <button onClick={()=>handleEditClick(item)}>Edit</button>}
                            {item.messageType==="text" && <button onClick={()=>navigator.clipboard.writeText(item.message||"")}>Copy</button>}
                            <button onClick={()=>deleteForMe({channelId:selectedChannel._id,senderId,msgId:item._id})}>Delete for me</button>
                            <button onClick={()=>deleteForEveryone({channelId:selectedChannel?._id,senderId,msgId:item._id})}>Delete for everyone</button>
                        </>
                    ):(
                        <>
                          <button onClick={()=>deleteForMe({channelId:selectedChannel._id,senderId,msgId:item._id})}>Delete for me</button>
                          {item.messageType==="text" && <button onClick={()=>navigator.clipboard.writeText(item.message)}>Copy</button>}
                        </>
                      )}
                </div>
            </div>

            {editingMsgId === item._id && (
                <div className="inline-edit-box" onClick={(e)=>e.stopPropagation()}>
                    <input type="text" value={editText} onChange={(e) => setEditText(e.target.value)} autoFocus />
                    <button type="button" onClick={() => saveEdit(item._id)}>Save</button>
                    <button type="button" onClick={cancelEdit}>Cancel</button>
                </div>
            )}
        </div>
    })}
</div>

                <div className="channel-window-input-wrap">

                    <form onSubmit={handleSubmit}>
                        <input  disabled={!canSend} type="text" placeholder="Type an Update" 
                        value={messageText} onChange={(e)=>setMessageText(e.target.value)} />
                        <button disabled={!canSend}>Send</button>
                    </form>

                    <form onSubmit={handleFileSubmit}>
                        <input type="file" disabled={!canSend} placeholder="Type an Update" onChange={(e)=>setFile(e.target.files?.[0])} />
                         <button disabled={!canSend} type="submit">Send</button>
                    </form>
                        </div>    
                    </div>
                ) :(
                    <div className="channel-window-empty">
                        <p>Select a channel to view it here</p>
                    </div>
                )}
            </div>
        </div>
    );
}