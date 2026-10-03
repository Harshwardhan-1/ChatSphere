import { FiPaperclip } from "react-icons/fi";
import { useEffect, useState, Fragment } from "react";
import { useNavigate } from "react-router-dom";
import { ChatTalk } from "../../hooks/use.chatTalk";
import { showApiError } from "../../utils/showApiError";
import { MessageAction } from "../../actions/message.action";
import {socket} from "../../utils/socket";
import type { Message } from "../../hooks/use.chatTalk";
import "./chatPage.css";
import "./chatPage.whatsapp.css";
import axios from 'axios';
import {env} from '../../configs/env.config';
import { chatPageOption } from "../../actions/chatpage.action";
import { DisappearingMessage } from "../../components/disapperingMessage/disappearing.message";
import { MuteNotification } from "../../components/muteNotification/mute.notification";
import { Media } from "../../components/ChatMedia/media/media";
import { Docs } from "../../components/ChatMedia/docs/docs";
import { ShowLinks } from "../../components/ChatMedia/links/link";
import { renderMessageWithLinks } from "../../utils/linkify/linkify";
import { addToFavourites } from "../../components/addToFavourites/addToFavourites";
import { PinMessage } from "../../components/PinMessage/pinMessage";
import { Bell,BellOff,Phone,Video,Download } from "lucide-react";
import EmojiPicker from "emoji-picker-react";
import { useRef } from "react";
import { emojiOnMessages } from "../../hooks/use.emoji.hook";
import { FooterEmoji } from "../../components/FooterEmoji/FooterEmoji";
import { ForwardModal } from "../../components/ForwardMessage/ForwardModel"; 
import { useCall } from "../../components/Call/CallContext";
import { Trash2,Clock,VolumeX,Image,FileText,Link2,Pencil,Forward,Copy,Pin as PinIcon,PinOff,EyeOff } from "lucide-react";


interface User {
    _id: string;
    name: string;
    email: string;
}

interface CurrentUser {
    loginUserId: string;
    email: string;
}

interface Props {
    data: User;
    data2: CurrentUser;
}


// NAYA — WhatsApp jaisa date label: Today / Yesterday / Tuesday / 05/09/2026
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

const dateLabel = (iso: string | Date): string => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const diffDays = Math.round((startOfDay(new Date()) - startOfDay(d)) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays > 1 && diffDays < 7) return d.toLocaleDateString("en-US", { weekday: "long" });
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
};

// NAYA — file card ke liye extension badge + size text
const fileExt = (name?: string) => (name?.includes(".") ? name.split(".").pop()! : "FILE").toUpperCase().slice(0, 4);

const fileColor = (ext: string): string =>
  ({
    PDF: "#e5493a",
    DOC: "#2b7cd3", DOCX: "#2b7cd3",
    XLS: "#1f9d55", XLSX: "#1f9d55", CSV: "#1f9d55",
    PPT: "#e0752d", PPTX: "#e0752d",
    ZIP: "#7d8a93", RAR: "#7d8a93",
  } as Record<string, string>)[ext] || "#667781";

const fileSize = (kb: any, mb: any) => (Number(mb) >= 1 ? `${mb} MB` : `${kb} KB`);


