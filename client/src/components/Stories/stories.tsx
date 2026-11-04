import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import EmojiPicker from "emoji-picker-react";
import "./stories.css";
import {
  FiPlus,
  FiMoreVertical,
  FiArrowLeft,
  FiX,
  FiChevronLeft,
  FiChevronRight,
  FiPlay,
  FiPause,
  FiVolume2,
  FiVolumeX,
  FiSend,
  FiEye,
  FiHeart,
  FiSmile,
  FiSun,
  FiMoon,
} from "react-icons/fi";
import { FaHeart } from "react-icons/fa";
import { env } from "../../configs/env.config";
import axiosInstance from "../../services/axiosInstance";
import { useStoriesTalk } from "../../hooks/Use.storiestalk";
import type { Story, StoryReply } from "../../hooks/Use.storiestalk";

const colors = ["#FF6B6B", "#4ECDC4", "#45B7D1", "#F7B731", "#5F27CD", "#10AC84", "#EE5253", "#2E86DE"];
const avatarColor = (name?: string) => colors[(name?.charCodeAt(0) || 0) % colors.length];

const formatTime = (d?: string) =>
  d ? new Date(d).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true }) : "";

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

// segmented ring around an avatar — green = unseen story, grey = already seen (Instagram/WhatsApp style)
const StoryRing = ({ total, viewed, size = 56 }: { total: number; viewed: number; size?: number }) => {
  const strokeWidth = 2.5;
  const radius = (size - strokeWidth) / 2;
  const gap = total > 1 ? 6 : 0;
  const segAngle = 360 / total;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="story-ring">
      {Array.from({ length: total }).map((_, i) => {
        const isSeen = i < viewed;
        const start = i * segAngle + gap / 2 - 90;
        const sweep = segAngle - gap;
        const large = sweep > 180 ? 1 : 0;
        const p1 = polarToCartesian(size / 2, size / 2, radius, start);
        const p2 = polarToCartesian(size / 2, size / 2, radius, start + sweep);
        const d = `M ${p1.x} ${p1.y} A ${radius} ${radius} 0 ${large} 1 ${p2.x} ${p2.y}`;
        return (
          <path
            key={i}
            d={d}
            fill="none"
            stroke={isSeen ? "#8696a0" : "#25D366"}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
        );
      })}
    </svg>
  );
};

interface ReplyItemProps {
  reply: StoryReply;
  allReplies: StoryReply[];
  loginUserId: string;
  onLike: (replyId: string) => void;
  onSubmitNestedReply: (parentId: string, message: string) => void;
  onDelete: (replyId: string) => void;
  depth?: number;
}

// each comment renders its own small "reply to this" box — opened per-item,
// so replying to a specific comment never touches the main footer bar
const ReplyItem = ({
  reply,
  allReplies,
  loginUserId,
  onLike,
  onSubmitNestedReply,
  onDelete,
  depth = 0,
}: ReplyItemProps) => {
  const [showBox, setShowBox] = useState(false);
  const [text, setText] = useState("");

  const userObj = typeof reply.userId === "object" ? reply.userId : null;
  const userIdStr = userObj ? userObj._id : (reply.userId as string);
  const isMe = userIdStr === loginUserId;
  const name = userObj?.name || "User";
  const liked = reply.likes?.includes(loginUserId);
  const children = allReplies.filter((r) => r.replyTo === reply._id);

  const handleSend = () => {
    if (!text.trim()) return;
    onSubmitNestedReply(reply._id, text.trim());
    setText("");
    setShowBox(false);
  };

  return (
    <div className="reply-item" style={{ marginLeft: depth * 26 }}>
      <div className="reply-avatar" style={{ background: avatarColor(name) }}>
        {name.charAt(0).toUpperCase()}
      </div>
      <div className="reply-body">
        <div className="reply-bubble">
          <span className="reply-name">{isMe ? "You" : name}</span>
          <p>{reply.message}</p>
        </div>
        <div className="reply-actions">
          <button onClick={() => onLike(reply._id)}>
            {liked ? "❤️ Liked" : "Like"}
            {reply.likes?.length > 0 ? ` · ${reply.likes.length}` : ""}
          </button>
          <button onClick={() => setShowBox((v) => !v)}>Reply</button>
          {isMe && <button onClick={() => onDelete(reply._id)}>Delete</button>}
        </div>

        {showBox && (
          <div className="reply-inline-box">
            <input
              type="text"
              autoFocus
              placeholder={`Reply to ${isMe ? "yourself" : name}...`}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
            />
            <button onClick={handleSend}>
              <FiSend size={14} />
            </button>
          </div>
        )}

        {children.map((c) => (
          <ReplyItem
            key={c._id}
            reply={c}
            allReplies={allReplies}
            loginUserId={loginUserId}
            onLike={onLike}
            onSubmitNestedReply={onSubmitNestedReply}
            onDelete={onDelete}
            depth={depth + 1}
          />
        ))}
      </div>
    </div>
  );
};

