import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import axiosInstance from "../../services/axiosInstance";
import EmojiPicker from "emoji-picker-react";
import { socket } from "../../utils/socket";
import { env } from "../../configs/env.config";
import "./NearByChat.css";

interface CommunityListItem {
    _id: string;
    communityName: string;
    communityImage?: string;
    searchRadius?: string;
    creatorId?: string;
    members?: string[];
    membersCount?: number;
    distanceInKm?: number;
}

interface CommunityMessage {
    _id: string;
    communityId: string;
    senderId: string;
    message: string;
    messageType: "text" | "file" | "system";
    mimetype?: string;
    orignalname?: string;
    isEdited?: boolean;
    reaction?: { userId: string; emoji: string }[];
    createdAt?: string;
}

const RADIUS_OPTIONS = ["5km", "10km", "15km", "20km", "30km"];

function resolveCommunityImage(image?: string) {
    return image ? (image.startsWith("blob:") ? image : `${env.backendUrl}${image}`) : "/default.webp";
}

function getMembersCount(c: CommunityListItem): number {
    return typeof c.membersCount === "number" ? c.membersCount : (c.members?.length ?? 0);
}

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

const groupReactions = (reactions: { userId: string; emoji: string }[] = []) => {
    return reactions.reduce((acc, r) => {
        if (!acc[r.emoji]) acc[r.emoji] = [];
        acc[r.emoji].push(r.userId);
        return acc;
    }, {} as Record<string, string[]>);
};