const ChatPage = ({ data, data2 }: Props) => {
  const [msg,setMsg]=useState<string>("");
  const [newMessageCount, setNewMessageCount] = useState(0);
  const [openMenu, setOpenMenu] = useState<number | null>(null);
  const reactionRef=useRef<HTMLDivElement | null>(null);
  const [reactionMessage,setReactionMessage]=useState<string | null>(null);  
  const colors = ["#FF6B6B","#4ECDC4","#45B7D1","#F7B731","#5F27CD","#10AC84","#EE5253","#2E86DE"];

  // NAYA DOCS — docs message par click karke docs page kholne ke liye
  const navigate = useNavigate();
  const openDocsMessage = (docsId?: string) => {
    if (!docsId) return;
    navigate("/docs", { state: { senderId: data2.loginUserId, openDocsId: docsId } });
  };


  const {userMessage,allmessages,userpresence,status,presence,activeChats,notActiveChats,user_open_chat,userfileData}=ChatTalk(data, data2);

  const isSelfChat = data?._id === data2?.loginUserId;
  const displayMessages = isSelfChat
    ? allmessages.filter((m, idx, arr) => arr.findIndex((x) => x._id === m._id) === idx)
    : allmessages;

  const chatBodyRef = useRef<HTMLDivElement | null>(null);
  const skipAutoScrollRef = useRef(false);
  const skipAutoScrollUntilRef = useRef(0);
  const wasAtBottomRef = useRef(true);
  const scrollToBottom = () => {
    const el = chatBodyRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
      wasAtBottomRef.current = true;
      setNewMessageCount(0);
    }
  };
  const isNearBottom = () => {
    const el = chatBodyRef.current;
    if (!el) return true;
    return el.scrollHeight - el.scrollTop - el.clientHeight <= 80;
  };
  
  const prevLenRef = useRef(0);
  const prevLastIdRef = useRef<string | null>(null);
  const openedChatRef = useRef<string | null>(null);
  useEffect(() => {
    const lastId = displayMessages.length ? displayMessages[displayMessages.length - 1]._id : null;

    if (openedChatRef.current !== data._id) {
      openedChatRef.current = data._id;
      prevLenRef.current = displayMessages.length;
      prevLastIdRef.current = lastId;
      scrollToBottom();
      return;
    }

    if (skipAutoScrollRef.current || Date.now() < skipAutoScrollUntilRef.current) {
      skipAutoScrollRef.current = false;
      prevLenRef.current = displayMessages.length;
      prevLastIdRef.current = lastId;
      return;
    }

    const grew = displayMessages.length > prevLenRef.current;
    const newAtEnd = lastId !== prevLastIdRef.current;
    const lastMessage = displayMessages.length ? displayMessages[displayMessages.length - 1] : null;
    const isPinSystemMessage =
      lastMessage?.messageType === "system" ||
      lastMessage?.messageType === "systemPinned";

    if (grew && newAtEnd && !isPinSystemMessage) {
      if (wasAtBottomRef.current) {
        scrollToBottom();
      } else {
        setNewMessageCount((prev) => prev + 1);
      }
    }

    prevLenRef.current = displayMessages.length;
    prevLastIdRef.current = lastId;
  }, [data._id, displayMessages]);

  useEffect(() => {
    const el = chatBodyRef.current;
    if (!el) return;

    const handleScroll = () => {
      const nearBottom = isNearBottom();
      wasAtBottomRef.current = nearBottom;
      if (nearBottom) setNewMessageCount(0);
    };

    el.addEventListener("scroll", handleScroll);
    handleScroll();

    return () => el.removeEventListener("scroll", handleScroll);
  }, []);

  const [highlightId, setHighlightId] = useState<string | null>(null);
  const highlightTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const jumpToMessage = (id: string) => {
    document.getElementById(`message-${id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    if (highlightTimer.current) clearTimeout(highlightTimer.current);
    setHighlightId(null);
    requestAnimationFrame(() => setHighlightId(id)); // null -> id, taaki same message pe dobara click karne pe animation phir chale
    highlightTimer.current = setTimeout(() => setHighlightId(null), 2300);
  };

  const {deleteForEveryone,delete_from_me,update_message}=MessageAction();
  
  const {alreadyMarked,markAsFavourites,unmarkAsFavourites}=addToFavourites(data2.loginUserId,data._id);

  const {pinMessage,unpinnedMessage,pinData}=PinMessage(data2.loginUserId,data._id);

  // NAYA CALL — yahan sirf call shuru karne ke liye startCall chahiye.
  // Incoming / calling / ongoing ki poori screen ab global <CallProvider> ke <CallScreen /> me hai.
  const { startCall } = useCall();


  //chat page option
  const {clearChat}=chatPageOption();

  const typingTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleTyping=(senderId:string,receiverId:string)=>{
    // khud ko message kar rahe ho toh typing indicator nahi
    if(senderId===receiverId) return;
    socket.emit("user_typing",{senderId,receiverId});
    if(typingTimeout.current!==null){
      clearTimeout(typingTimeout.current);
    }
    typingTimeout.current=setTimeout(()=>{
      socket.emit("stop_typing",{senderId,receiverId});
    },2000);
  }


  const [senderGroups, setSenderGroups] = useState<any[]>([]);

  const handleAllGroups=async(data:any)=>{
    setSenderGroups(data);
  }
  

  const [typing,setTyping]=useState(false);
  const [currentPin, setCurrentPin] = useState(0);
  useEffect(() => {
    if (pinData.length === 0) {
      setCurrentPin(0);
    } else if (currentPin >= pinData.length) {
      setCurrentPin(pinData.length - 1);
    }
  }, [pinData.length, currentPin]);
  useEffect(()=>{
    if(!data._id)return;
     userpresence(data._id);
     if(!data2.loginUserId || !data._id)return;
     activeChats({senderId:data2.loginUserId,receiverId:data._id});
     user_open_chat({senderId:data2.loginUserId,receiverId:data._id});
     socket.on("user_start_typing",({senderId})=>{
      if(data._id==senderId){
        setTyping(true);
      }
     });
     socket.on("user_stop_typing",({senderId})=>{
      if(data._id==senderId){
        setTyping(false);
      }
     });

     socket.emit("all_groups_of_sender",(data2.loginUserId));

     socket.on("got_all_groups_of_sender",handleAllGroups);

     return()=>{
      notActiveChats({senderId:data2.loginUserId,receiverId:data._id});
      socket.off("user_start_typing");
      socket.off("user_stop_typing");
      socket.off("got_all_groups_of_sender",handleAllGroups);
}

  },[data._id,data2.loginUserId,activeChats,notActiveChats,user_open_chat,userpresence]);


  const [allUsers, setAllUsers] = useState<any[]>([]);
  useEffect(() => {
      if(!data2.loginUserId) return;
      const fetchUsers = async () => {
          try {
              const res = await axios.get(`${env.backendUrl}/api/v1/chat/alluser`, { withCredentials: true });
              if (res.data.success) {
                  const otherUsers = res.data.data.allUser.filter(
                      (u: any) => u._id !== data2.loginUserId
                  );
                  setAllUsers(otherUsers);
              }
          } catch (err) {
              showApiError(err);
          }
      };
      fetchUsers();
  }, [data2.loginUserId]);


  // NAYA — message selection + forward modal ke states
  const [selectionMode, setSelectionMode] = useState<boolean>(false);
  const [selectedMsgIds, setSelectedMsgIds] = useState<string[]>([]);
  const [showForwardModal, setShowForwardModal] = useState<boolean>(false);

  const startForwardSelection = (msgId: string) => {
      setSelectionMode(true);
      setSelectedMsgIds([msgId]);
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







  const handleSubmit=async(e:React.FormEvent)=>{
    e.preventDefault();
    if(!data._id || !data2.loginUserId){
      showApiError("any id is missing");
      return;
    }
    if(msg.trim()=== ''){
      showApiError("input field can't be empty");
      return;
    }
      const senderId=data2.loginUserId; 
      const receiverId=data._id;
      const messageType="text"
      userMessage({senderId,receiverId,msg,messageType});
      setMsg('');
      if(!isSelfChat){
        socket.emit("stop_typing",{senderId:data2.loginUserId,receiverId:data._id});
      }
  }


  const [editingId,setEditingId]=useState<string | null>(null);
  const [editText,setEditText]=useState<string>("");
  const [senderId,setSenderId]=useState<string>("");
  const [receiverId,setReceiverId]=useState<string>("");
  const [selectChange,setSelectChange]=useState<string>("");
  //edit logic
  const handleEdit=(all:Message)=>{
    setEditText(all.message);
    setEditingId(all._id);
    setSenderId(all.senderId);
    setReceiverId(all.receiverId);
  }


  // NAYA — file input ab hidden hai; footer ke paperclip icon se khulta hai
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // NAYA — message box textarea: lamba message / paste karne pe apne aap height badhti ha (max tak)
  const msgInputRef = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    const el = msgInputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 140) + "px";
  }, [msg]);

  const sendFile=async(file:File)=>{
    try{
      const formData=new FormData();
      formData.append("file",file);
      const response=await axios.post(`${env.backendUrl}/api/v1/upload`,formData,{withCredentials:true});
      if(response.data.success){
        const fileData=response.data.data;
         userfileData({
        senderId: data2.loginUserId,
        receiverId: data._id,
        msg: fileData.path,
        messageType: "file",
        mimetype: fileData.mimetype,
        filename: fileData.name,
        sizeInKb: fileData.sizeInKb,
        sizeInMb: fileData.sizeInMb,
        originalname:fileData.originalname,
      });
      }
    }catch(err){
      showApiError(err);
    }
  }

  const handleFilePick=(e:React.ChangeEvent<HTMLInputElement>)=>{
    const picked=e.target.files?.[0];
    e.target.value=""; // taaki same file dobara bhi choose ho sake
    if(picked) sendFile(picked);
  }


  //option side screen show
  const [activeOption, setActiveOption] = useState<string | null>(null);



  //side screen show off

  



   const [showMenu,setShowMenu]=useState(false);

  const handleSelect=async(value:string)=>{
    if(value=== "clear chat"){
      if(!window.confirm('confirm you want to delete all chat')){
        return;
      }
      clearChat({senderId:data2.loginUserId,receiverId:data._id});
      setSelectChange('');
    }
    if(value==="disappearing message"){
      setActiveOption("disappearing");
      setShowMenu(false);
    }
    if(value=== "mute notification"){
      setActiveOption("mute notification");
      setShowMenu(false);
    }
    if(value==="media"){
      setActiveOption("media");
      setShowMenu(false);
    }
    if(value==="docs"){
      setActiveOption("docs");
      setShowMenu(false);
    }
    if(value==="links"){
      setActiveOption("links");
      setShowMenu(false);
    }
    setShowMenu(false);
  }





  const toggleFavourite=async()=>{
    if(alreadyMarked=== "Add To Favourites"){
      markAsFavourites({senderId:data2.loginUserId,receiverId:data._id});
    }else{
      unmarkAsFavourites({senderId:data2.loginUserId,receiverId:data._id});
    }
  }

interface Pin{
  _id:string,
  senderId:string,
  receiverId:string,
  isPinned:boolean,
}







  const handlePin=async(all:Pin)=>{
    skipAutoScrollRef.current = true;
    skipAutoScrollUntilRef.current = Date.now() + 1000;

    if(all?.isPinned===false){
      pinMessage({_id:all._id,senderId:all.senderId,receiverId:all.receiverId});
    }else{
      unpinnedMessage({_id:all._id,senderId:all.senderId,receiverId:all.receiverId});
    }
  }




  //emoji
  useEffect(() => {
  const handleClickOutside = (event: MouseEvent) => {
    if (
      reactionRef.current &&
      !reactionRef.current.contains(event.target as Node)
    ) {
      setReactionMessage(null);
    }
  };
  document.addEventListener("mousedown", handleClickOutside);
  return () => {
    document.removeEventListener("mousedown", handleClickOutside);
  };
}, []);
useEffect(() => {
  const handleClickOutside = (event: MouseEvent) => {
    if (
      reactionDetailRef.current &&
      !reactionDetailRef.current.contains(event.target as Node)
    ) {
      setShowReactionDetail(null);
    }
  };
  document.addEventListener("mousedown", handleClickOutside);
  return () => {
    document.removeEventListener("mousedown", handleClickOutside);
  };
}, []);



const [showReactionDetail, setShowReactionDetail] = useState<string | null>(null);
const reactionDetailRef = useRef<HTMLDivElement>(null);

// NAYA — message menu (edit/delete/forward...) aur header ke ⋮ menu ke bahar click karne pe band
useEffect(() => {
  const closeMenus = (e: MouseEvent) => {
    const t = e.target as HTMLElement;
    if (!t.closest(".wa-menu")) setOpenMenu(null); // NAYA — class naam badla: menu-container -> wa-menu
    if (!t.closest(".chatOptions")) setShowMenu(false);
  };
  document.addEventListener("mousedown", closeMenus);
  return () => document.removeEventListener("mousedown", closeMenus);
}, []);

   const {setEmoji}=emojiOnMessages(data2.loginUserId,data._id);

  const handleEmojiReaction=async(data:{_id:string,senderId:string,receiverId:string,emojiData:string})=>{
    setEmoji({_id:data._id,senderId:data.senderId,receiverId:data.receiverId,emojiData:data.emojiData});
  }



const groupReactions = (reactions: { userId: string; emoji: string }[] = []) => {
  return reactions.reduce((acc, r) => {
    if (!acc[r.emoji]) acc[r.emoji] = [];
    acc[r.emoji].push(r.userId);
    return acc;
  }, {} as Record<string, string[]>);
};

const handleRemoveReaction = (messageId: string, currentEmoji: string) => {
  handleEmojiReaction({
    _id: messageId,
    senderId: data2.loginUserId,
    receiverId: data._id,
    emojiData: currentEmoji, 
  });
  setShowReactionDetail(null);
};


  return (
    <div className="chat">
      <div className="chatHeader">
        <div className="chatHeaderLeft">
          <div className="avat"style={{backgroundColor:colors[(data?.name?.charCodeAt(0) || 0) % colors.length]}}>
              {data?.name?.charAt(0).toUpperCase()}
                </div>
         
         
          <div className="userInfo"><h4>{data?.name}</h4>
          <p>{isSelfChat ? "Message yourself" : (status=== "online" ? "🟢online":presence?presence:"⚫offline")}</p>
        </div>


      </div>

      {/* NAYA CALL — call buttons */}
      <div className="chatHeaderCallBtns">
          <Phone size={20} className="callIconBtn" onClick={() => startCall(data._id, "audio")} />
          <Video size={20} className="callIconBtn" onClick={() => startCall(data._id, "video")} />
      </div>

          <div className="chatOptions">
        <button className="threeDotBtn"onClick={() => setShowMenu(prev => !prev)}>⋮</button>
        {showMenu && (
            <div className="optionsMenu">
                <button onClick={() => handleSelect("clear chat")}><Trash2 size={18}/><span>Clear chat</span></button>
                <button onClick={() => handleSelect("disappearing message")}><Clock size={18}/><span>Disappearing messages</span></button>
                <button onClick={() => handleSelect("mute notification")}><VolumeX size={18}/><span>Mute notifications</span></button>
                <button onClick={() => handleSelect("media")}><Image size={18}/><span>Media</span></button>
                <button onClick={()=>handleSelect("docs")}><FileText size={18}/><span>Docs</span></button>
                <button onClick={()=>handleSelect("links")}><Link2 size={18}/><span>Links</span></button>
                <button onClick={toggleFavourite}>{alreadyMarked === "Remove From Favourites" ? <BellOff size={18}/> : <Bell size={18}/>}
                <span>{alreadyMarked}</span></button>
            </div>
        )}
    </div>
      </div>

      {/* NAYA CALL — yahan ka purana callOverlay hata diya: ab call screen global CallProvider me hai */}

      {/* NAYA — jab message select mode on ho tab ye bar dikhega */}
      {selectionMode && (
          <div className="selectionBar">
              <button className="selectionCancelBtn" onClick={cancelSelection}>✕</button>
              <span className="selectionCount">{selectedMsgIds.length} selected</span>
              <button
                  className="selectionForwardBtn"
                  disabled={selectedMsgIds.length === 0}
                  onClick={openForwardModal}
              >
                  ➤
              </button>
          </div>
      )}


{activeOption === "disappearing" && (
    <DisappearingMessage
        onBack={() => setActiveOption(null)}
        senderId={(data2.loginUserId)}
        receiverId={(data._id)}
    />
)}

{activeOption==="mute notification" && (
  <MuteNotification
  onBack={()=>setActiveOption(null)}
  senderId={(data2.loginUserId)}
  receiverId={(data._id)}
    />
)}

{
  activeOption==="media" && (
    <Media 
    onBack={()=>setActiveOption(null)}
    senderId={(data2.loginUserId)}
    receiverId={(data._id)}
    />
  )}

  {activeOption=== "docs" && (
      <Docs 
      onBack={()=>setActiveOption(null)}
      senderId={(data2.loginUserId)}
      receiverId={(data._id)}
      />
    )}

  {activeOption=== "links"&& (
    <ShowLinks 
    onBack={()=>setActiveOption(null)}
    senderId={(data2.loginUserId)}
    receiverId={(data._id)}
    />
    )}





{pinData.length > 0 && (
  <div className="pinned-message-bar">

    {/* NAYA — click pe scroll + highlight */}
    <div
      className="pinned-item"
      onClick={() => pinData[currentPin] && jumpToMessage(pinData[currentPin]._id)}
    >
      <span className="pin-symbol">📌</span>
      <div className="pinned-content">
        <span className="pinned-title">Pinned message</span>
        <span className="pinned-preview">
          {pinData[currentPin]?.message ?? ""}
        </span>
      </div>
    </div>

    {pinData.length > 1 && (
      <div className="pinned-navigation">
        <button onClick={() => setCurrentPin( currentPin === 0? pinData.length - 1:currentPin - 1)}>
          ‹</button>
        <span> {currentPin + 1}/{pinData.length}</span>
        <button onClick={() =>setCurrentPin(currentPin === pinData.length - 1?0:currentPin + 1)}>›
        </button>
      </div>
    )}
  </div>
)}
      <div className="chatBody" ref={chatBodyRef}>
        {newMessageCount > 0 && (
          <button
            type="button"
            onClick={scrollToBottom}
            style={{
              position: "sticky",
              top: "10px",
              left: "50%",
              transform: "translateX(-50%)",
              zIndex: 20,
              border: "none",
              borderRadius: "18px",
              padding: "8px 14px",
              background: "#00a884",
              color: "white",
              cursor: "pointer",
              fontSize: "13px",
              boxShadow: "0 2px 8px rgba(0,0,0,0.2)"
            }}
          >
            ↓ {newMessageCount} new message{newMessageCount > 1 ? "s" : ""}
          </button>
        )}
        <div className="encryptBox">
           Messages are end-to-end encrypted. No one outside this chat can read or listen to them.
        </div>

<div className="chat-body">
  {displayMessages.map((all, index) => {
    const isSender = all.senderId === data2.loginUserId;
    const isDocs = all.messageType === "docs";
    const isSystemMsg = all.messageType === "system" || all.messageType === "systemPinned";
    const isCallMsg =
      all.messageType === "call" ||
      (all.messageType !== "file" && !isSystemMsg && !isDocs &&
        /^[^\p{L}\p{N}]*(missed\s+)?(video|voice)\s+call[^\p{L}\p{N}]*$/iu.test((all.message || "").trim()));
    const noActions = isDocs || isCallMsg;
    const isImageMsg = all.messageType === "file" && !!all.mimetype?.startsWith("image/");
    const isVideoMsg = all.messageType === "file" && !!all.mimetype?.startsWith("video/");

    const prevMsg = index > 0 ? displayMessages[index - 1] : null;
    const thisDate = all.createdAt ? new Date(all.createdAt) : null;
    const prevDate = prevMsg?.createdAt ? new Date(prevMsg.createdAt) : null;
    const showDate =
      !!thisDate && !isNaN(thisDate.getTime()) &&
      (!prevDate || isNaN(prevDate.getTime()) || startOfDay(thisDate) !== startOfDay(prevDate));

    const prevIsSystem = prevMsg?.messageType === "system" || prevMsg?.messageType === "systemPinned";
    const isGroupCont =
      !!prevMsg && !showDate && !isSystemMsg && !prevIsSystem && prevMsg.senderId === all.senderId;
    const hasReactionCls = !isCallMsg && (all.reaction?.length ?? 0) > 0;
    // aakhri 2 messages ka menu upar ki taraf khule (neeche se kat na jaye)
    const menuOpensUp = displayMessages.length > 3 && index >= displayMessages.length - 2;
    const isTextMsg = all.messageType !== "file" && !isSystemMsg && !isDocs;

    const rowClass = isSystemMsg
      ? // system message: bilkul purani classes
        `message ${isSender ? "sender" : "receiver"}${selectionMode && !noActions ? " selectable" : ""}${selectedMsgIds.includes(all._id) ? " selectedMsg" : ""}${highlightId === all._id ? " highlighted" : ""}`
      : `wa-msg ${isSender ? "wa-out" : "wa-in"} ${isGroupCont ? "wa-cont" : "wa-start"}${hasReactionCls ? " has-rx" : ""}${isImageMsg || isVideoMsg ? " wa-media" : ""}${isVideoMsg ? " wa-video" : ""}${selectionMode && !noActions ? " wa-selectable" : ""}${selectedMsgIds.includes(all._id) ? " wa-selected" : ""}${highlightId === all._id ? " wa-flash" : ""}`;

    const timeText = new Date(all.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", hour12: true });

    // NAYA — bubble ke andar time + ticks (WhatsApp jaisa bottom-right)
    const metaEl = (
      <span className="wa-meta">
        {all.isPinned && <span className="wa-pin">📌</span>}
        {all.isEdited && <span className="wa-edited">Edited</span>}
        <span className="wa-time">{timeText}</span>
        {isSender && !isCallMsg && (
            <span className="wa-ticks">
            {all.isSeen ? (
              <span className="wa-tick seen">✓✓</span>
            ) : all.isDelivered ? (
              <span className="wa-tick">✓✓</span>
            ) : all.IsSend ? (
              <span className="wa-tick">✓</span>
            ) : null}
          </span>
        )}
      </span>
    );

    return (
      <Fragment key={all._id || index}>

      {showDate && (
        <div className="date-row">
          <span className="date-chip">{dateLabel(all.createdAt)}</span>
        </div>
      )}

      <div
        id={`message-${all._id}`}
        className={rowClass}
        onClick={() => { if (selectionMode && !noActions) toggleMessageSelection(all._id); }}
      >
     {/* NAYA — selection mode me checkbox */}
     {selectionMode && !noActions && (
       <input
         type="checkbox"
         className={isSystemMsg ? "messageSelectCheckbox" : "wa-check"}
         checked={selectedMsgIds.includes(all._id)}
         onChange={() => toggleMessageSelection(all._id)}
         onClick={(e) => e.stopPropagation()}
       />
     )}
     {all.messageType !== "system" &&
 all.messageType !== "systemPinned" && !noActions && (
  <button
    className="wa-rx-btn"
    onClick={(e) => { e.stopPropagation(); setReactionMessage(all._id); }}
  >
    😊
  </button>
)}

     {/* emoji picker — ab screen ke beech me khulta hai (bubble se kat'ta nahi) */}
     {reactionMessage===all._id && (
      <div className="rx-picker" ref={reactionRef} onClick={(e) => e.stopPropagation()}>
        <EmojiPicker 
        onEmojiClick={(emojiData)=>{
          handleEmojiReaction({_id:all._id,senderId:data2.loginUserId,receiverId:data._id,emojiData:emojiData.emoji});
          setReactionMessage(null);
        }}
        />

      </div>
     )}

     {/* reaction badge — bubble ke neeche chhota pill */}
     {!isCallMsg && all.reaction && all.reaction.length > 0 && (
       <div className="rx-badge" onClick={(e) => { e.stopPropagation(); setShowReactionDetail(all._id); }}>
         {Object.keys(groupReactions(all.reaction)).slice(0, 3).map((emoji) => (
           <span key={emoji}>{emoji}</span>
         ))}
         {all.reaction.length > 1 && <span className="rx-count">{all.reaction.length}</span>}
       </div>
     )}

     {/* reaction detail — sab reactions dikhte hain, apni reaction pe tap karke remove */}
     {showReactionDetail === all._id && all.reaction && all.reaction.length > 0 && (
       <div
         className="rx-overlay"
         onClick={(e) => { e.stopPropagation(); setShowReactionDetail(null); }}
       >
         <div className="rx-card" ref={reactionDetailRef} onClick={(e) => e.stopPropagation()}>
           <div className="rx-head">
             {all.reaction.length} reaction{all.reaction.length > 1 ? "s" : ""}
           </div>

           <div className="rx-pills">
             <button
               className="rx-pill"
               onClick={(e) => { e.stopPropagation(); setShowReactionDetail(null); setReactionMessage(all._id); }}
             >
               😊+
             </button>
             {Object.entries(groupReactions(all.reaction)).map(([emoji, users]) => (
               <div key={emoji} className="rx-pill">
                 <span>{emoji}</span>
                 <span className="rx-pill-n">{users.length}</span>
               </div>
             ))}
           </div>

           <div className="rx-divider" />

           <div className="rx-list">
             {all.reaction.map((r) => {
               const isMe = r.userId === data2.loginUserId;
               return (
                 <div
                   key={r.userId}
                   className={`rx-row${isMe ? " is-me" : ""}`}
                   onClick={(e) => { e.stopPropagation(); if (isMe) handleRemoveReaction(all._id, r.emoji); }}
                 >
                   <div
                     className="rx-avatar"
                     style={{ backgroundColor: isMe ? "#00a884" : colors[(data?.name?.charCodeAt(0) || 0) % colors.length] }}
                   >
                     {isMe ? "Y" : data?.name?.charAt(0).toUpperCase()}
                   </div>
                   <div className="rx-info">
                     <span className="rx-name">{isMe ? "You" : data?.name}</span>
                     {isMe && <span className="rx-hint">Tap to remove</span>}
                   </div>
                   <span className="rx-emoji">{r.emoji}</span>
                 </div>
               );
             })}
           </div>
         </div>
       </div>
     )}


        {editingId === all._id ? (
  <div className="wa-edit">
    <input value={editText} onChange={(e) => setEditText(e.target.value)} className="wa-edit-input" />
    <div className="wa-edit-actions">
      <button onClick={() => { setEditingId(null); }}>Cancel</button>
      <button onClick={() => { update_message({ _id: editingId, senderId: senderId, receiverId: receiverId, msg: editText }); setEditingId(null); }}>Save</button>
    </div>
  </div>
) : (
  <>
  
  {/* system message me pin icon purani jagah hi rahega */}
  {isSystemMsg && all.isPinned && (
    <span className="pin-icon-on-message">📌</span>
  )}
    {/* TEXT MESSAGE — time isi ke andar float hota hai; lamba text wrap hoga, newlines bachengi */}
    {isTextMsg && (
      <div
        className="wa-text"
        style={{
          whiteSpace: "pre-wrap",
          overflowWrap: "anywhere",
          wordBreak: "break-word",
          minWidth: 0,
          maxWidth: "100%",
        }}
      >
        {renderMessageWithLinks(all.message)}
        {metaEl}
      </div>
    )}
    
    {all.messageType === "system" && (
  <div className="system-message">
    {isSender ? `${all.message}` : `${all.message}`}
  </div>
)}



{all.messageType=== "systemPinned" && (
  <div className="system-message">
    {isSender?`You Pinned a message`:`They Pinned a message`}
  </div>
)}

    {/* DOCS MESSAGE — NAYA — sirf click se original docs page khulta hai, koi edit/delete nahi */}
    {isDocs && (
      <div
        className="docs-message-card"
        onClick={() => { if (!selectionMode) openDocsMessage(all.docsId); }}
      >
        <div className="fileIconBox" style={{ background: "#2b7cd3" }}>DOC</div>
        <div className="fileDetails">
          <div className="docs-message-title">{all.message}</div>
          <div className="docs-message-sub">Tap to open document</div>
        </div>
      </div>
    )}

    {/* FILE MESSAGE — ab normal flow mein hai, absolute nahi */}
    {all.messageType === "file" && (
      <div className="fileMessage">
        {/* IMAGE */}
        {all.mimetype?.startsWith("image/") && (
          <div className="imageMessage">
            <img src={`${env.backendUrl}${all.message}`} alt={all.filename} onLoad={index === displayMessages.length - 1 ? scrollToBottom : undefined} />
          </div>
        )}

        {/* VIDEO */}
        {all.mimetype?.startsWith("video/") && (
          <div className="videoMessage">
            <video src={`${env.backendUrl}${all.message}`} controls preload="metadata" />
          </div>
        )}

        {/* NAYA — PDF / DOC / XLS / ZIP / baaki sab files: WhatsApp jaisa card */}
        {!all.mimetype?.startsWith("image/") &&
          !all.mimetype?.startsWith("video/") && (() => {
            const ext = all.mimetype === "application/pdf" ? "PDF" : fileExt(all.filename);
            return (
              <div className="documentMessage">
                <div className="fileIconBox" style={{ background: fileColor(ext) }}>{ext}</div>
                <div className="fileDetails">
                  <span className="fileName">{all.filename}</span>
                  <span className="fileMeta">{fileSize(all.sizeInKb, all.sizeInMb)} · {ext}</span>
                </div>
                <a
                  className="fileOpenBtn"
                  href={`${env.backendUrl}${all.message}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Open"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Download size={18} />
                </a>
              </div>
            );
          })()}
      </div>
    )}


    {/* file / docs bubble: time + ticks neeche right me */}
    {!isSystemMsg && !isTextMsg && (
      <div className="wa-meta-row">{metaEl}</div>
    )}

    {/* system message: time + ticks purane tareeke se (koi change nahi) */}
    {isSystemMsg && (
      <>
        <div className="message-time">
          {all.isEdited && <span>Edited </span>}
          {timeText}
        </div>

        {isSender && (
          <div className="message-status">
            {all.isSeen ? (
              <span style={{ color: "blue" }}>✓✓</span>
            ) : all.isDelivered ? (
              <span>✓✓</span>
            ) : all.IsSend ? (
              <span>✓</span>
            ) : null}
          </div>
        )}
      </>
    )}
  </>
)}


