import { useEffect, useRef, useState, Fragment } from "react";
import { useLocation } from "react-router-dom";
import axiosInstance from "../../services/axiosInstance";
import EmojiPicker from "emoji-picker-react";
import { FiSun, FiMoon, FiPaperclip } from "react-icons/fi";
import { Pencil, Trash2, Copy, Download } from "lucide-react";
import { FooterEmoji } from "../../components/FooterEmoji/FooterEmoji";
import { socket } from "../../utils/socket";
import { env } from "../../configs/env.config";
import { showApiError } from "../../utils/showApiError";
import "./NearByChat.css";

interface CommunityListItem {
    _id: string;
    communityName: string;
    communityImage?: string;
    image?: string;
    avatar?: string;
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
    originalname?: string;
    filename?: string;
    sizeInKb?: number | string;
    sizeInMb?: number | string;
    isEdited?: boolean;
    reaction?: { userId: string; emoji: string }[];
    createdAt?: string;
}

const RADIUS_OPTIONS = ["5km", "10km", "15km", "20km", "30km"];
const AVATAR_COLORS = ["#FF6B6B", "#4ECDC4", "#45B7D1", "#F7B731", "#5F27CD", "#10AC84", "#EE5253", "#2E86DE"];

function getAvatarColor(name?: string) {
    return AVATAR_COLORS[(name?.charCodeAt(0) || 0) % AVATAR_COLORS.length];
}

// Robust image resolver so images work in both sidebar list & top header
function resolveCommunityImage(c?: CommunityListItem | string | null): string {
    const raw =
        typeof c === "string"
            ? c
            : c?.communityImage || (c as any)?.image || (c as any)?.avatar || "";
    if (!raw || typeof raw !== "string" || !raw.trim()) return "";
    const trimmed = raw.trim().replace(/\\/g, "/");
    if (/^(https?:|data:|blob:)/i.test(trimmed)) return trimmed;
    const base = (env.backendUrl || "").replace(/\/+$/, "");
    const path = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
    return `${base}${path}`;
}

