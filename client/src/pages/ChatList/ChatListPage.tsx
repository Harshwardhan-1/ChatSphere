import { useState, useEffect } from "react";
import { ShowAllUser } from "../../hooks/usechat.hooks";
import { socket } from "../../utils/socket";
import { useNavigate } from "react-router-dom";
import "./ChatListPage.css";
import { motion, AnimatePresence } from "framer-motion";
import { userChatListPresence } from "../../services/user.presence.service";
import ThemeToggle from "../../components/ThemeToggle/ThemeToggle";
import { Bot, File as FileIcon, FileText, Phone, Video } from "lucide-react";

interface User {
  _id: string;
  name: string;
  email: string;
}

interface lastMessage {
  senderId: string;
  receiverId: string;
  lastmessage: string;
  messageType: string;
  IsSend: boolean;
  isDelivered: boolean;
  isSeen: boolean;
  updatedAt: string;
}

interface chatlistUpdate {
  senderId: string;
  receiverId: string;
  lastmessage: string;
  messageType: string;
  IsSend?: boolean;
  isDelivered?: boolean;
  isSeen?: boolean;
  createdAt: string;
  updatedAt: string;
}

interface UnseenCount {
  senderId: string;
  count: number;
}

const colors: string[] = [
  "#22c55e",
  "#ef4444",
  "#3b82f6",
  "#f59e0b",
  "#ec4899",
  "#8b5cf6",
  "#06b6d4",
  "#14b8a6",
];

interface Props {
  selectedUser: User | null;
  setSelectedUser: React.Dispatch<React.SetStateAction<User | null>>;
}

type PreviewKind = "text" | "file" | "pdf" | "voice" | "video";

// Chat list me preview: text ho toh message (ek line me), file ho toh "File" + icon,
// pdf ho toh "PDF" + icon, call ho toh voice/video icon + call ka text.
// File ka naam / path kabhi nahi dikhega.
// call message pakadne ke liye: messageType "call" ho ya text me "Video call" / "Missed voice call" jaisa aaye
const CALL_TEXT_REGEX = /^[^\p{L}\p{N}]*(missed\s+)?(video|voice)\s+call[^\p{L}\p{N}]*$/iu;

const isCallMessage = (messageType: string, lastmessage: string): boolean =>
  messageType === "call" ||
  (messageType !== "file" &&
    messageType !== "pdf" &&
    CALL_TEXT_REGEX.test((lastmessage || "").trim()));

const getPreview = (
  messageType: string,
  lastmessage: string
): { kind: PreviewKind; text: string } => {
  if (!lastmessage) return { kind: "text", text: "" };

  if (isCallMessage(messageType, lastmessage)) {
    const isVideo = lastmessage.toLowerCase().includes("video");
    return { kind: isVideo ? "video" : "voice", text: lastmessage };
  }

  switch (messageType) {
    case "text":
    case "system":
      // lamba / multi-line message preview me ek line ban jaye
      return { kind: "text", text: lastmessage.replace(/\s+/g, " ") };
    case "systemPinned":
      return { kind: "text", text: "Pinned a message" };
    case "pdf":
      return { kind: "pdf", text: "PDF" };
    default:
      return { kind: "file", text: "File" };
  }
};

const PreviewIcon = ({ kind }: { kind: PreviewKind }) => {
  const props = {
    size: 15,
    className: "chatPage__previewIcon",
    style: { flexShrink: 0 },
  };
  switch (kind) {
    case "file":
      return <FileIcon {...props} />;
    case "pdf":
      return <FileText {...props} />;
    case "voice":
      return <Phone {...props} />;
    case "video":
      return <Video {...props} />;
    default:
      return null;
  }
};

/* ---- small inline icons, no new dependencies ---- */
const SearchIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="11" cy="11" r="7" />
    <path d="m21 21-4.3-4.3" />
  </svg>
);



const TickIcon = ({
  delivered,
  seen,
}: {
  delivered: boolean;
  seen: boolean;
}) => {
  if (!delivered) {
    return (
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="chatPage__tick"
      >
        <path d="M18 6 7 17l-5-5" />
      </svg>
    );
  }

  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={`chatPage__tick${seen ? " is-seen" : ""}`}
    >
      <path d="M18 6 7 17l-5-5" />
      <path d="m22 10-7.5 7.5L13 16" />
    </svg>
  );
};

const GroupsIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="9" cy="8" r="3" />
    <path d="M2 20c0-3.3 3.1-5 7-5s7 1.7 7 5" />
    <path d="M16 4.2a3 3 0 0 1 0 5.6" />
    <path d="M21 20c0-2.7-2-4.3-4.8-4.9" />
  </svg>
);

const StoriesIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="12" r="8" />
    <path d="M12 9v6M9 12h6" />
  </svg>
);

const ChannelIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M3 11v2a2 2 0 0 0 2 2h1l3 4v-4h7a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2H10L4 8" />
  </svg>
);

const NearbyIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 21s7-6.1 7-11.5A7 7 0 0 0 5 9.5C5 14.9 12 21 12 21z" />
    <circle cx="12" cy="9.5" r="2.3" />
  </svg>
);

const DocsIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M6 2h9l5 5v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z" />
    <path d="M14 2v5h5" />
  </svg>
);

const ChatListPage = ({ selectedUser, setSelectedUser }: Props) => {
  const { data, userData } = ShowAllUser(); //hook
  const [search, setSearch] = useState<string>("");
  const [unseenCountNumber, setUnseenCountNumber] = useState<UnseenCount[]>([]);

  // Favorites filter
  const [favouriteIds, setFavouriteIds] = useState<string[]>([]);
  const [filter, setFilter] = useState<"all" | "favourites">("all");
  const handleAllFavourites = (ids: string[]) => setFavouriteIds(ids);

  const getInitials = (name: string): string => {
    return name.split(" ").map((word) => word[0]).slice(0, 2).join("").toUpperCase();
  };
  const handleClick = async (all: User) => {
    setSelectedUser(all);
  };
  const [lastMessages, setLastMessage] = useState<lastMessage[]>([]);

  const handleAllLastMessage = (data: lastMessage[]) => {
    setLastMessage(data);
  };

  const handleChatListUpdate = (data: chatlistUpdate) => {
    setLastMessage((prev) => {
      const index = prev.findIndex(
        (msg) =>
          (msg.senderId === data?.senderId && msg.receiverId === data?.receiverId) ||
          (msg.senderId === data?.receiverId && msg.receiverId === data?.senderId)
      );

      const isActuallyCleared = data?.messageType === "text" && !data?.lastmessage;

      if (isActuallyCleared) {
        if (index !== -1) {
          const temp = [...prev];
          temp.splice(index, 1);
          return temp;
        }
        return prev;
      }

      if (index !== -1) {
        const temp = [...prev];
        temp[index] = {
          ...temp[index],
          // asli last message bhejne wala (isMine / tick isi pe depend karta ha)
          senderId: data?.senderId,
          receiverId: data?.receiverId,
          lastmessage: data?.lastmessage,
          messageType: data?.messageType,
          // server jo tick status bheje wahi lo; nahi aaya (edit/delete) toh purana rakho
          IsSend: data?.IsSend ?? temp[index].IsSend,
          isDelivered: data?.isDelivered ?? temp[index].isDelivered,
          isSeen: data?.isSeen ?? temp[index].isSeen,
          updatedAt: data?.updatedAt,
        };
        return temp;
      }
      return [
        {
          senderId: data?.senderId,
          receiverId: data?.receiverId,
          lastmessage: data?.lastmessage,
          messageType: data?.messageType,
          IsSend: data?.IsSend ?? false,
          isDelivered: data?.isDelivered ?? false,
          isSeen: data?.isSeen ?? false,
          updatedAt: data?.updatedAt,
        },
        ...prev,
      ];
    });
  };

  // receiver online aaya -> jo last message maine bheja tha wo delivered
  const handleChatListDelivered = (data: { senderId: string; receiverId: string }) => {
    setLastMessage((prev) =>
      prev.map((msg) =>
        msg.senderId === data.senderId && msg.receiverId === data.receiverId
          ? { ...msg, IsSend: true, isDelivered: true }
          : msg
      )
    );
  };

  // receiver ne chat khol li -> jo last message maine bheja tha wo seen
  const handleChatListSeen = (data: { senderId: string; receiverId: string }) => {
    setLastMessage((prev) =>
      prev.map((msg) =>
        msg.senderId === data.senderId && msg.receiverId === data.receiverId
          ? { ...msg, IsSend: true, isDelivered: true, isSeen: true }
          : msg
      )
    );
  };

  const handleUnseenMessage = (data: UnseenCount[]) => {
    setUnseenCountNumber(data);
  };
  const handleUnseenCountZero = (data: { senderId: string; count: 0 }) => {
    setUnseenCountNumber((prev) =>
      prev.map((item) => (item.senderId === data.senderId ? { ...item, count: data.count } : item))
    );
  };

  const handleIncreaseUnseenCount = (data: { senderId: string }) => {
    setUnseenCountNumber((prev) => {
      const exists = prev.find((item) => item.senderId === data.senderId);
      if (exists) {
        return prev.map((item) =>
          item.senderId === data.senderId ? { ...item, count: item.count + 1 } : item
        );
      }
      return [...prev, { senderId: data.senderId, count: 1 }];
    });
  };

  //new start
  useEffect(() => {
    const userId = userData?.loginUserId;
    if (!userId) return;

    const initSocketData = () => {
      socket.emit("join", userId);
      socket.emit("user_online", { userId: userId });
      socket.emit("add_to_delivered", { senderId: userId });
      socket.emit("last_message", { userId: userId });
      socket.emit("unseen_message", { senderId: userId });
      socket.emit("get_all_favourites", { userId: userId });
    };

    initSocketData(); // pehli baar

    socket.on("connect", initSocketData); // socket reconnect hone pe bhi

    socket.on("all_last_message", handleAllLastMessage);
    socket.on("chat_list_update", handleChatListUpdate);
    socket.on("chat_list_delivered", handleChatListDelivered);
    socket.on("chat_list_seen", handleChatListSeen);
    socket.on("unseen_message_count", handleUnseenMessage);
    socket.on("unseen_count_zero", handleUnseenCountZero);
    socket.on("increase_unseen_count", handleIncreaseUnseenCount);
    socket.on("all_favourites", handleAllFavourites);

    return () => {
      socket.off("connect", initSocketData);
      socket.off("all_last_message", handleAllLastMessage);
      socket.off("chat_list_update", handleChatListUpdate);
      socket.off("chat_list_delivered", handleChatListDelivered);
      socket.off("chat_list_seen", handleChatListSeen);
      socket.off("unseen_message_count", handleUnseenMessage);
      socket.off("unseen_count_zero", handleUnseenCountZero);
      socket.off("increase_unseen_count", handleIncreaseUnseenCount);
      socket.off("all_favourites", handleAllFavourites);
    };
  }, [userData?.loginUserId]);
  //new ends

  const myId = userData?.loginUserId;

  // duplicate users hatao taaki "Message yourself" (ya koi bhi user) sirf ek baar aaye
  const uniqueUsers: User[] = Array.from(
    new Map(data.map((user: User) => [user._id, user])).values()
  ) as User[];

  const findLast = (userId: string) =>
    lastMessages.find(
      (msg) =>
        (msg.senderId === myId && msg.receiverId === userId) ||
        (msg.receiverId === myId && msg.senderId === userId)
    );

  const sortedUsers = [...uniqueUsers].sort((a, b) => {
    const aLast = findLast(a._id);
    const bLast = findLast(b._id);
    const aTime = aLast
      ? new Date(aLast.updatedAt).getTime()
      : a._id === myId
      ? Number.MAX_SAFE_INTEGER
      : 0;
    const bTime = bLast
      ? new Date(bLast.updatedAt).getTime()
      : b._id === myId
      ? Number.MAX_SAFE_INTEGER
      : 0;
    return bTime - aTime;
  });
  const navigate = useNavigate();

  const handleStories = () => {
    navigate("/story", { state: { senderId: userData?.loginUserId } });
  };

  const handleGroups = async () => {
    navigate("/group", { state: { senderId: userData?.loginUserId } });
  };

  const handleChannel = () => {
    navigate("/channel", { state: { senderId: userData?.loginUserId } });
  };

  const handleRandom = () => {
    navigate("/NearbyChats", { state: { senderId: userData?.loginUserId } });
  };

  const handleDocs = () => {
    navigate("/docs", { state: { senderId: userData?.loginUserId } });
  };

  // AI chat — chat list mein floating button ke roop mein, chat page ke andar nahi
  const openAiChat = () => {
    navigate("/AiChat", { state: { senderId: userData?.loginUserId } });
  };

  const filteredUsers = sortedUsers.filter((user: User) => {
    if (filter === "favourites" && !favouriteIds.includes(user._id)) return false;
    const q = search.toLowerCase();
    if (user._id === myId) {
      return user.name.toLowerCase().includes(q) || "message yourself".includes(q) || "you".includes(q);
    }
    return user.name.toLowerCase().includes(q);
  });

  return (
    <div className="chatPage__container">
      <div className="chatPage">
        <header className="chatPage__header">
          <button
            type="button"
            className="chatPage__brand"
            onClick={() => navigate("/")}
            aria-label="Go to home"
          >
            <img src="/WhatsApp.svg" alt="" className="chatPage__brandLogo" />
          </button>

          <div className="chatPage__headerRight">
            <ThemeToggle />
            <div className="chatPage__profile">
              {userData?.email?.charAt(0).toUpperCase()}
            </div>
          </div>
        </header>

        <div className="chatPage__searchWrapper">
          <div className="chatPage__searchBox">
            <span className="chatPage__searchIcon">
              <SearchIcon />
            </span>
            <input
              type="text"
              placeholder="Search or start new chat"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="chatPage__searchInput"
            />
          </div>

          <div className="chatPage__filters">
            <button
              type="button"
              className={`chatPage__filterChip${filter === "all" ? " is-active" : ""}`}
              onClick={() => setFilter("all")}
            >
              All
            </button>
            <button
              type="button"
              className={`chatPage__filterChip${filter === "favourites" ? " is-active" : ""}`}
              onClick={() => setFilter("favourites")}
            >
              Favorites
            </button>

            <span className="chatPage__filterDivider" aria-hidden="true" />

            <button
              type="button"
              className="chatPage__filterChip chatPage__filterChip--nav"
              onClick={handleGroups}
            >
              <GroupsIcon /> Groups
            </button>
            <button
              type="button"
              className="chatPage__filterChip chatPage__filterChip--nav"
              onClick={handleStories}
            >
              <StoriesIcon /> Stories
            </button>
            <button
              type="button"
              className="chatPage__filterChip chatPage__filterChip--nav"
              onClick={handleChannel}
            >
              <ChannelIcon /> Channels
            </button>
            <button
              type="button"
              className="chatPage__filterChip chatPage__filterChip--nav"
              onClick={handleRandom}
            >
              <NearbyIcon /> Nearby Chats
            </button>
            <button
              type="button"
              className="chatPage__filterChip chatPage__filterChip--nav"
              onClick={handleDocs}
            >
              <DocsIcon /> Docs Files
            </button>
          </div>
        </div>

        <div className="chatPage__userList">
          {filteredUsers.length === 0 ? (
            <div className="chatPage__empty">
              <span className="chatPage__emptyIcon">
                <SearchIcon />
              </span>
              {filter === "favourites" && !search ? "No favourite chats yet" : "No records found"}
            </div>
          ) : (
            <AnimatePresence mode="popLayout">
              {filteredUsers.map((all: User, index: number) => {
                const isSelf = all._id === myId;
                const last = findLast(all._id);

                const preview = last
                  ? getPreview(last.messageType, last.lastmessage)
                  : { kind: "text" as PreviewKind, text: "" };
                let message = preview.text;
                // khud ke chat me abhi koi message nahi ha toh "Message yourself"
                if (isSelf && !message) {
                  message = "Message yourself";
                }

                const unseen = unseenCountNumber.find((item) => item.senderId === all._id);
                const isMine = last?.senderId === myId;
                const isActive = selectedUser?._id === all._id;

                return (
                  <motion.div
                    key={all._id}
                    layout
                    layoutId={all._id}
                    className={`chatPage__userCard${isActive ? " is-active" : ""}`}
                    onClick={() => handleClick(all)}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ layout: { duration: 0.3 } }}
                  >
                    <div
                      className="chatPage__avatar"
                      style={{ backgroundColor: colors[index % colors.length] }}
                    >
                      {getInitials(all.name)}
                      {!isSelf && <span className="chatPage__onlineDot"></span>}
                    </div>

                    <div className="chatPage__content">
                      <div className="chatPage__row">
                        <h4 className="chatPage__name">
                          {all.name}
                          {isSelf ? " (You)" : ""}
                        </h4>
                        <span className="chatPage__time">
                          {last ? userChatListPresence(last?.updatedAt) : ""}
                        </span>
                      </div>

                      <div className="chatPage__row">
                        <span className="chatPage__preview">
                          {isMine && last?.lastmessage && !isCallMessage(last.messageType, last.lastmessage) && (
                            <TickIcon delivered={!!last?.isDelivered} seen={!!last?.isSeen} />
                          )}
                          <PreviewIcon kind={preview.kind} />
                          <span className="chatPage__previewText">{message}</span>
                        </span>

                        {!isSelf && unseen && unseen.count > 0 && (
                          <span className="chatPage__badge">
                            {unseen.count > 99 ? "99+" : unseen.count}
                          </span>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          )}
        </div>
      </div>

      <button
        type="button"
        className="chatPage__aiFab"
        onClick={openAiChat}
        aria-label="Open AI chat"
        title="AI Chat"
      >
        <Bot size={22} />
      </button>
    </div>
  );
};

export default ChatListPage;