{/* MESSAGE MENU — ab har option ke saath icon hai */}
{all.messageType !== "system" && all.messageType!=="systemPinned" && !noActions && (
  <div className={`wa-menu${openMenu === index ? " open" : ""}${menuOpensUp ? " up" : ""}`}>
    <button className="wa-menu-btn" onClick={(e) => { e.stopPropagation(); setOpenMenu(openMenu === index ? null : index); }}>⋮</button>


    {openMenu === index && (
      <div className="wa-menu-dropdown" onClick={(e) => e.stopPropagation()}>
        {isSender ? (
          <>
            {all.messageType !== "file" && (
              <div className="wa-menu-item" onClick={() => { handleEdit(all); setOpenMenu(null); }}><Pencil size={16}/><span>Edit</span></div>
            )}
            {/* NAYA — Forward option */}
            <div className="wa-menu-item" onClick={() => { startForwardSelection(all._id); setOpenMenu(null); }}><Forward size={16}/><span>Forward</span></div>
            <div className="wa-menu-item" onClick={() => { delete_from_me({ _id: all._id, senderId: data2.loginUserId, receiverId: all.receiverId }); setOpenMenu(null); }}><EyeOff size={16}/><span>Delete For Me</span></div>
            <div className="wa-menu-item danger" onClick={() => { deleteForEveryone({ _id: all._id, senderId: all.senderId, receiverId: all.receiverId }); setOpenMenu(null); }}><Trash2 size={16}/><span>Delete For Everyone</span></div> 
          </>
        ) : (
          <>
            {/* NAYA — Forward option receiver side bhi */}
            <div className="wa-menu-item" onClick={() => { startForwardSelection(all._id); setOpenMenu(null); }}><Forward size={16}/><span>Forward</span></div>
            <div className="wa-menu-item" onClick={() => { delete_from_me({ _id: all._id, senderId: data2.loginUserId, receiverId: all.receiverId }); setOpenMenu(null); }}><EyeOff size={16}/><span>Delete For Me</span></div>
          </>
        )}
        {all.messageType === "text" && (<div onClick={()=>{navigator.clipboard.writeText(all.message);setOpenMenu(null);}} className="wa-menu-item"><Copy size={16}/><span>Copy</span></div>)}  
  {isSender && (
     <div onClick={()=>handlePin({ _id: all._id,senderId: data2.loginUserId,receiverId: data._id,isPinned: all?.isPinned
      })
    }className="wa-menu-item">{all.isPinned ? <PinOff size={16}/> : <PinIcon size={16}/>}<span>{all.isPinned ? "Unpin" : "Pin"}</span></div>
)}      </div>
    )}
  </div>
)}
      </div>
      </Fragment>
    );
  })}
  