function resolveFileUrl(path?: string): string {
    if (!path) return "";
    const trimmed = path.trim().replace(/\\/g, "/");
    if (/^(https?:|data:|blob:)/i.test(trimmed)) return trimmed;
    const base = (env.backendUrl || "").replace(/\/+$/, "");
    const cleanPath = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
    return `${base}${cleanPath}`;
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

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

const dateLabel = (iso?: string | Date): string => {
    if (!iso) return "";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    const diffDays = Math.round((startOfDay(new Date()) - startOfDay(d)) / 86400000);
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    if (diffDays > 1 && diffDays < 7) return d.toLocaleDateString("en-US", { weekday: "long" });
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
};

const fileExt = (name?: string) => (name?.includes(".") ? name.split(".").pop()! : "FILE").toUpperCase().slice(0, 4);

const fileColor = (ext: string): string =>
    ({
        PDF: "#e5493a",
        DOC: "#2b7cd3",
        DOCX: "#2b7cd3",
        XLS: "#1f9d55",
        XLSX: "#1f9d55",
        CSV: "#1f9d55",
        PPT: "#e0752d",
        PPTX: "#e0752d",
        ZIP: "#7d8a93",
        RAR: "#7d8a93",
    } as Record<string, string>)[ext] || "#667781";

const fileSize = (kb?: any, mb?: any) => {
    if (mb && Number(mb) >= 1) return `${mb} MB`;
    if (kb) return `${kb} KB`;
    return "";
};

// Reusable Avatar component with automatic image fallback for both list & header
function CommunityAvatar({
    community,
    className,
}: {
    community: CommunityListItem;
    className: string;
}) {
    const [imgErr, setImgErr] = useState(false);
    const src = resolveCommunityImage(community);

    useEffect(() => {
        setImgErr(false);
    }, [src]);

    if (src && !imgErr) {
        return (
            <img
                className={className}
                src={src}
                alt={community.communityName}
                onError={() => setImgErr(true)}
            />
        );
    }

    return (
        <div
            className={`${className} community-avatar-fallback`}
            style={{ backgroundColor: getAvatarColor(community.communityName) }}
        >
            {community.communityName?.charAt(0).toUpperCase() || "C"}
        </div>
    );
}

export function NearByChat() {
    const location = useLocation();
    const senderId = location.state?.senderId;

    // ---------- Theme state synced with document & localStorage ----------
    const [theme, setTheme] = useState<"light" | "dark">(() => {
        const attrTheme = document.documentElement.getAttribute("data-theme");
        if (attrTheme === "dark" || attrTheme === "light") return attrTheme;
        const saved = localStorage.getItem("theme") || localStorage.getItem("wp-theme");
        return saved === "dark" ? "dark" : "light";
    });

    const toggleTheme = () => {
        setTheme((prev) => {
            const next = prev === "dark" ? "light" : "dark";
            document.documentElement.setAttribute("data-theme", next);
            localStorage.setItem("theme", next);
            localStorage.setItem("wp-theme", next);
            return next;
        });
    };

    useEffect(() => {
        document.documentElement.setAttribute("data-theme", theme);
    }, [theme]);

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
            localStorage.setItem("lastCoords", JSON.stringify(c));
        };

        const useFallback = async () => {
            try {
                const saved = localStorage.getItem("lastCoords");
                if (saved) {
                    setLocationError("");
                    setCoords(JSON.parse(saved));
                    return;
                }
            } catch {
                /* ignore */
            }

            try {
                const r = await fetch("https://ipwho.is/");
                const j = await r.json();
                if (j.success && typeof j.latitude === "number" && typeof j.longitude === "number") {
                    setLocationError("");
                    setCoords([j.longitude, j.latitude]);
                    return;
                }
            } catch {
                /* ignore */
            }

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
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const msgInputRef = useRef<HTMLTextAreaElement | null>(null);
    const chatBodyRef = useRef<HTMLDivElement | null>(null);

    const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
    const [editText, setEditText] = useState("");
    const [openMenu, setOpenMenu] = useState<number | null>(null);

    // ---------- reactions ----------
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

    useEffect(() => {
        const el = msgInputRef.current;
        if (!el) return;
        el.style.height = "auto";
        el.style.height = Math.min(el.scrollHeight, 140) + "px";
    }, [messageText]);

    const scrollToBottom = () => {
        const el = chatBodyRef.current;
        if (el) el.scrollTop = el.scrollHeight;
    };

    useEffect(() => {
        scrollToBottom();
    }, [msg.length, selectedCommunity?._id]);

    // ================= my communities + global community events =================
    useEffect(() => {
        if (!senderId) return;

        socket.emit("all_user_community", senderId);

        const handleMyCommunities = (data: CommunityListItem[]) => {
            setMyCommunities(data);
            setSelectedCommunity((prev) => {
                if (!prev) return prev;
                const updated = data.find((c) => c._id === prev._id);
                return updated ? { ...prev, ...updated } : prev;
            });
        };

        const handleCreated = (data: CommunityListItem) => {
            setMyCommunities((prev) => (prev.some((c) => c._id === data._id) ? prev : [data, ...prev]));
        };

        const handleNameUpdated = (data: { communityId: string; communityName: string }) => {
            setMyCommunities((prev) =>
                prev.map((c) => (c._id === data.communityId ? { ...c, communityName: data.communityName } : c))
            );
            setNearbyCommunities((prev) =>
                prev.map((c) => (c._id === data.communityId ? { ...c, communityName: data.communityName } : c))
            );
            setSelectedCommunity((prev) =>
                prev && prev._id === data.communityId ? { ...prev, communityName: data.communityName } : prev
            );
        };

        const handleImageUpdated = (data: { communityId: string; communityImage: string }) => {
            setMyCommunities((prev) =>
                prev.map((c) => (c._id === data.communityId ? { ...c, communityImage: data.communityImage } : c))
            );
            setNearbyCommunities((prev) =>
                prev.map((c) => (c._id === data.communityId ? { ...c, communityImage: data.communityImage } : c))
            );
            setSelectedCommunity((prev) =>
                prev && prev._id === data.communityId ? { ...prev, communityImage: data.communityImage } : prev
            );
        };

        const handleRadiusUpdated = (data: { communityId: string; searchRadius: string }) => {
            setMyCommunities((prev) =>
                prev.map((c) => (c._id === data.communityId ? { ...c, searchRadius: data.searchRadius } : c))
            );
            setSelectedCommunity((prev) =>
                prev && prev._id === data.communityId ? { ...prev, searchRadius: data.searchRadius } : prev
            );
        };

        const handleMembers = (data: { communityId: string; totalMembersLength: number }) => {
            setMyCommunities((prev) =>
                prev.map((c) => (c._id === data.communityId ? { ...c, membersCount: data.totalMembersLength } : c))
            );
            setNearbyCommunities((prev) =>
                prev.map((c) => (c._id === data.communityId ? { ...c, membersCount: data.totalMembersLength } : c))
            );
            if (data.communityId === selectedCommunityRef.current) {
                setTotalMembers(data.totalMembersLength);
            }
        };

        const handleDeleted = (data: { communityId: string }) => {
            setMyCommunities((prev)=>prev.filter((c) => c._id !== data.communityId)
            );
            setNearbyCommunities((prev) =>prev.filter((c) => c._id !== data.communityId));
            setSelectedCommunity((prev) =>
                prev && prev._id === data.communityId ? null : prev
            );
        };

        const handleDeletedAlert = (data: { communityId: string })=>{
        if (selectedCommunityRef.current === data.communityId) {
        alert("This community has been deleted by the creator");
        }
};

        const handleJoined = (data: { communityId: string; userId: string }) => {
            setNearbyCommunities((prev) => prev.filter((c) => c._id !== data.communityId));
            socket.emit("all_user_community", senderId);
            setJustJoinedId(data.communityId);
        };

        const handleLeft = (data: { communityId: string; userId: string }) => {
            setMyCommunities((prev) => prev.filter((c) => c._id !== data.communityId));
            setSelectedCommunity((prev) => (prev && prev._id === data.communityId ? null : prev));

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

    useEffect(() => {
        if (!justJoinedId) return;
        const found = myCommunities.find((c) => c._id === justJoinedId);
        if (found) {
            setSelectedCommunity(found);
            setTotalMembers(getMembersCount(found));
            setJustJoinedId(null);
        }
    }, [myCommunities, justJoinedId]);

    // ================= nearby communities =================
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
            setNearbyCommunities((prev) => (loadMoreRef.current ? [...prev, ...data] : data));
        };
        socket.on("got_nearby_communities", handleNearby);
        return () => {
            socket.off("got_nearby_communities", handleNearby);
        };
    }, []);

    const loadMoreNearby = () => {
        if (!senderId || !coords) return;
        loadMoreRef.current = true;
        socket.emit("show_nearby_communities", { userId: senderId, coordinates: coords, page: nearbyPage });
        setNearbyPage((prev) => prev + 1);
    };

    // ================= active community =================
    useEffect(() => {
        if (!selectedCommunity?._id || !senderId) return;

        setCreatorCheckDone(false);
        socket.emit("active_community_user", { communityId: selectedCommunity._id, senderId });
        socket.emit("community_data", { communityId: selectedCommunity._id, userId: senderId });
        socket.emit("all_prev_community_msg", { communityId: selectedCommunity._id, senderId });

        const handleCommunityData = (data: {
            communityId: string;
            userId: string;
            showEditOption: string;
            communityImage?: string;
        }) => {
            if (data.communityId !== selectedCommunity._id) return;
            setIsCreator(data.showEditOption === "show");
            setCreatorCheckDone(true);
            if (data.communityImage) {
                setSelectedCommunity((prev) =>
                    prev && prev._id === data.communityId ? { ...prev, communityImage: data.communityImage } : prev
                );
                setMyCommunities((prev) =>
                    prev.map((c) => (c._id === data.communityId ? { ...c, communityImage: data.communityImage } : c))
                );
            }
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
            setMsg((prev) => (prev.some((m) => m._id === data._id) ? prev : [...prev, data]));
        };

        const handleDeleted = (data: { communityId: string; msgId: string }) => {
            if (data.communityId !== selectedCommunity._id) return;
            setMsg((prev) => prev.filter((m) => m._id !== data.msgId));
        };

        const handleUpdated = (data: CommunityMessage) => {
            setMsg((prev) => prev.map((m) => (m._id === data._id ? data : m)));
        };

        const handleReactionUpdated = (data: CommunityMessage) => {
            if (data.communityId !== selectedCommunity._id) return;
            setMsg((prev) => prev.map((m) => (m._id === data._id ? data : m)));
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
        const closeMenus = (e: MouseEvent) => {
            const t = e.target as HTMLElement;
            if (!t.closest(".wa-menu")) setOpenMenu(null);
        };
        document.addEventListener("mousedown", closeMenus);
        return () => document.removeEventListener("mousedown", closeMenus);
    }, []);

    // ================= file upload helper (fixes 500 error) =================
    const uploadFileToServer = async (file: File) => {
        const formData = new FormData();
        formData.append("file", file);
        const res = await axiosInstance.post("/upload", formData, {
            headers: {
                "Content-Type": "multipart/form-data",
            },
        });
        return res.data;
    };

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
        socket.emit("edit_community_name", {
            communityId: selectedCommunity._id,
            creatorId: senderId,
            communityName: nameDraft,
        });
        setEditingName(false);
    };

    const startEditRadius = () => {
        if (!selectedCommunity) return;
        setRadiusDraft(selectedCommunity.searchRadius || "5km");
        setEditingRadius(true);
    };
    const saveRadiusEdit = () => {
        if (!selectedCommunity) return;
        socket.emit("edit_search_radius", {
            communityId: selectedCommunity._id,
            creatorId: senderId,
            searchRadius: radiusDraft,
        });
        setEditingRadius(false);
    };

    const handleEditImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!selectedCommunity) return;
        const f = e.target.files?.[0];
        e.target.value = "";
        if (!f) return;

        const previewUrl = URL.createObjectURL(f);
        const targetId = selectedCommunity._id;
        setSelectedCommunity((prev) => (prev ? { ...prev, communityImage: previewUrl } : prev));
        setMyCommunities((prev) => prev.map((c) => (c._id === targetId ? { ...c, communityImage: previewUrl } : c)));

        try {
            const resData = await uploadFileToServer(f);
            if (resData?.success) {
                const uploadedPath = resData.data?.path;
                socket.emit("edit_community_image", {
                    communityId: targetId,
                    creatorId: senderId,
                    communityImage: uploadedPath,
                });
                setSelectedCommunity((prev) => (prev && prev._id === targetId ? { ...prev, communityImage: uploadedPath } : prev));
                setMyCommunities((prev) => prev.map((c) => (c._id === targetId ? { ...c, communityImage: uploadedPath } : c)));
            }
        } catch (err) {
            showApiError(err);
        } finally {
            URL.revokeObjectURL(previewUrl);
        }
    };

    const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        if (!selectedCommunity) return;
        if (messageText.trim().length === 0) {
            showApiError("Message cannot be empty");
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

    const sendFile = async (pickedFile: File) => {
        if (!selectedCommunity) return;
        try {
            const resData = await uploadFileToServer(pickedFile);
            if (resData?.success) {
                const data = resData.data;
                socket.emit("community_msg_creation", {
                    communityId: selectedCommunity._id,
                    senderId,
                    message: data.path,
                    messageType: "file",
                    mimetype: data.mimetype || pickedFile.type,
                    orignalname: data.orignalname || data.originalname || data.name || pickedFile.name,
                    originalname: data.originalname || data.orignalname || data.name || pickedFile.name,
                    filename: data.name || data.originalname || pickedFile.name,
                    sizeInKb: data.sizeInKb,
                    sizeInMb: data.sizeInMb,
                });
            }
        } catch (err) {
            showApiError(err);
        }
    };

    const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
        const picked = e.target.files?.[0];
        e.target.value = "";
        if (picked) sendFile(picked);
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
        socket.emit("edit_community_msg", {
            communityId: selectedCommunity._id,
            senderId,
            msgId,
            message: editText,
        });
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
                const resData = await uploadFileToServer(newImageFile);
                if (resData?.success) {
                    imagePath = resData.data.path;
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
        } catch (err) {
            showApiError(err);
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
            <CommunityAvatar community={c} className="community-row-avatar" />
            <div className="community-row-info">
                <span className="community-row-name">{c.communityName}</span>
                <span className="community-row-meta">
                    {getMembersCount(c)} members · {c.searchRadius || "5km"} radius
                </span>
            </div>
        </div>
    );

    const renderNearbyRow = (c: CommunityListItem) => (
        <div key={c._id} className="community-row">
            <CommunityAvatar community={c} className="community-row-avatar" />
            <div className="community-row-info">
                <span className="community-row-name">{c.communityName}</span>
                <span className="community-row-meta">
                    {typeof c.distanceInKm === "number" ? `${c.distanceInKm} km away · ` : ""}
                    {c.searchRadius || "5km"} radius
                </span>
            </div>
            <button type="button" className="community-join-btn" onClick={() => handleJoinAndOpen(c)}>
                Join
            </button>
        </div>
    );

    return (
        <div className="community-chat-page" data-theme={theme}>
            <div className="community-list-column">
                <div className="community-list-header">
                    <h1>Nearby</h1>
                    <div className="community-list-header-actions">
                        <button
                            type="button"
                            className="community-theme-toggle-btn"
                            onClick={toggleTheme}
                            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
                        >
                            {theme === "dark" ? <FiSun size={19} /> : <FiMoon size={19} />}
                        </button>
                        <button className="community-new-btn" onClick={() => setShowCreateModal(true)} type="button">
                            + New
                        </button>
                    </div>
                </div>

                <div className="community-list-scroll">
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
                </div>

                {showCreateModal && (
                    <div className="community-create-modal-backdrop" onClick={() => setShowCreateModal(false)}>
                        <form
                            className="community-create-modal"
                            onClick={(e) => e.stopPropagation()}
                            onSubmit={handleCreateCommunity}
                        >
                            <h2>Create Community</h2>

                            <div className="community-create-image-picker">
                                {newImagePreview ? (
                                    <img
                                        src={newImagePreview}
                                        alt="preview"
                                        className="community-create-image-preview"
                                    />
                                ) : (
                                    <div
                                        className="community-create-image-preview community-avatar-fallback"
                                        style={{ backgroundColor: getAvatarColor(newCommunityName || "C") }}
                                    >
                                        {(newCommunityName || "C").charAt(0).toUpperCase()}
                                    </div>
                                )}
                                <input type="file" accept="image/*" onChange={handleNewImageChange} />
                            </div>

                            <input
                                type="text"
                                placeholder="Community name"
                                value={newCommunityName}
                                onChange={(e) => setNewCommunityName(e.target.value)}
                            />

                            <select value={newSearchRadius} onChange={(e) => setNewSearchRadius(e.target.value)}>
                                {RADIUS_OPTIONS.map((r) => (
                                    <option key={r} value={r}>
                                        {r}
                                    </option>
                                ))}
                            </select>

                            {!coords && <p className="community-empty">Waiting for location access...</p>}

                            <div className="community-create-actions">
                                <button type="button" onClick={() => setShowCreateModal(false)}>
                                    Cancel
                                </button>
                                <button type="submit" disabled={creating || !coords}>
                                    {creating ? "Creating..." : "Create"}
                                </button>
                            </div>
                        </form>
                    </div>
                )}
            </div>

            <div className="community-window-column">
                {selectedCommunity ? (
                    <div className="chat community-window">
                        {/* Header matched with ChatPage */}
                        <div className="chatHeader community-window-header">
                            <div className="chatHeaderLeft community-window-info">
                                <CommunityAvatar
                                    community={selectedCommunity}
                                    className="avat community-window-avatar"
                                />
                                <div className="userInfo">
                                    {editingName ? (
                                        <div className="inline-edit-box">
                                            <input
                                                value={nameDraft}
                                                onChange={(e) => setNameDraft(e.target.value)}
                                                autoFocus
                                            />
                                            <button type="button" className="inline-save-btn" onClick={saveNameEdit}>
                                                Save
                                            </button>
                                            <button
                                                type="button"
                                                className="inline-cancel-btn"
                                                onClick={() => setEditingName(false)}
                                            >
                                                Cancel
                                            </button>
                                        </div>
                                    ) : (
                                        <h4 className="community-window-name">{selectedCommunity.communityName}</h4>
                                    )}
                                    <p className="community-window-meta">
                                        {totalMembers} members · {selectedCommunity.searchRadius || "5km"} radius
                                    </p>
                                </div>
                            </div>

                            <div className="community-window-actions">
                                <button
                                    type="button"
                                    className="community-theme-toggle-btn"
                                    onClick={toggleTheme}
                                    title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
                                >
                                    {theme === "dark" ? <FiSun size={18} /> : <FiMoon size={18} />}
                                </button>
                                {creatorCheckDone &&
                                    (isCreator ? (
                                        <>
                                            <button type="button" className="header-action-btn" onClick={startEditName}>
                                                Edit name
                                            </button>
                                            <button
                                                type="button"
                                                className="header-action-btn"
                                                onClick={() => editImageInputRef.current?.click()}
                                            >
                                                Edit image
                                            </button>
                                            <input
                                                ref={editImageInputRef}
                                                type="file"
                                                accept="image/*"
                                                style={{ display: "none" }}
                                                onChange={handleEditImageChange}
                                            />
                                            {editingRadius ? (
                                                <span className="inline-edit-box">
                                                    <select
                                                        value={radiusDraft}
                                                        onChange={(e) => setRadiusDraft(e.target.value)}
                                                    >
                                                        {RADIUS_OPTIONS.map((r) => (
                                                            <option key={r} value={r}>
                                                                {r}
                                                            </option>
                                                        ))}
                                                    </select>
                                                    <button
                                                        type="button"
                                                        className="inline-save-btn"
                                                        onClick={saveRadiusEdit}
                                                    >
                                                        Save
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="inline-cancel-btn"
                                                        onClick={() => setEditingRadius(false)}
                                                    >
                                                        Cancel
                                                    </button>
                                                </span>
                                            ) : (
                                                <button
                                                    type="button"
                                                    className="header-action-btn"
                                                    onClick={startEditRadius}
                                                >
                                                    Edit radius
                                                </button>
                                            )}
                                            <button
                                                type="button"
                                                className="community-delete-btn"
                                                onClick={handleDeleteCommunity}
                                            >
                                                Delete community
                                            </button>
                                        </>
                                    ) : (
                                        <button
                                            type="button"
                                            className="community-leave-btn"
                                            onClick={handleLeaveCommunity}
                                        >
                                            Leave
                                        </button>
                                    ))}
                            </div>
                        </div>

                        {/* Messages Body matched with ChatPage */}
                        <div className="chatBody community-window-messages" ref={chatBodyRef}>
                            <div className="encryptBox">
                                Messages in this nearby community are visible to members within the active radius.
                            </div>

                            <div className="chat-body">
                                {msg.map((item, index) => {
                                    const mine = item.senderId?.toString() === senderId?.toString();
                                    const isSystemMsg = item.messageType === "system";
                                    const isImageMsg =
                                        item.messageType === "file" && !!item.mimetype?.startsWith("image/");
                                    const isVideoMsg =
                                        item.messageType === "file" && !!item.mimetype?.startsWith("video/");
                                    const isTextMsg = item.messageType === "text";
                                    const hasReactions = !!(item.reaction && item.reaction.length > 0);

                                    const prevMsg = index > 0 ? msg[index - 1] : null;
                                    const thisDate = item.createdAt ? new Date(item.createdAt) : null;
                                    const prevDate = prevMsg?.createdAt ? new Date(prevMsg.createdAt) : null;
                                    const showDate =
                                        !!thisDate &&
                                        !isNaN(thisDate.getTime()) &&
                                        (!prevDate ||
                                            isNaN(prevDate.getTime()) ||
                                            startOfDay(thisDate) !== startOfDay(prevDate));

                                    const prevIsSystem = prevMsg?.messageType === "system";
                                    const isGroupCont =
                                        !!prevMsg &&
                                        !showDate &&
                                        !isSystemMsg &&
                                        !prevIsSystem &&
                                        prevMsg.senderId === item.senderId;

                                    const menuOpensUp = msg.length > 3 && index >= msg.length - 2;

                                    const timeText = item.createdAt
                                        ? new Date(item.createdAt).toLocaleTimeString([], {
                                              hour: "numeric",
                                              minute: "2-digit",
                                              hour12: true,
                                          })
                                        : "";

                                    const metaEl = (
                                        <span className="wa-meta">
                                            {item.isEdited && <span className="wa-edited">Edited</span>}
                                            {timeText && <span className="wa-time">{timeText}</span>}
                                        </span>
                                    );

                                    if (isSystemMsg) {
                                        return (
                                            <Fragment key={item._id || index}>
                                                {showDate && (
                                                    <div className="date-row">
                                                        <span className="date-chip">{dateLabel(item.createdAt)}</span>
                                                    </div>
                                                )}
                                                <div className="system-message-row">
                                                    <div className="system-message">{item.message}</div>
                                                </div>
                                            </Fragment>
                                        );
                                    }

                                    const rowClass = `wa-msg ${mine ? "wa-out" : "wa-in"} ${
                                        isGroupCont ? "wa-cont" : "wa-start"
                                    }${hasReactions ? " has-rx" : ""}${
                                        isImageMsg || isVideoMsg ? " wa-media" : ""
                                    }${isVideoMsg ? " wa-video" : ""}`;

                                    const displayFileName =
                                        item.orignalname || item.originalname || item.filename || "file";
                                    const fileUrl = resolveFileUrl(item.message);

                                    return (
                                        <Fragment key={item._id || index}>
                                            {showDate && (
                                                <div className="date-row">
                                                    <span className="date-chip">{dateLabel(item.createdAt)}</span>
                                                </div>
                                            )}

                                            <div className={rowClass}>
                                                {/* Emoji Trigger Button — Exact One-to-One Style */}
                                                <button
                                                    type="button"
                                                    className="wa-rx-btn"
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setReactionMessage(
                                                            reactionMessage === item._id ? null : item._id
                                                        );
                                                    }}
                                                >
                                                    😊
                                                </button>

                                                {/* Centered Emoji Picker Popup */}
                                                {reactionMessage === item._id && (
                                                    <div
                                                        className="rx-picker"
                                                        ref={reactionRef}
                                                        onClick={(e) => e.stopPropagation()}
                                                    >
                                                        <EmojiPicker
                                                            onEmojiClick={(emojiData) => {
                                                                handleEmojiReaction(item._id, emojiData.emoji);
                                                                setReactionMessage(null);
                                                            }}
                                                        />
                                                    </div>
                                                )}

                                                {/* Reaction Pill Badge on Bubble Bottom */}
                                                {hasReactions && (
                                                    <div
                                                        className="rx-badge"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setShowReactionDetail(item._id);
                                                        }}
                                                    >
                                                        {Object.entries(groupReactions(item.reaction))
                                                            .sort((a, b) => b[1].length - a[1].length)
                                                            .slice(0, 3)
                                                            .map(([emoji]) => (
                                                                <span key={emoji}>{emoji}</span>
                                                            ))}
                                                        {item.reaction!.length > 1 && (
                                                            <span className="rx-count">
                                                                {formatReactionCount(item.reaction!.length)}
                                                            </span>
                                                        )}
                                                    </div>
                                                )}

                                                {/* Reaction Detail Modal — Exact One-to-One Style */}
                                                {showReactionDetail === item._id &&
                                                    item.reaction &&
                                                    item.reaction.length > 0 && (
                                                        <div
                                                            className="rx-overlay"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setShowReactionDetail(null);
                                                            }}
                                                        >
                                                            <div
                                                                className="rx-card"
                                                                ref={reactionDetailRef}
                                                                onClick={(e) => e.stopPropagation()}
                                                            >
                                                                <div className="rx-head">
                                                                    {formatReactionCount(item.reaction.length)} reaction
                                                                    {item.reaction.length > 1 ? "s" : ""}
                                                                </div>

                                                                <div className="rx-pills">
                                                                    <button
                                                                        type="button"
                                                                        className="rx-pill"
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            setShowReactionDetail(null);
                                                                            setReactionMessage(item._id);
                                                                        }}
                                                                    >
                                                                        😊+
                                                                    </button>
                                                                    {Object.entries(groupReactions(item.reaction)).map(
                                                                        ([emoji, users]) => (
                                                                            <div key={emoji} className="rx-pill">
                                                                                <span>{emoji}</span>
                                                                                <span className="rx-pill-n">
                                                                                    {formatReactionCount(users.length)}
                                                                                </span>
                                                                            </div>
                                                                        )
                                                                    )}
                                                                </div>

                                                                <div className="rx-divider" />

                                                                <div className="rx-list">
                                                                    {item.reaction.map((r, rIdx) => {
                                                                        const isMe =
                                                                            r.userId?.toString() ===
                                                                            senderId?.toString();
                                                                        return (
                                                                            <div
                                                                                key={`${r.userId}-${rIdx}`}
                                                                                className={`rx-row${
                                                                                    isMe ? " is-me" : ""
                                                                                }`}
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    if (isMe)
                                                                                        handleRemoveReaction(
                                                                                            item._id,
                                                                                            r.emoji
                                                                                        );
                                                                                }}
                                                                            >
                                                                                <div
                                                                                    className="rx-avatar"
                                                                                    style={{
                                                                                        backgroundColor: isMe
                                                                                            ? "#00a884"
                                                                                            : getAvatarColor(r.userId),
                                                                                    }}
                                                                                >
                                                                                    {isMe ? "Y" : "M"}
                                                                                </div>
                                                                                <div className="rx-info">
                                                                                    <span className="rx-name">
                                                                                        {isMe ? "You" : "Member"}
                                                                                    </span>
                                                                                    {isMe && (
                                                                                        <span className="rx-hint">
                                                                                            Tap to remove
                                                                                        </span>
                                                                                    )}
                                                                                </div>
                                                                                <span className="rx-emoji">
                                                                                    {r.emoji}
                                                                                </span>
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </div>
                                                        </div>
                                                    )}

                                                {/* Editing Mode vs Normal Content */}
                                                {editingMsgId === item._id ? (
                                                    <div
                                                        className="wa-edit"
                                                        onClick={(e) => e.stopPropagation()}
                                                    >
                                                        <input
                                                            type="text"
                                                            value={editText}
                                                            onChange={(e) => setEditText(e.target.value)}
                                                            className="wa-edit-input"
                                                            autoFocus
                                                        />
                                                        <div className="wa-edit-actions">
                                                            <button type="button" onClick={cancelEdit}>
                                                                Cancel
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => saveEdit(item._id)}
                                                            >
                                                                Save
                                                            </button>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <>
                                                        {isTextMsg && (
                                                            <div className="wa-text">
                                                                {item.message}
                                                                {metaEl}
                                                            </div>
                                                        )}

                                                        {item.messageType === "file" && (
                                                            <div className="fileMessage">
                                                                {isImageMsg && (
                                                                    <div className="imageMessage">
                                                                        <img
                                                                            src={fileUrl}
                                                                            alt={displayFileName}
                                                                            onClick={() =>
                                                                                window.open(fileUrl, "_blank")
                                                                            }
                                                                            onLoad={
                                                                                index === msg.length - 1
                                                                                    ? scrollToBottom
                                                                                    : undefined
                                                                            }
                                                                        />
                                                                    </div>
                                                                )}

                                                                {isVideoMsg && (
                                                                    <div className="videoMessage">
                                                                        <video
                                                                            src={fileUrl}
                                                                            controls
                                                                            preload="metadata"
                                                                        />
                                                                    </div>
                                                                )}

                                                                {!isImageMsg &&
                                                                    !isVideoMsg &&
                                                                    (() => {
                                                                        const ext =
                                                                            item.mimetype === "application/pdf"
                                                                                ? "PDF"
                                                                                : fileExt(displayFileName);
                                                                        const sizeStr = fileSize(
                                                                            item.sizeInKb,
                                                                            item.sizeInMb
                                                                        );
                                                                        return (
                                                                            <div className="documentMessage">
                                                                                <div
                                                                                    className="fileIconBox"
                                                                                    style={{
                                                                                        background: fileColor(ext),
                                                                                    }}
                                                                                >
                                                                                    {ext}
                                                                                </div>
                                                                                <div className="fileDetails">
                                                                                    <span className="fileName">
                                                                                        {displayFileName}
                                                                                    </span>
                                                                                    <span className="fileMeta">
                                                                                        {sizeStr
                                                                                            ? `${sizeStr} · ${ext}`
                                                                                            : ext}
                                                                                    </span>
                                                                                </div>
                                                                                <a
                                                                                    className="fileOpenBtn"
                                                                                    href={fileUrl}
                                                                                    target="_blank"
                                                                                    rel="noopener noreferrer"
                                                                                    download
                                                                                    title="Download / Open"
                                                                                    onClick={(e) =>
                                                                                        e.stopPropagation()
                                                                                    }
                                                                                >
                                                                                    <Download size={18} />
                                                                                </a>
                                                                            </div>
                                                                        );
                                                                    })()}
                                                            </div>
                                                        )}

                                                        {!isTextMsg && <div className="wa-meta-row">{metaEl}</div>}
                                                    </>
                                                )}

                                                {/* Per-Message Menu matched with One-to-One ChatPage */}
                                                {(mine || item.messageType === "text") && (
                                                    <div
                                                        className={`wa-menu${openMenu === index ? " open" : ""}${
                                                            menuOpensUp ? " up" : ""
                                                        }`}
                                                    >
                                                        <button
                                                            type="button"
                                                            className="wa-menu-btn"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setOpenMenu(openMenu === index ? null : index);
                                                            }}
                                                        >
                                                            ⋮
                                                        </button>

                                                        {openMenu === index && (
                                                            <div
                                                                className="wa-menu-dropdown"
                                                                onClick={(e) => e.stopPropagation()}
                                                            >
                                                                {mine && item.messageType === "text" && (
                                                                    <div
                                                                        className="wa-menu-item"
                                                                        onClick={() => {
                                                                            handleEditClick(item);
                                                                            setOpenMenu(null);
                                                                        }}
                                                                    >
                                                                        <Pencil size={16} />
                                                                        <span>Edit</span>
                                                                    </div>
                                                                )}
                                                                {item.messageType === "text" && (
                                                                    <div
                                                                        className="wa-menu-item"
                                                                        onClick={() => {
                                                                            navigator.clipboard.writeText(
                                                                                item.message || ""
                                                                            );
                                                                            setOpenMenu(null);
                                                                        }}
                                                                    >
                                                                        <Copy size={16} />
                                                                        <span>Copy</span>
                                                                    </div>
                                                                )}
                                                                {mine && (
                                                                    <div
                                                                        className="wa-menu-item danger"
                                                                        onClick={() => {
                                                                            handleDelete(item._id);
                                                                            setOpenMenu(null);
                                                                        }}
                                                                    >
                                                                        <Trash2 size={16} />
                                                                        <span>Delete</span>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </Fragment>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Footer matched with One-to-One ChatPage */}
                        <div className="chatFooter community-window-input-wrap">
                            <FooterEmoji setMsg={setMessageText} />
                            <FiPaperclip
                                className="footerIcon"
                                title="Attach file"
                                onClick={() => fileInputRef.current?.click()}
                            />
                            <input
                                type="file"
                                ref={fileInputRef}
                                onChange={handleFilePick}
                                style={{ display: "none" }}
                            />
                            <form onSubmit={handleSubmit}>
                                <textarea
                                    ref={msgInputRef}
                                    rows={1}
                                    className="msgTextarea"
                                    placeholder="Type a message"
                                    value={messageText}
                                    onChange={(e) => setMessageText(e.target.value)}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter" && !e.shiftKey) {
                                            e.preventDefault();
                                            e.currentTarget.form?.requestSubmit();
                                        }
                                    }}
                                />
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