export function Stories() {
  const location = useLocation();
  const loginUserId: string = location.state?.senderId || "";
  const loginUserName: string = location.state?.loginUserName || "You";

  const {
    stories,
    viewedByList,
    replies,
    createStory,
    deleteStory,
    viewStory,
    fetchViewedBy,
    toggleLikeStory,
    addReply,
    deleteReply,
    toggleLikeReply,
    fetchReplies,
  } = useStoriesTalk();

  // Theme state synced with document & localStorage
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

  const [view, setView] = useState<"list" | "viewer">("list");
  const [activeSenderId, setActiveSenderId] = useState<string | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [muted, setMuted] = useState(true);
  const [progress, setProgress] = useState(0);
  const [showReplies, setShowReplies] = useState(false);
  const [showViewedBy, setShowViewedBy] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [showMenu, setShowMenu] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const emojiPopupRef = useRef<HTMLDivElement>(null);

  // group flat stories[] into { senderId -> { name, avatar, stories[] } }
  const groups = useMemo(() => {
    const map: Record<string, { senderId: string; name: string; avatar?: string; stories: Story[] }> = {};
    stories.forEach((s) => {
      const creator = typeof s.createdBy === "object" ? s.createdBy : null;
      if (!map[s.senderId]) {
        map[s.senderId] = {
          senderId: s.senderId,
          name: s.senderId === loginUserId ? loginUserName : creator?.name || "Unknown",
          avatar: creator?.avatar,
          stories: [],
        };
      }
      map[s.senderId].stories.push(s);
    });
    Object.values(map).forEach((g) =>
      g.stories.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    );
    return map;
  }, [stories, loginUserId, loginUserName]);

  const myGroup = groups[loginUserId];
  const myStories = myGroup?.stories || [];

  const otherGroups = useMemo(
    () =>
      Object.values(groups)
        .filter((g) => g.senderId !== loginUserId)
        .sort(
          (a, b) =>
            new Date(b.stories[b.stories.length - 1].createdAt).getTime() -
            new Date(a.stories[a.stories.length - 1].createdAt).getTime()
        ),
    [groups, loginUserId]
  );

  const orderedGroups = useMemo(() => (myGroup ? [myGroup, ...otherGroups] : otherGroups), [myGroup, otherGroups]);

  const activeGroup =
    activeSenderId === loginUserId ? myGroup : otherGroups.find((g) => g.senderId === activeSenderId);
  const currentStory = activeGroup?.stories?.[activeIndex];
  const isOwner = currentStory?.senderId === loginUserId;
  const likedByMe = currentStory?.likes?.includes(loginUserId) || false;

  const openViewer = (id: string) => {
    setActiveSenderId(id);
    setActiveIndex(0);
    setView("viewer");
  };

  const closeViewer = () => {
    setView("list");
    setActiveSenderId(null);
    setActiveIndex(0);
    setReplyText("");
  };

  // mark the currently open story as viewed
  useEffect(() => {
    if (currentStory && loginUserId) {
      viewStory({ _id: currentStory._id, senderId: loginUserId });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStory?._id]);

  // FIX #1: whenever the story changes (next/prev/auto-advance), close any open
  // popups (comments panel, viewed-by panel, emoji picker, the 3-dot menu) and
  // resume autoplay — they used to stay open across story changes.
  useEffect(() => {
    setShowReplies(false);
    setShowViewedBy(false);
    setShowEmoji(false);
    setShowMenu(false);
    setPaused(false);
  }, [currentStory?._id]);

  // auto-advancing progress bar
  useEffect(() => {
    if (!currentStory || paused || showReplies || showViewedBy) return;
    setProgress(0);
    const duration = currentStory.storyType === "video" ? (videoRef.current?.duration || 15) * 1000 : 5000;
    const start = Date.now();
    const timer = setInterval(() => {
      const pct = Math.min(((Date.now() - start) / duration) * 100, 100);
      setProgress(pct);
      if (pct >= 100) {
        clearInterval(timer);
        goNext();
      }
    }, 50);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStory?._id, paused, showReplies, showViewedBy]);

  // keep the actual <video> element paused/playing in sync with the paused state
  useEffect(() => {
    if (!videoRef.current || currentStory?.storyType !== "video") return;
    if (paused || showReplies || showViewedBy) {
      videoRef.current.pause();
    } else {
      videoRef.current.play().catch(() => {});
    }
  }, [paused, showReplies, showViewedBy, currentStory?._id, currentStory?.storyType]);

  const goNext = () => {
    if (!activeGroup) return;
    if (activeIndex < activeGroup.stories.length - 1) {
      setActiveIndex((i) => i + 1);
      return;
    }
    const idx = orderedGroups.findIndex((g) => g.senderId === activeSenderId);
    if (idx < orderedGroups.length - 1) {
      setActiveSenderId(orderedGroups[idx + 1].senderId);
      setActiveIndex(0);
    } else {
      closeViewer();
    }
  };

  const goPrev = () => {
    if (activeIndex > 0) {
      setActiveIndex((i) => i - 1);
      return;
    }
    const idx = orderedGroups.findIndex((g) => g.senderId === activeSenderId);
    if (idx > 0) {
      const prevGroup = orderedGroups[idx - 1];
      setActiveSenderId(prevGroup.senderId);
      setActiveIndex(prevGroup.stories.length - 1);
    }
  };

  const handleAddStoryClick = () => fileInputRef.current?.click();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const formData = new FormData();
      formData.append("story", file);
      // FIXED: axiosInstance already has /api/v1 in baseURL, so only "/uploadStory" is needed
      const res = await axiosInstance.post(`/uploadStory`, formData, { withCredentials: true });
      if (res.data.success) {
        const fileData = res.data.data;
        createStory({
          senderId: loginUserId,
          link: fileData.path,
          message: "",
          storyType: fileData.storyType,
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      e.target.value = "";
    }
  };

  // main footer bar — used ONLY for a direct, top-level comment on the story itself
  const handleSendReply = () => {
    if (!replyText.trim() || !currentStory) return;
    addReply({
      _id: currentStory._id,
      senderId: loginUserId,
      message: replyText.trim(),
      parentId: null,
    });
    setReplyText("");
    setShowEmoji(false);
  };

  // FIX #2: replying to someone else's comment now goes through this — called
  // from the small inline box under that specific comment, with that comment's
  // own _id as parentId. The main footer/comments panel is left untouched.
  const handleSubmitNestedReply = (parentId: string, message: string) => {
    if (!currentStory) return;
    addReply({
      _id: currentStory._id,
      senderId: loginUserId,
      message,
      parentId,
    });
  };

  const handleToggleLike = () => {
    if (!currentStory) return;
    toggleLikeStory({ _id: currentStory._id, senderId: loginUserId });
  };

  const handleOpenReplies = () => {
    if (!currentStory) return;
    fetchReplies({ _id: currentStory._id, senderId: loginUserId });
    setShowReplies(true);
    setPaused(true);
  };

  // FIX #3: fetch a fresh viewed-by list every time the panel is opened, instead
  // of relying on a one-time fetch from when the story first loaded (which could
  // be before anyone had viewed it yet, leaving the list stuck empty forever).
  const handleOpenViewedBy = () => {
    if (!currentStory) return;
    fetchViewedBy({ _id: currentStory._id, senderId: loginUserId });
    setShowViewedBy(true);
    setPaused(true);
  };

  const handleDeleteStory = () => {
    if (!currentStory) return;
    if (!window.confirm("Delete this status update?")) return;
    deleteStory({ _id: currentStory._id, senderId: loginUserId });
    setShowMenu(false);
    goNext();
  };

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (emojiPopupRef.current && !emojiPopupRef.current.contains(e.target as Node)) {
        setShowEmoji(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <>
      {view === "list" && (
        <div className="status-page" data-theme={theme}>
          <div className="status-header">
            <h2>Status</h2>
            <div className="status-header-icons">
              <button
                className="theme-toggle-btn"
                onClick={toggleTheme}
                title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              >
                {theme === "dark" ? <FiSun size={20} /> : <FiMoon size={20} />}
              </button>
              <button onClick={handleAddStoryClick} title="Add status">
                <FiPlus size={20} />
              </button>
              
            </div>
          </div>

          <div
            className="my-status-row"
            onClick={() => (myStories.length ? openViewer(loginUserId) : handleAddStoryClick())}
          >
            <div className="status-avatar-wrapper">
              <div
                className={`status-avatar ${myStories.length ? "has-story" : ""}`}
                style={{ background: avatarColor(loginUserName) }}
              >
                <span className="status-avatar-letter">{loginUserName?.charAt(0)?.toUpperCase()}</span>
              </div>
              <span
                className="add-status-badge"
                onClick={(e) => {
                  e.stopPropagation();
                  handleAddStoryClick();
                }}
              >
                <FiPlus size={12} />
              </span>
            </div>
            <div className="status-info">
              <h4>My status</h4>
              <p>
                {myStories.length
                  ? `Today at ${formatTime(myStories[myStories.length - 1].createdAt)}`
                  : "Click to add status update"}
              </p>
            </div>
          </div>

          {otherGroups.length > 0 && (
            <>
              <p className="status-section-label">Recent</p>
              {otherGroups.map((group) => {
                const viewedCount = group.stories.filter((s) => s.viewedBy.includes(loginUserId)).length;
                return (
                  <div key={group.senderId} className="status-row" onClick={() => openViewer(group.senderId)}>
                    <div className="status-avatar-wrapper">
                      <div className="status-avatar" style={{ background: avatarColor(group.name) }}>
                        <StoryRing total={group.stories.length} viewed={viewedCount} />
                        <span className="status-avatar-letter">{group.name?.charAt(0)?.toUpperCase()}</span>
                      </div>
                    </div>
                    <div className="status-info">
                      <h4>{group.name}</h4>
                      <p>Today at {formatTime(group.stories[group.stories.length - 1].createdAt)}</p>
                    </div>
                  </div>
                );
              })}
            </>
          )}
          <input
            type="file"
            accept="image/*,video/*"
            ref={fileInputRef}
            style={{ display: "none" }}
            onChange={handleFileChange}
          />
        </div>
      )}

      {view === "viewer" && currentStory && activeGroup && (
        <div className="story-viewer-overlay" data-theme={theme}>
          {currentStory.storyType === "image" && (
            <div
              className="story-blurred-bg"
              style={{ backgroundImage: `url(${env.backendUrl}${currentStory.storyLink})` }}
            />
          )}

          <div className="story-viewer-container">
            <div className="story-progress-row">
              {activeGroup.stories.map((s, i) => (
                <div key={s._id} className="story-progress-track">
                  <div
                    className="story-progress-fill"
                    style={{ width: i < activeIndex ? "100%" : i === activeIndex ? `${progress}%` : "0%" }}
                  />
                </div>
              ))}
            </div>

            <div className="story-viewer-header">
              <button className="story-icon-btn" onClick={closeViewer}>
                <FiArrowLeft size={20} />
              </button>
              <div className="story-header-avatar" style={{ background: avatarColor(activeGroup.name) }}>
                {activeGroup.name?.charAt(0)?.toUpperCase()}
              </div>
              <div className="story-header-info">
                <span className="story-header-name">{activeGroup.name}</span>
                <span className="story-header-time">{formatTime(currentStory.createdAt)}</span>
              </div>
              <button
                className="story-icon-btn"
                onClick={toggleTheme}
                title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
              >
                {theme === "dark" ? <FiSun size={18} /> : <FiMoon size={18} />}
              </button>
              <button className="story-icon-btn" onClick={() => setPaused((p) => !p)}>
                {paused ? <FiPlay size={18} /> : <FiPause size={18} />}
              </button>
              {currentStory.storyType === "video" && (
                <button className="story-icon-btn" onClick={() => setMuted((m) => !m)}>
                  {muted ? <FiVolumeX size={18} /> : <FiVolume2 size={18} />}
                </button>
              )}
              {isOwner && (
                <div className="story-menu-wrapper">
                  <button className="story-icon-btn" onClick={() => setShowMenu((m) => !m)}>
                    <FiMoreVertical size={18} />
                  </button>
                  {showMenu && (
                    <div className="story-menu-dropdown">
                      <button onClick={handleDeleteStory}>Delete</button>
                    </div>
                  )}
                </div>
              )}
              <button className="story-icon-btn" onClick={closeViewer}>
                <FiX size={20} />
              </button>
            </div>

            {(activeIndex > 0 || orderedGroups.findIndex((g) => g.senderId === activeSenderId) > 0) && (
              <button className="story-nav-btn story-nav-left" onClick={goPrev}>
                <FiChevronLeft size={22} />
              </button>
            )}
            <button className="story-nav-btn story-nav-right" onClick={goNext}>
              <FiChevronRight size={22} />
            </button>

            <div className="story-media">
              {currentStory.storyType === "image" ? (
                <img src={`${env.backendUrl}${currentStory.storyLink}`} alt="" />
              ) : (
                <video
                  ref={videoRef}
                  src={`${env.backendUrl}${currentStory.storyLink}`}
                  autoPlay
                  muted={muted}
                  onEnded={goNext}
                />
              )}
              {currentStory.message && <div className="story-caption">{currentStory.message}</div>}
            </div>

            {isOwner && (
              <div className="story-viewed-bar" onClick={handleOpenViewedBy}>
                <FiEye size={16} /> <span>{currentStory.viewedBy.length}</span>
              </div>
            )}

            <div className="story-footer">
              <div className="story-reply-row">
                <button className="story-icon-btn" onClick={() => setShowEmoji((v) => !v)}>
                  <FiSmile size={20} />
                </button>
                {showEmoji && (
                  <div className="story-emoji-popup" ref={emojiPopupRef}>
                    <EmojiPicker onEmojiClick={(e) => setReplyText((t) => t + e.emoji)} />
                  </div>
                )}
                <input
                  type="text"
                  placeholder="Type a reply..."
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  onFocus={() => setPaused(true)}
                  onBlur={() => setPaused(false)}
                  onKeyDown={(e) => e.key === "Enter" && handleSendReply()}
                />
                <button className="story-icon-btn" onClick={handleToggleLike}>
                  {likedByMe ? <FaHeart size={20} color="#ff3040" /> : <FiHeart size={20} />}
                </button>
                <button className="story-icon-btn story-send-btn" onClick={handleSendReply}>
                  <FiSend size={18} />
                </button>
              </div>
              {currentStory.replyBy?.length > 0 && (
                <div className="story-view-comments" onClick={handleOpenReplies}>
                  View {currentStory.replyBy.length} comment{currentStory.replyBy.length > 1 ? "s" : ""}
                </div>
              )}
            </div>
          </div>

          {showReplies && currentStory && (
            <div className="story-side-panel">
              <div className="story-side-panel-header">
                <span>Comments</span>
                <button
                  onClick={() => {
                    setShowReplies(false);
                    setPaused(false);
                  }}
                >
                  <FiX size={18} />
                </button>
              </div>
              <div className="story-side-panel-body">
                {replies.filter((r: any) => !r.replyTo).length === 0 && (
                  <p className="story-empty-text">No comments yet</p>
                )}
                {replies
                  .filter((r: any) => !r.replyTo)
                  .map((r: any) => (
                    <ReplyItem
                      key={r._id}
                      reply={r}
                      allReplies={replies}
                      loginUserId={loginUserId}
                      onLike={(replyId) => toggleLikeReply({ _id: currentStory._id, replyId, senderId: loginUserId })}
                      onSubmitNestedReply={handleSubmitNestedReply}
                      onDelete={(replyId) => deleteReply({ _id: currentStory._id, replyId, senderId: loginUserId })}
                    />
                  ))}
              </div>
            </div>
          )}

          {showViewedBy && isOwner && (
            <div className="story-side-panel">
              <div className="story-side-panel-header">
                <span>Viewed by</span>
                <button
                  onClick={() => {
                    setShowViewedBy(false);
                    setPaused(false);
                  }}
                >
                  <FiX size={18} />
                </button>
              </div>
              <div className="story-side-panel-body">
                {viewedByList.length === 0 && <p className="story-empty-text">No views yet</p>}
                {viewedByList.map((v: any) => (
                  <div key={v._id} className="viewedby-row">
                    <div className="reply-avatar" style={{ background: avatarColor(v.name) }}>
                      {v.name?.charAt(0)?.toUpperCase()}
                    </div>
                    <span>{v.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}