export function NearByChat() {
    const location = useLocation();
    const senderId = location.state?.senderId;

    // ---------- geolocation ----------
    const [coords, setCoords] = useState<[number, number] | null>(null);
    const [locationError, setLocationError] = useState<string>("");
    const coordsRef = useRef<[number, number] | null>(null);   

    useEffect(() => {
    coordsRef.current = coords;  
}, [coords]);

    useEffect(() => {
        if (!navigator.geolocation) {
            setLocationError("Geolocation not supported in this browser");
            return;
        }
        let retried = false;
        const options: PositionOptions = { enableHighAccuracy: false, timeout: 15000, maximumAge: 600000 };

        const onSuccess = (pos: GeolocationPosition) => {
            const c: [number, number] = [pos.coords.longitude, pos.coords.latitude];
            setLocationError("");
            setCoords(c);
            // last working location save kar lo, fallback me kaam aayega
            localStorage.setItem("lastCoords", JSON.stringify(c));
        };

        const useFallback = async () => {
            // 1) pichli saved location
            try {
                const saved = localStorage.getItem("lastCoords");
                if (saved) {
                    setLocationError("");
                    setCoords(JSON.parse(saved));
                    return;
                }
            } catch { /* ignore */ }

            // 2) IP se approximate location
            try {
                const r = await fetch("https://ipwho.is/");
                const j = await r.json();
                if (j.success && typeof j.latitude === "number" && typeof j.longitude === "number") {
                    setLocationError("");
                    setCoords([j.longitude, j.latitude]);
                    return;
                }
            } catch { /* ignore */ }

            setLocationError("Could not get your location, check internet and refresh");
        };

        const onError = (err: GeolocationPositionError) => {
            if (err.code === err.PERMISSION_DENIED) {
                setLocationError("Location permission denied, allow it in browser settings");
                return;
            }
            if (!retried) {
                retried = true;
                setTimeout(() => navigator.geolocation.getCurrentPosition(onSuccess, onError, options), 2000);
                return;
            }
            useFallback();
        };

        navigator.geolocation.getCurrentPosition(onSuccess, onError, options);
    }, []);

    // ---------- lists ----------
    const [myCommunities, setMyCommunities] = useState<CommunityListItem[]>([]);
    const [nearbyCommunities, setNearbyCommunities] = useState<CommunityListItem[]>([]);
    const [nearbyPage, setNearbyPage] = useState(2);
    const [hasMoreNearby, setHasMoreNearby] = useState(true);
    const loadMoreRef = useRef(false);

    // ---------- selected community ----------
    const [selectedCommunity, setSelectedCommunity] = useState<CommunityListItem | null>(null);
    const selectedCommunityRef = useRef<string | null>(null);
    const [isCreator, setIsCreator] = useState(false);
    const [creatorCheckDone, setCreatorCheckDone] = useState(false);
    const [totalMembers, setTotalMembers] = useState<number>(0);
    const [justJoinedId, setJustJoinedId] = useState<string | null>(null);

    useEffect(() => {
        selectedCommunityRef.current = selectedCommunity?._id || null;
    }, [selectedCommunity]);

    // ---------- messages ----------
    const [msg, setMsg] = useState<CommunityMessage[]>([]);
    const [messageText, setMessageText] = useState("");
    const [file, setFile] = useState<File | undefined>();

    const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
    const [editText, setEditText] = useState("");

    // ---------- reactions (channel jaisa hi, logic same) ----------
    const [reactionMessage, setReactionMessage] = useState<string | null>(null);
    const [showReactionDetail, setShowReactionDetail] = useState<string | null>(null);
    const reactionRef = useRef<HTMLDivElement | null>(null);
    const reactionDetailRef = useRef<HTMLDivElement | null>(null);

    // ---------- creator inline edit ----------
    const [editingName, setEditingName] = useState(false);
    const [nameDraft, setNameDraft] = useState("");
    const [editingRadius, setEditingRadius] = useState(false);
    const [radiusDraft, setRadiusDraft] = useState("5km");
    const editImageInputRef = useRef<HTMLInputElement | null>(null);

    // ---------- create community modal ----------
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [newCommunityName, setNewCommunityName] = useState("");
    const [newSearchRadius, setNewSearchRadius] = useState("5km");
    const [newImageFile, setNewImageFile] = useState<File | null>(null);
    const [newImagePreview, setNewImagePreview] = useState<string>("");
    const [creating, setCreating] = useState(false);

    useEffect(() => {
        return () => {
            if (newImagePreview) URL.revokeObjectURL(newImagePreview);
        };
    }, [newImagePreview]);

    // ================= my communities + global community events =================
    useEffect(() => {
        if (!senderId) return;

        socket.emit("all_user_community", senderId);

        const handleMyCommunities = (data: CommunityListItem[]) => setMyCommunities(data);

        const handleCreated = (data: CommunityListItem) => {
            setMyCommunities(prev => (prev.some(c => c._id === data._id) ? prev : [data, ...prev]));
        };

        const handleNameUpdated = (data: { communityId: string; communityName: string }) => {
            setMyCommunities(prev => prev.map(c => c._id === data.communityId ? { ...c, communityName: data.communityName } : c));
            setNearbyCommunities(prev => prev.map(c => c._id === data.communityId ? { ...c, communityName: data.communityName } : c));
            setSelectedCommunity(prev => prev && prev._id === data.communityId ? { ...prev, communityName: data.communityName } : prev);
        };

        const handleImageUpdated = (data: { communityId: string; communityImage: string }) => {
            setMyCommunities(prev => prev.map(c => c._id === data.communityId ? { ...c, communityImage: data.communityImage } : c));
            setNearbyCommunities(prev => prev.map(c => c._id === data.communityId ? { ...c, communityImage: data.communityImage } : c));
            setSelectedCommunity(prev => prev && prev._id === data.communityId ? { ...prev, communityImage: data.communityImage } : prev);
        };

        const handleRadiusUpdated = (data: { communityId: string; searchRadius: string }) => {
            setMyCommunities(prev => prev.map(c => c._id === data.communityId ? { ...c, searchRadius: data.searchRadius } : c));
            setSelectedCommunity(prev => prev && prev._id === data.communityId ? { ...prev, searchRadius: data.searchRadius } : prev);
        };

            const handleMembers = (data: { communityId: string; totalMembersLength: number }) => {
            setMyCommunities(prev => prev.map(c => c._id === data.communityId ? { ...c, membersCount: data.totalMembersLength } : c));
            setNearbyCommunities(prev => prev.map(c => c._id === data.communityId ? { ...c, membersCount: data.totalMembersLength } : c));
            if (data.communityId === selectedCommunityRef.current) {
                setTotalMembers(data.totalMembersLength);
            }
        };

        const handleDeleted = (data: { communityId: string }) => {
    const wasOpen = selectedCommunityRef.current === data.communityId; 
    setMyCommunities(prev => prev.filter(c => c._id !== data.communityId));
    setNearbyCommunities(prev => prev.filter(c => c._id !== data.communityId));
    setSelectedCommunity(prev => (prev && prev._id === data.communityId ? null : prev));
    if (wasOpen) {
        alert("This community has been deleted by the creator");
    }
};

        const handleDeletedAlert = (data: { communityId: string }) => {
            if (selectedCommunityRef.current === data.communityId) {
                alert("This community has been deleted by the creator");
            }
        };

        const handleJoined = (data: { communityId: string; userId: string }) => {
            setNearbyCommunities(prev => prev.filter(c => c._id !== data.communityId));
            socket.emit("all_user_community", senderId);
            setJustJoinedId(data.communityId);
        };

    const handleLeft = (data: { communityId: string; userId: string }) => {
    setMyCommunities(prev => prev.filter(c => c._id !== data.communityId));
    setSelectedCommunity(prev => (prev && prev._id === data.communityId ? null : prev));

    if (coordsRef.current) {
        loadMoreRef.current = false;
        setNearbyPage(2);
        setHasMoreNearby(true);
        socket.emit("show_nearby_communities", { userId: senderId, coordinates: coordsRef.current, page: 1 });
    }
};

        socket.on("all_user_community", handleMyCommunities);
        socket.on("communityCreate", handleCreated);
        socket.on("community_name_updated", handleNameUpdated);
        socket.on("community_image_updated", handleImageUpdated);
        socket.on("search_radius_updated", handleRadiusUpdated);
        socket.on("community_members", handleMembers);
        socket.on("community_deleted", handleDeleted);
        socket.on("show_community_deleted_alert", handleDeletedAlert);
        socket.on("user_joined_community", handleJoined);
        socket.on("community_left", handleLeft);

        return () => {
            socket.off("all_user_community", handleMyCommunities);
            socket.off("communityCreate", handleCreated);
            socket.off("community_name_updated", handleNameUpdated);
            socket.off("community_image_updated", handleImageUpdated);
            socket.off("search_radius_updated", handleRadiusUpdated);
            socket.off("community_members", handleMembers);
            socket.off("community_deleted", handleDeleted);
            socket.off("show_community_deleted_alert", handleDeletedAlert);
            socket.off("user_joined_community", handleJoined);
            socket.off("community_left", handleLeft);
        };
    }, [senderId]);

    // join hone ke baad turant chat khol do jab list refresh ho jaaye
    useEffect(() => {
        if (!justJoinedId) return;
        const found = myCommunities.find(c => c._id === justJoinedId);
        if (found) {
            setSelectedCommunity(found);
            setTotalMembers(getMembersCount(found));
            setJustJoinedId(null);
        }
    }, [myCommunities, justJoinedId]);

    // ================= nearby communities (dashboard right side discover) =================
    useEffect(() => {
        if (!senderId || !coords) return;
        loadMoreRef.current = false;
        setNearbyCommunities([]);
        setHasMoreNearby(true);
        setNearbyPage(2);
        socket.emit("show_nearby_communities", { userId: senderId, coordinates: coords, page: 1 });
    }, [senderId, coords]);

    useEffect(() => {
        const handleNearby = (data: CommunityListItem[]) => {
            if (data.length === 0) {
                setHasMoreNearby(false);
                return;
            }
            setNearbyCommunities(prev => (loadMoreRef.current ? [...prev, ...data] : data));
        };
        socket.on("got_nearby_communities", handleNearby);
        return () => { socket.off("got_nearby_communities", handleNearby); };
    }, []);

    const loadMoreNearby = () => {
        if (!senderId || !coords) return;
        loadMoreRef.current = true;
        socket.emit("show_nearby_communities", { userId: senderId, coordinates: coords, page: nearbyPage });
        setNearbyPage(prev => prev + 1);
    };

    // ================= active community + creator check =================
    useEffect(() => {
        if (!selectedCommunity?._id || !senderId) return;

        setCreatorCheckDone(false);
        socket.emit("active_community_user", { communityId: selectedCommunity._id, senderId });
        socket.emit("community_data", { communityId: selectedCommunity._id, userId: senderId });
        socket.emit("all_prev_community_msg", { communityId: selectedCommunity._id, senderId });

        const handleCommunityData = (data: { communityId: string; userId: string; showEditOption: string }) => {
            if (data.communityId !== selectedCommunity._id) return;
            setIsCreator(data.showEditOption === "show");
            setCreatorCheckDone(true);
        };

        socket.on("community_data", handleCommunityData);

        return () => {
            socket.emit("not_active_community_user", { senderId });
            socket.off("community_data", handleCommunityData);
            setIsCreator(false);
            setCreatorCheckDone(false);
        };
    }, [selectedCommunity?._id, senderId]);

    // ================= messages =================
    useEffect(() => {
        if (!selectedCommunity?._id || !senderId) return;
        setMsg([]);

        const handlePrevMsg = (data: CommunityMessage[]) => setMsg(data);

        const handleReceive = (data: CommunityMessage) => {
            if (data.communityId !== selectedCommunity._id) return;
            setMsg(prev => (prev.some(m => m._id === data._id) ? prev : [...prev, data]));
        };

        const handleDeleted = (data: { communityId: string; msgId: string }) => {
            if (data.communityId !== selectedCommunity._id) return;
            setMsg(prev => prev.filter(m => m._id !== data.msgId));
        };

        const handleUpdated = (data: CommunityMessage) => {
            setMsg(prev => prev.map(m => (m._id === data._id ? data : m)));
        };

        const handleReactionUpdated = (data: CommunityMessage) => {
            if (data.communityId !== selectedCommunity._id) return;
            setMsg(prev => prev.map(m => (m._id === data._id ? data : m)));
        };

        socket.on("prev_community_message", handlePrevMsg);
        socket.on("receive_community_message", handleReceive);
        socket.on("community_msg_deleted", handleDeleted);
        socket.on("communityMsgUpdated", handleUpdated);
        socket.on("community_emoji_updated", handleReactionUpdated);

        return () => {
            socket.off("prev_community_message", handlePrevMsg);
            socket.off("receive_community_message", handleReceive);
            socket.off("community_msg_deleted", handleDeleted);
            socket.off("communityMsgUpdated", handleUpdated);
            socket.off("community_emoji_updated", handleReactionUpdated);
        };
    }, [selectedCommunity?._id, senderId]);

    // reaction popups ke bahar click - channel jaisa hi
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

    // ================= handlers =================

    const handleOpenMyCommunity = (c: CommunityListItem) => {
        setSelectedCommunity(c);
        setTotalMembers(getMembersCount(c));
    };

    const handleJoinAndOpen = (c: CommunityListItem) => {
        socket.emit("join_community", { communityId: c._id, userId: senderId });
    };

    const handleLeaveCommunity = () => {
        if (!selectedCommunity) return;
        socket.emit("leave_community", { communityId: selectedCommunity._id, userId: senderId });
    };

    const handleDeleteCommunity = () => {
        if (!selectedCommunity) return;
        if (!window.confirm("Are you sure you want to delete this community?")) return;
        socket.emit("delete_community", { communityId: selectedCommunity._id, creatorId: senderId });
    };

    const startEditName = () => {
        if (!selectedCommunity) return;
        setNameDraft(selectedCommunity.communityName);
        setEditingName(true);
    };
    const saveNameEdit = () => {
        if (!selectedCommunity || nameDraft.trim().length < 3) return;
        socket.emit("edit_community_name", { communityId: selectedCommunity._id, creatorId: senderId, communityName: nameDraft });
        setEditingName(false);
    };

    const startEditRadius = () => {
        if (!selectedCommunity) return;
        setRadiusDraft(selectedCommunity.searchRadius || "5km");
        setEditingRadius(true);
    };
    const saveRadiusEdit = () => {
        if (!selectedCommunity) return;
        socket.emit("edit_search_radius", { communityId: selectedCommunity._id, creatorId: senderId, searchRadius: radiusDraft });
        setEditingRadius(false);
    };

    const handleEditImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!selectedCommunity) return;
        const f = e.target.files?.[0];
        if (!f) return;

        // upload hote waqt turant local preview dikhado
        const previewUrl = URL.createObjectURL(f);
        setSelectedCommunity(prev => (prev ? { ...prev, communityImage: previewUrl } : prev));

        const formData = new FormData();
        formData.append("file", f);
        const res = await axiosInstance.post("/upload", formData);
        if (res.data.success) {
            socket.emit("edit_community_image", {
                communityId: selectedCommunity._id,
                creatorId: senderId,
                communityImage: res.data.data.path,
            });
        }
        URL.revokeObjectURL(previewUrl);
    };

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!selectedCommunity) return;
        if (messageText.trim().length === 0) {
            alert("message cannot be empty");
            return;
        }
        socket.emit("community_msg_creation", {
            communityId: selectedCommunity._id,
            senderId,
            message: messageText,
            messageType: "text",
        });
        setMessageText("");
    };

    const handleFileSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!selectedCommunity) return;
        if (!file) {
            alert("file not found");
            return;
        }
        const formData = new FormData();
        formData.append("file", file);
        const res = await axiosInstance.post("/upload", formData);
        if (res.data.success) {
            const data = res.data.data;
            socket.emit("community_msg_creation", {
                communityId: selectedCommunity._id,
                senderId,
                message: data.path,
                messageType: "file",
                mimetype: data.mimetype,
                orignalname: data.orignalname,
            });
            setFile(undefined);
        }
    };

    const handleEditClick = (item: CommunityMessage) => {
        setEditingMsgId(item._id);
        setEditText(item.message);
    };
    const cancelEdit = () => {
        setEditingMsgId(null);
        setEditText("");
    };
    const saveEdit = (msgId: string) => {
        if (!selectedCommunity || editText.trim().length === 0) return;
        socket.emit("edit_community_msg", { communityId: selectedCommunity._id, senderId, msgId, message: editText });
        setEditingMsgId(null);
        setEditText("");
    };
    const handleDelete = (msgId: string) => {
        if (!selectedCommunity) return;
        socket.emit("delete_community_msg", { communityId: selectedCommunity._id, senderId, msgId });
    };

    const handleEmojiReaction = (msgId: string, emoji: string) => {
        if (!selectedCommunity) return;
        socket.emit("community_reaction", { communityId: selectedCommunity._id, msgId, senderId, emoji });
    };
    const handleRemoveReaction = (msgId: string, currentEmoji: string) => {
        handleEmojiReaction(msgId, currentEmoji);
        setShowReactionDetail(null);
    };

    const handleNewImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        if (!f) return;
        setNewImageFile(f);
        setNewImagePreview(URL.createObjectURL(f));
    };

    const handleCreateCommunity = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (newCommunityName.trim().length < 3) {
            alert("community name must be at least 3 characters");
            return;
        }
        if (!coords) {
            alert("location not available yet, please allow location access");
            return;
        }
        try {
            setCreating(true);
            let imagePath = "";
            if (newImageFile) {
                const formData = new FormData();
                formData.append("file", newImageFile);
                const res = await axiosInstance.post("/upload", formData);
                if (res.data.success) {
                    imagePath = res.data.data.path;
                }
            }
            socket.emit("create_community", {
                creatorId: senderId,
                communityName: newCommunityName,
                searchRadius: newSearchRadius,
                communityImage: imagePath,
                location: { coordinates: coords },
            });
            setShowCreateModal(false);
            setNewCommunityName("");
            setNewSearchRadius("5km");
            setNewImageFile(null);
            setNewImagePreview("");
        } finally {
            setCreating(false);
        }
    };

    // ================= render helpers =================

    const renderMyCommunityRow = (c: CommunityListItem) => (
        <div
            key={c._id}
            className={`community-row ${selectedCommunity?._id === c._id ? "community-row--active" : ""}`}
            onClick={() => handleOpenMyCommunity(c)}
        >
            <img className="community-row-avatar" src={resolveCommunityImage(c.communityImage)} alt={c.communityName} />
            <div className="community-row-info">
                <span className="community-row-name">{c.communityName}</span>
                <span className="community-row-meta">{getMembersCount(c)} members · {c.searchRadius || "5km"} radius</span>
            </div>
        </div>
    );

    const renderNearbyRow = (c: CommunityListItem) => (
        <div key={c._id} className="community-row">
            <img className="community-row-avatar" src={resolveCommunityImage(c.communityImage)} alt={c.communityName} />
            <div className="community-row-info">
                <span className="community-row-name">{c.communityName}</span>
                <span className="community-row-meta">
                    {typeof c.distanceInKm === "number" ? `${c.distanceInKm} km away · ` : ""}{c.searchRadius || "5km"} radius
                </span>
            </div>
            <button type="button" className="community-join-btn" onClick={() => handleJoinAndOpen(c)}>
                Join
            </button>
        </div>
    );

    return (
        <div className="community-chat-page">
            <div className="community-list-column">
                <div className="community-list-header">
                    <h1>Nearby</h1>
                    <button className="community-new-btn" onClick={() => setShowCreateModal(true)} type="button">+ New</button>
                </div>

                {locationError && <p className="community-empty">{locationError}</p>}

                {myCommunities.length > 0 && (
                    <div className="community-section">
                        <p className="community-section-title">Your communities</p>
                        {myCommunities.map(renderMyCommunityRow)}
                    </div>
                )}

                <div className="community-section">
                    <p className="community-section-title">Discover nearby</p>
                    {nearbyCommunities.length === 0 && (
                        <p className="community-empty">No communities nearby right now</p>
                    )}
                    {nearbyCommunities.map(renderNearbyRow)}
                    {hasMoreNearby && nearbyCommunities.length > 0 && (
                        <button className="community-load-more" onClick={loadMoreNearby} type="button">
                            Load more
                        </button>
                    )}
                </div>

                {showCreateModal && (
                    <div className="community-create-modal-backdrop" onClick={() => setShowCreateModal(false)}>
                        <form className="community-create-modal" onClick={(e) => e.stopPropagation()} onSubmit={handleCreateCommunity}>
                            <h2>Create Community</h2>

                            <div className="community-create-image-picker">
                                <img src={newImagePreview || "/default.webp"} alt="preview" className="community-create-image-preview" />
                                <input type="file" accept="image/*" onChange={handleNewImageChange} />
                            </div>

                            <input
                                type="text"
                                placeholder="Community name"
                                value={newCommunityName}
                                onChange={(e) => setNewCommunityName(e.target.value)}
                            />

                            <select value={newSearchRadius} onChange={(e) => setNewSearchRadius(e.target.value)}>
                                {RADIUS_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                            </select>

                            {!coords && <p className="community-empty">Waiting for location access...</p>}

                            <div className="community-create-actions">
                                <button type="button" onClick={() => setShowCreateModal(false)}>Cancel</button>
                                <button type="submit" disabled={creating || !coords}>{creating ? "Creating..." : "Create"}</button>
                            </div>
                        </form>
                    </div>
                )}
            </div>

            <div className="community-window-column">
                {selectedCommunity ? (
                    <div className="community-window">
                        <div className="community-window-header">
                            <div className="community-window-info" style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                <img className="community-window-avatar" src={resolveCommunityImage(selectedCommunity.communityImage)} alt={selectedCommunity.communityName} />
                                <div>
                                    {editingName ? (
                                        <div className="inline-edit-box">
                                            <input value={nameDraft} onChange={(e) => setNameDraft(e.target.value)} autoFocus />
                                            <button type="button" onClick={saveNameEdit}>Save</button>
                                            <button type="button" onClick={() => setEditingName(false)}>Cancel</button>
                                        </div>
                                    ) : (
                                        <span className="community-window-name">{selectedCommunity.communityName}</span>
                                    )}
                                    <div className="community-window-meta">
                                        {totalMembers} members · {selectedCommunity.searchRadius || "5km"} radius
                                    </div>
                                </div>
                            </div>

                            <div className="community-window-actions">
                                {creatorCheckDone && (isCreator ? (
                                    <>
                                        <button type="button" onClick={startEditName}>Edit name</button>
                                        <button type="button" onClick={() => editImageInputRef.current?.click()}>Edit image</button>
                                        <input ref={editImageInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleEditImageChange} />
                                        {editingRadius ? (
                                            <span className="inline-edit-box">
                                                <select value={radiusDraft} onChange={(e) => setRadiusDraft(e.target.value)}>
                                                    {RADIUS_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                                                </select>
                                                <button type="button" onClick={saveRadiusEdit}>Save</button>
                                                <button type="button" onClick={() => setEditingRadius(false)}>Cancel</button>
                                            </span>
                                        ) : (
                                            <button type="button" onClick={startEditRadius}>Edit radius</button>
                                        )}
                                        <button type="button" className="community-delete-btn" onClick={handleDeleteCommunity}>Delete community</button>
                                    </>
                                ) : (
                                    <button type="button" className="community-leave-btn" onClick={handleLeaveCommunity}>Leave</button>
                                ))}
                            </div>
                        </div>

                        <div className="community-window-messages">
                            {msg.map((item) => {
                                const mine = item.senderId?.toString() === senderId?.toString();

                                if (item.messageType === "system") {
                                    return (
                                        <div key={item._id} className="message system">
                                            <span className="message-text">{item.message}</span>
                                        </div>
                                    );
                                }

                                return (
                                    <div key={item._id} className={mine ? "message sender" : "message receiver"}>
                                        {item.messageType === "text" && (
                                            <span className="message-text">
                                                {item.message}{item.isEdited ? " (edited)" : ""}
                                            </span>
                                        )}

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

                                        {/* emoji reaction - ChannelChat jaisa hi, logic bilkul same */}
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

                                        {showReactionDetail === item._id && item.reaction && (
                                            <div className="reaction-detail-popup" ref={reactionDetailRef}>
                                                <div className="reaction-detail-header">
                                                    {formatReactionCount(item.reaction.length)} reaction{item.reaction.length > 1 ? "s" : ""}
                                                </div>
                                                <div className="reaction-pills-row">
                                                    {Object.entries(groupReactions(item.reaction))
                                                        .sort((a, b) => b[1].length - a[1].length)
                                                        .map(([emoji, users]) => {
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

                                        {mine && (
                                            <div className="message-menu">
                                                <button className="menu-button" onClick={(e) => e.stopPropagation()}>⋮</button>
                                                <div className="message-menu-dropdown">
                                                    {item.messageType === "text" && <button onClick={() => handleEditClick(item)}>Edit</button>}
                                                    {item.messageType === "text" && <button onClick={() => navigator.clipboard.writeText(item.message || "")}>Copy</button>}
                                                    <button onClick={() => handleDelete(item._id)}>Delete</button>
                                                </div>
                                            </div>
                                        )}

                                        {editingMsgId === item._id && (
                                            <div className="inline-edit-box" onClick={(e) => e.stopPropagation()}>
                                                <input type="text" value={editText} onChange={(e) => setEditText(e.target.value)} autoFocus />
                                                <button type="button" onClick={() => saveEdit(item._id)}>Save</button>
                                                <button type="button" onClick={cancelEdit}>Cancel</button>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        <div className="community-window-input-wrap">
                            <form onSubmit={handleSubmit}>
                                <input
                                    type="text"
                                    placeholder="Type a message"
                                    value={messageText}
                                    onChange={(e) => setMessageText(e.target.value)}
                                />
                                <button type="submit">Send</button>
                            </form>

                            <form onSubmit={handleFileSubmit}>
                                <input type="file" onChange={(e) => setFile(e.target.files?.[0])} />
                                <button type="submit">Send</button>
                            </form>
                        </div>
                    </div>
                ) : (
                    <div className="community-window-empty">
                        <p>Select a community to view it here</p>
                    </div>
                )}
            </div>
        </div>
    );
}