</div>

{typing && !isSelfChat && (
  <div className="typing-indicator">
    <span></span>
    <span></span>
    <span></span>
  </div>
)}
      </div>
      <div className="chatFooter">
        <FooterEmoji setMsg={setMsg} />
        <FiPaperclip
          className="footerIcon"
          style={{ cursor: "pointer" }}
          onClick={() => fileInputRef.current?.click()}
        />
        <input type="file" ref={fileInputRef} onChange={handleFilePick} style={{ display: "none" }} />
        <form onSubmit={handleSubmit}>
          <textarea
            ref={msgInputRef}
            rows={1}
            className="msgTextarea"
            placeholder="type your message here"
            value={msg}
            onChange={(e)=>{
              setMsg(e.target.value);
              if(data2.loginUserId && data._id){
                handleTyping(data2.loginUserId,data._id);
              }
            }}
            onKeyDown={(e)=>{
              // Enter = send, Shift+Enter = nayi line (WhatsApp Web jaisa)
              if(e.key==="Enter" && !e.shiftKey){
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
          />
          <button type="submit">send</button>
        </form>

      </div>

      {/* NAYA — Forward Modal, purane GroupChat wale component ko yahan reuse kiya hai */}
      {showForwardModal && (
          <ForwardModal
              onClose={() => setShowForwardModal(false)}
              senderId={data2.loginUserId}
              users={allUsers}
              groups={senderGroups}
              selectedMessageIds={selectedMsgIds}
              onForwarded={cancelSelection}
              sourceType="personal"
          />
      )}
    </div>
    
  );
};

export default ChatPage;















//chat list ma pin message ha toh wo nahi dikhana ha chatlist ma tick
