import { useState, useRef } from "react";
import { useLocation } from "react-router-dom";
import { groupChatHook } from "../../hooks/use.groupChat.hook";
import { usePollHook } from "../../hooks/Use.pole.hook";
import { AddGroupMembersModal } from "../../components/AddGroupMembers/AddGroupMembersModel";
import "./GroupChatPage.css";
import "./GroupChatSelection.css";
import { useEffect } from "react";
import { socket } from "../../utils/socket";
import { MsgInfo } from "../../components/msgInfo/msgInfo";
import EmojiPicker from "emoji-picker-react";
import axios from "axios";
import {env} from '../../configs/env.config';
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
import { Phone,Video } from "lucide-react";
import { GroupCall } from "../../components/GroupCall/GroupCall";
import {groupCall as useGroupCallHook} from "../../hooks/use.group.call.hook";
import { CallChatPanel } from "../../components/CallChatPanel/CallChatPanel";
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
    if (sizeInKb < 1024) return `${sizeInKb.toFixed(2)} KB`;
    return `${(sizeInKb / 1024).toFixed(2)} MB`;
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

    const { users,
         allGroupsList,
         sendMessage,
         messages,
         setGroupId,
         handleDeleteFromEveryone ,
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



            // groupChatHook destructure ke turant baad ye add karo:
    const {
        incomingCall,
        activeCall,
        calling,
        callError,
        startGroupCall,
        acceptGroupCall,
        rejectGroupCall,
        joinOngoingCall,
        leaveGroupCall: hangUpGroupCall,
        setCallError,
    } = useGroupCallHook(senderId);



        

    // poll ke liye alag hook - isme sirf current group ka data aayega
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
    const [message,setMessage]=useState<string>("");
    const [showMsgInfo, setShowMsgInfo] = useState(false);
    const [selectedMsgId, setSelectedMsgId] = useState<string>("");
    const [editingMsgId, setEditingMsgId] = useState<string | null>(null);
    const [editText, setEditText] = useState<string>("");

    const [reactionMessage, setReactionMessage] = useState<string | null>(null);
    const [showReactionDetail, setShowReactionDetail] = useState<string | null>(null);
    const reactionRef = useRef<HTMLDivElement | null>(null);
    const reactionDetailRef = useRef<HTMLDivElement | null>(null);
    const [isCreator,setIsCreator]=useState<string>("");
    const [groupStatus,setGroupStatus]=useState<boolean>(false);
    const [leavesTheGroup,setLeavesTheGroup]=useState<boolean>(false);
    const [chatLocked,setChatLocked]=useState<boolean>(false);

    const [selectionMode, setSelectionMode] = useState<boolean>(false);
    const [selectedMsgIds, setSelectedMsgIds] = useState<string[]>([]);
    const [showForwardModal, setShowForwardModal] = useState<boolean>(false);

    // poll create karne wala modal - iska data sirf isi selectedGroup ko jayega, kisi aur group ko nahi
    const [showCreatePoll, setShowCreatePoll] = useState<boolean>(false);

    const [groupLastMessages, setGroupLastMessages] = useState<any[]>([]);
    const [groupPendingCounts, setGroupPendingCounts] = useState<{id:string; count:number}[]>([]);

    // naye refs - auto scroll ke liye
    const messagesEndRef = useRef<HTMLDivElement | null>(null);
    const prevGroupIdRef = useRef<string | null>(null);

    const liveSelectedGroup = allGroupsList?.find((g: any) => g._id === selectedGroup?._id) ?? selectedGroup;

    useEffect(()=>{
        if(!senderId)return;

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

        const handlePendingMessages = (data: {id:string; count:number}[]) => {
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
    },[senderId]);

    useEffect(()=>{
        if(!selectedGroup?._id || !senderId)return;
        setGroupId(selectedGroup?._id);
        setGroupStatus(false); 
        setLeavesTheGroup(false);

        socket.emit("clear_all_pending_messages",({_id:selectedGroup._id,senderId:senderId}));

        socket.emit("active_group_user",({senderId:senderId,groupId:selectedGroup?._id}));
        socket.emit("previousMessage",{_id:selectedGroup._id,senderId:senderId});
        socket.emit("user_open_group_chat",({_id:selectedGroup._id,senderId:senderId}));
        socket.emit("check_group_exist",({_id:selectedGroup._id,senderId}));
        socket.emit("check_is_a_member",({_id:selectedGroup._id,senderId}))
        socket.emit("is_chat_locked",({_id:selectedGroup._id,senderId}));



        socket.on("is_present_in_group",(info:string)=>{
       setLeavesTheGroup(info === "true");
});

         socket.on("group_name_changed",(data:{groupId:string,name:string})=>{
        if(data.groupId === selectedGroup._id){
            setSelectedGroup((prev:any) => prev ? {...prev, groupName: data.name} : prev);
        }
    });
    socket.on("group_image_changed",(data:{groupId:string,message:string})=>{
           if(data.groupId === selectedGroup._id){
               setSelectedGroup((prev:any) => prev ? {...prev, groupImage: data.message} : prev);
            }
        });

        socket.on("setCreator",(message:string)=>{
          if(message==="isGroupCreator"){
            setIsCreator("Delete Group");
          }
        });
        socket.on("group_status",(existance:string)=>{
          if(existance==="group not exist"){
            setGroupStatus(true);
          }
        });

        socket.on("group_deleted_successfully",(data:{groupId:string})=>{
            if(data.groupId === selectedGroup._id){
                setGroupStatus(true);
            }
        });

        socket.on("chat_operation",(permission:string)=>{
          if(permission==="chat not locked"){
            setChatLocked(false);
          }else{
            setChatLocked(true);
          }
        });


        socket.on("group_settings_changed",(data:{groupId:string})=>{
    if(data.groupId===selectedGroup._id){
        socket.emit("is_chat_locked",({_id:selectedGroup._id,senderId}));
    }
});

        return()=>{
            socket.emit("not_activeGroupChatUser",({senderId:senderId,groupId:selectedGroup?._id}));
            socket.off("setCreator");
            socket.off("group_status");
            socket.off("group_deleted_successfully");
            socket.off("group_name_changed");
            socket.off("group_image_changed");
            socket.off("is_present_in_group");
            socket.off("chat_operation");
            socket.off("group_settings_changed");
          }
    },[selectedGroup?._id,senderId]);


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
        return()=>document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    // naya effect - WhatsApp jaisa auto scroll: group switch pe turant niche, naya message aane pe smooth scroll
    useEffect(() => {
        const isNewGroup = prevGroupIdRef.current !== selectedGroup?._id;
        messagesEndRef.current?.scrollIntoView({ behavior: isNewGroup ? "auto" : "smooth" });
        prevGroupIdRef.current = selectedGroup?._id ?? null;
    }, [messages]);


    const handleSubmit=async(e:React.FormEvent<HTMLFormElement>)=>{
        e.preventDefault();
        try{
            if(groupStatus)return;
            if(message.trim().length===0){
                alert("message field cannot be empty");
                return;
            }
            sendMessage({_id:selectedGroup._id,senderId,message,messageType:"text"});
            setMessage('');
        }catch(err){
            throw err;
        }
    }


    const handleDeleteForEveryone=(_id:string)=>{
        if(groupStatus)return;
        handleDeleteFromEveryone({_id:selectedGroup._id,msgId:_id,senderId});
    }


    const handleDeleteForMe=(_id:string)=>{
        handelDeleteFromMy({_id:selectedGroup._id,msgId:_id,senderId});
    }

    const handleEdit=(msg:any)=>{
        if(groupStatus)return;
        setEditingMsgId(msg._id);
        setEditText(msg.message);
    }

    const cancelEdit=()=>{
        setEditingMsgId(null);
        setEditText("");
    }



    const saveEdit=(_id:string)=>{
        if(groupStatus)return;
        handleEditMessage({_id:selectedGroup._id,msgId:_id,message:editText,senderId});
    }


    const handleMsgInfo = (_id:string) => {
    setSelectedMsgId(_id);
    setShowMsgInfo(true);
    messageInfo({ _id: selectedGroup._id, msgId: _id, senderId });
}

    const getMemberName = (userId: string) => {
        const person = selectedGroup?.peoplesId?.find((p: any) => p._id === userId);
        return person?.name || "Unknown";
    };

    const groupReactions = (reactions: { userId: string; emoji: string }[] = []) => {
        return reactions.reduce((acc, r) => {
            if (!acc[r.emoji]) acc[r.emoji] = [];
            acc[r.emoji].push(r.userId);
            return acc;
        }, {} as Record<string, string[]>);
    };


    const handleEmojiReaction=(_id:string,emoji:string)=>{
        if(groupStatus)return;
        groupEmoji({_id:selectedGroup._id,msgId:_id,senderId,emoji});
    };

    const handleRemoveReaction = (msgId: string, currentEmoji: string) => {
        if(groupStatus)return;
        handleEmojiReaction(msgId, currentEmoji);
        setShowReactionDetail(null);
    };

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



    const [file,setFile]=useState<File>();
      const [activeOption, setActiveOption] = useState<string | null>(null);
    



    const handleFileSubmit=async(e:React.FormEvent<HTMLFormElement>)=>{
        e.preventDefault();
        if(groupStatus)return;
        if(!file){
            alert("file not found");
            return;
        }
        try{
        const formData=new FormData();
        formData.append("file",file);

        const res=await axiosInstance.post("/upload",formData);
        if(res.data.success){
            const data=res.data.data;
            groupFile({_id:selectedGroup._id,senderId,message:data.path,messageType:"file",
                fileUrl:data.path,mimetype:data.mimetype,sizeInKb:data.sizeInKb,sizeInMb:data.sizeInMb,
                filename:data.fileName,orignalname:data.orignalname,
            });
        }
        }catch(err){
            showApiError(err);
            console.log(err);
        }
    }

   const [showMenu,setShowMenu]=useState<boolean>(false);



  const handleSelect=(value:string)=>{
    if(value==="clear chat"){
        if(!window.confirm("confirm you want to clear chat")){
            return;
        }
        clearGroupChatUser({_id:selectedGroup._id,senderId});
        return;
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
    if(value==="mute notification"){
       if(groupStatus)return; 
        setActiveOption("mute notification");
        setShowMenu(false);
    }
    if(value==="disappearing message"){
       if(groupStatus)return; 
      setActiveOption("disappearing message");
      setShowMenu(false);
    }
  }


  const emitTheSocket=async()=>{
    checkIsCreator({_id:selectedGroup._id,senderId});
  }



  const handleGroupDelete=async()=>{
    if(groupStatus)return;
    deleteGroup({_id:selectedGroup._id,senderId});
  }
  

  const handleExitAndDelete=async()=>{
    if(!window.confirm("you will not see this chat anymore confirm you want to delete")){
      return;
    }
    exitGroup({_id:selectedGroup._id,senderId});
    setSelectedGroup(null);
    setGroupStatus(false);
  }

  const handleExit=async()=>{
    exitThisGroup({_id:selectedGroup._id,senderId})
  }

  const getGroupDisplayMessage = (last?: any) => {
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
  };

  const sortedGroups = [...(allGroupsList || [])].sort((a: any, b: any) => {
      const aLast = groupLastMessages.find(g => g.groupId === a._id);
      const bLast = groupLastMessages.find(g => g.groupId === b._id);
      const aTime = aLast ? new Date(aLast.updatedAt).getTime() : 0;
      const bTime = bLast ? new Date(bLast.updatedAt).getTime() : 0;
      return bTime - aTime;
  });

  // poll sirf isi selectedGroup ke liye create hoga - kisi aur group ko nahi jayega
  const handleCreatePoll = (data:{title:string,selectOptions:boolean,polldata:{msg:string,peoplesId:string[]}[]}) => {
      if(!selectedGroup?._id)return;
      createPoll({ _id: selectedGroup._id, ...data });
  }














    // handleGroupVoiceCall / handleGroupVideoCall ki jagah ye rakho:

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

  // ===== NEW: group ki SABSE RECENT call-message hi "abhi chal rahi" call maani jayegi =====
  // isi ki wajah se Join button sirf usi ek call-message pe dikhega, purani call-messages pe nahi
  const lastCallMessage = [...(messages || [])].reverse().find((m: any) => m.messageType === "call");
  const ongoingCallMsgId = liveSelectedGroup?.callStatus === "busy" ? lastCallMessage?._id : null;

  const handleGroupVoiceCall=()=>{
      if(groupStatus || leavesTheGroup || !selectedGroup?._id) return;
      const receiverId = buildReceiverIds();
      if(receiverId.length===0){
          alert("No other members to call");
          return;
      }
      startGroupCall({ groupId: selectedGroup._id, receiverId, messageType: "voice" });
  }

  const handleGroupVideoCall=()=>{
      if(groupStatus || leavesTheGroup || !selectedGroup?._id) return;
      const receiverId = buildReceiverIds();
      if(receiverId.length===0){
          alert("No other members to call");
          return;
      }
      startGroupCall({ groupId: selectedGroup._id, receiverId, messageType: "video" });
  }



  return (
        <div className="group-chat">

            {/* LEFT : GROUP LIST */}
            <div className="group-list">
                <button onClick={() => setShowModal(true)}>Create Group</button>
                {sortedGroups?.map((group: any) => {
                    const last = groupLastMessages.find(g => g.groupId === group._id);
                    const pending = groupPendingCounts.find(p => p.id === group._id);

                    return (
                        <div key={group._id} className="group-item" onClick={() => setSelectedGroup(group)}>
                            <div className="group-item-avatar">
                                {group.groupImage ? (
                                    <img src={resolveFileUrl(group.groupImage)} alt={group.groupName} />
                                ) : (
                                    <span>{group.groupName?.charAt(0)?.toUpperCase()}</span>
                                )}
                            </div>
                            <div className="group-item-content">
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                    <span>{group.groupName}</span>
                                    <span style={{ fontSize: "12px", color: "#667781" }}>
                                        {last ? userChatListPresence(last?.updatedAt) : ""}
                                    </span>
                                </div>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                    <span style={{ fontSize: "13px", color: "#667781", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", maxWidth: "180px" }}>
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

            {/* RIGHT : CHAT */}
            <div className="group-chat-area">
                {!selectedGroup ? (
                  <>
                    <div className="whatsapp-screen">
                        <img src="/WhatsApp.svg"  alt="WhatsApp"/>
                    </div>
                    </> 
                ) : ( 

                 <div className="chat-screen"> 
                 <div className="chatOptions">     
                 <div className="chatHeaderCallBtns">
                 <Phone size={20} className="callIconBtn" onClick={handleGroupVoiceCall}  />
                 <Video size={20} className="callIconBtn" onClick={handleGroupVideoCall} />
                          </div>


        <button className="threeDotBtn" onClick={() => {setShowMenu(prev => !prev); emitTheSocket()}}>⋮</button>
        {showMenu && (
            <div className="optionsMenu">
                <button onClick={() => handleSelect("clear chat")}>Clear chat</button>
                <button disabled={groupStatus || chatLocked} onClick={() => handleSelect("disappearing message")}>Disappearing messages</button>
                <button disabled={groupStatus} onClick={() => handleSelect("mute notification")}>Mute notifications</button>
                <button onClick={() => handleSelect("media")}>Media</button>
                <button onClick={() => handleSelect("docs")}>Docs</button>
                <button onClick={() => handleSelect("links")}>Links</button>


                {!isCreator && !groupStatus && (
                  <button onClick={handleExit} disabled={leavesTheGroup}>Leave Group</button>
                )}


                {isCreator && (
                  <button disabled={groupStatus} onClick={handleGroupDelete}>Delete Group</button>
                )}

                {(groupStatus || leavesTheGroup)&& (
                  <button onClick={handleExitAndDelete}>Exit Group</button>
                )}
            </div>
        )}
    </div>

    {groupStatus && (
        <div className="groupDeletedBanner">
            <p>🔒 This group no longer exists</p>
        </div>
    )}

    {
      activeOption==="media" && (
        <GroupMedia
        onBack={()=>setActiveOption(null)}
        _id={selectedGroup._id}
        senderId={senderId}
        />
      )}


      {
      activeOption==="docs" && (
        <GroupDocs
        onBack={()=>setActiveOption(null)}
        _id={selectedGroup._id}
        senderId={senderId}
        />
      )}


      
      {
      activeOption==="links" && (
        <GroupLinks
        onBack={()=>setActiveOption(null)}
        _id={selectedGroup._id}
        senderId={senderId}
        />
      )}



      {
      activeOption==="mute notification" && !groupStatus && !leavesTheGroup && (
        <GroupMuteNotification
        onBack={()=>setActiveOption(null)}
        _id={selectedGroup._id}
        senderId={senderId}
        />
      )}


      
      {
      activeOption==="disappearing message" && !groupStatus && !leavesTheGroup && (
        <GroupDisappearingMessage
        onBack={()=>setActiveOption(null)}
        _id={selectedGroup._id}
        senderId={senderId}
        />
      )}
      

      {
        activeOption==="profile" && (
          <GroupProfile 
          onBack={()=>setActiveOption(null)}
          _id={selectedGroup._id}
          senderId={senderId}
          GroupName={liveSelectedGroup.groupName}
          GroupImage={liveSelectedGroup?.groupImage}
          leavesTheGroup={leavesTheGroup}
          groupStatus={groupStatus}
          onNameUpdated={(name:string)=> setSelectedGroup((prev:any)=> prev ? {...prev, groupName:name} : prev)}
          users={users}
          />
        )
      }


      {selectionMode ? (
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
      ) : (
        <div className="chat-header" onClick={() =>setActiveOption("profile")} style={{cursor: "pointer"}}> 
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
                <p>{liveSelectedGroup.peoplesId?.map((person: any, index: number) => (
                <span key={person._id || index}>{person._id === senderId ? "(You)" : person.name}
            {index < liveSelectedGroup.peoplesId.length - 1 ? ", " : ""}
        </span>
    ))}
</p>
            </div>
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
    // ===== CHANGE: call messages ke liye emoji/tick/3-dot menu sab hide karne ke liye ye flag =====
    const isCallMsg = isVoiceCall || isVideoCall;
    const isImage = isFileMsg && msg.mimetype?.startsWith("image");
    const isVideo = isFileMsg && msg.mimetype?.startsWith("video");
    const isPdf = isFileMsg && msg.mimetype === "application/pdf";
    const isOtherFile = isFileMsg && !isImage && !isVideo && !isPdf;
    const fileSrc = isFileMsg ? resolveFileUrl(msg.fileUrl) : "";
    const displayFileName = msg.orignalname || msg.filename || "file";

    if (isSystem) {
      return (
        <div key={msg._id || index} className="system-message">
          {msg.message}
        </div>
      );
    }

    // poll message - sirf isi group ke andar render hota ha, forward/multi-group nahi
    if (isPoll) {
      return (
        <div
          key={msg._id || index}
          className={`${isSender ? "message sender" : "message receiver"} poll-message-wrapper`}
        >
          {!isSender && (
            <span className="message-sender-name" style={{ color: getSenderColor(msgSenderId?.toString() || "") }}>
              {typeof msg.senderId === "object" ? msg.senderId?.name : ""}
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
        className={`${isSender ? "message sender" : "message receiver"}${selectionMode ? " selectable" : ""}${selectedMsgIds.includes(msg._id) ? " selectedMsg" : ""}`}
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
        {!isSender && (
      <span className="message-sender-name" style={{ color: getSenderColor(msgSenderId?.toString() || "") }}>
        {typeof msg.senderId === "object" ? msg.senderId?.name : ""}
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
            <small>{isSender ? "Outgoing" : "Incoming"}</small>
        </div>
        {!isSender && ongoingCallMsgId === msg._id && !activeCall && (
            <button
                type="button"
                className="joinOngoingCallBtn"
                onClick={(e) => { e.stopPropagation(); joinOngoingCall(selectedGroup._id, msg._id, "voice"); }}
            >
                Join
            </button>
        )}
    </div>
)}

{isVideoCall && (
    <div className="call-message video-call-message">
        <Video size={22} />
        <div className="call-message-info">
            <span>Video call</span>
            <small>{isSender ? "Outgoing" : "Incoming"}</small>
        </div>
        {!isSender && ongoingCallMsgId === msg._id && !activeCall && (
            <button
                type="button"
                className="joinOngoingCallBtn"
                onClick={(e) => { e.stopPropagation(); joinOngoingCall(selectedGroup._id, msg._id, "video"); }}
            >
                Join
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
            <div className="file-icon generic-icon">📄</div>
            <div className="file-info">
              <span className="file-name">{displayFileName}</span>
              <span className="file-size">{formatFileSize(msg.sizeInKb)}</span>
            </div>
          </a>
        )}

        {/* ===== CHANGE: emoji reaction button ab call messages pe nahi dikhega ===== */}
        {!isCallMsg && (
        <button className="reaction-btn" disabled={groupStatus || leavesTheGroup}  onClick={(e) => { e.stopPropagation(); setReactionMessage(msg._id); }}>
          😊
        </button>
        )}

        {!isCallMsg && reactionMessage === msg._id && !groupStatus && !leavesTheGroup && (
          <div className="emoji-picker-popup" ref={reactionRef}>
            <EmojiPicker
              onEmojiClick={(emojiData) => {
                handleEmojiReaction(msg._id, emojiData.emoji);
                setReactionMessage(null);
              }}
            />
          </div>
        )}

        {!isCallMsg && msg.reaction && msg.reaction.length > 0 && (
          <div className="reaction-badge" onClick={(e) => { e.stopPropagation(); setShowReactionDetail(msg._id); }}>
            {Object.keys(groupReactions(msg.reaction)).slice(0, 3).map((emoji: string) => (
              <span key={emoji}>{emoji}</span>
            ))}
            {msg.reaction.length > 1 && <span className="reaction-count">{msg.reaction.length}</span>}
          </div>
        )}

        {!isCallMsg && showReactionDetail === msg._id && (
          <div className="reaction-detail-popup" ref={reactionDetailRef}>
            <div className="reaction-detail-header">
              {msg.reaction.length} reaction{msg.reaction.length > 1 ? "s" : ""}
            </div>

            <div className="reaction-pills-row">
              <button className="add-reaction-pill" disabled={groupStatus || leavesTheGroup} onClick={(e) => { e.stopPropagation(); setReactionMessage(msg._id); }}>
                😊+
              </button>
              {Object.entries(groupReactions(msg.reaction)).map(([emoji, users]: [string, any]) => (
                <div key={emoji} className="reaction-pill">
                  <span>{emoji}</span>
                  <span>{users.length}</span>
                </div>
              ))}
            </div>

            <div className="reaction-divider" />

            <div className="reaction-user-list">
              {msg.reaction.map((r: any) => {
                const isMe = r.userId === senderId;
                return (
                  <div key={r.userId} className="reaction-user-row" onClick={(e)=>{ e.stopPropagation(); isMe && handleRemoveReaction(msg._id, r.emoji); }}>
                    <div className="reaction-avatar" style={{ backgroundColor: isMe ? "#00a884" : getSenderColor(r.userId) }}>
                      {isMe ? "Y" : getMemberName(r.userId).charAt(0).toUpperCase()}
                    </div>
                    <div className="reaction-user-info">
                      <span className="reaction-user-name">{isMe ? "You" : getMemberName(r.userId)}</span>
                      {isMe && <span className="reaction-remove-hint">Click to remove</span>}
                    </div>
                    <span className="reaction-emoji-large">{r.emoji}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ===== CHANGE: tick/edited label ab call messages pe nahi dikhega ===== */}
        {!isCallMsg && (
        <span className="message-meta">
          {msg.isEdited && <span className="message-edited">edited</span>}
          {isSender && (<Tick isSeen={msg.isSeen} isDelivered={msg.isDelivered} isSend={msg.isSend} />)}
        </span>
        )}

        {/* ===== CHANGE: 3-dot menu (Forward/Delete/Edit/Copy/Msg Info) ab call messages pe nahi dikhega ===== */}
        {!isCallMsg && (
        <div className="message-menu">
          <button className="menu-button" onClick={(e)=>e.stopPropagation()}>⋮</button>
          <div className="message-menu-dropdown">
            {!isSender ? (
              <>
                <button onClick={(e)=>{e.stopPropagation(); startForwardSelection(msg._id);}}>Forward</button>
                <button onClick={()=>handleDeleteForMe(msg._id)}>Delete for me</button>
                {isText && <button onClick={() => navigator.clipboard.writeText(msg.message)}>Copy</button>}
              </>
            ) : (
              <>

                <button onClick={(e)=>{e.stopPropagation(); startForwardSelection(msg._id);}}>Forward</button>
                {isText && <button disabled={groupStatus || leavesTheGroup || chatLocked}  onClick={()=>handleEdit(msg)}>Edit</button>}
                <button onClick={()=>handleDeleteForMe(msg._id)}>Delete for me</button>
                <button disabled={groupStatus || leavesTheGroup || chatLocked} onClick={()=>handleDeleteForEveryone(msg._id)}>Delete for everyone</button>
                <button onClick={()=>handleMsgInfo(msg._id)}>Msg Info</button>


                {isText && (<button onClick={() => navigator.clipboard.writeText(msg.message)}>Copy</button>
)}
              </>
            )}
          </div>
        </div>
        )}

        {editingMsgId === msg._id && (
          <div className="inline-edit-box" onClick={(e)=>e.stopPropagation()}>
            <input  type="text" value={editText}  onChange={(e) => setEditText(e.target.value)}autoFocus/>
            <button type="button" onClick={() => saveEdit(msg._id)}>Save</button>
            <button type="button" onClick={cancelEdit}>Cancel</button>
          </div>
        )}
      </div>
    );
  })}
  <div ref={messagesEndRef} />
</div>
     {leavesTheGroup && (
      <p>You can't send message to this group because you are no longer Participant</p>
     )}
     {chatLocked && (
      <p>only admins are allowed to send message to the group</p>
     )}
        <form onSubmit={handleSubmit} className="message-form"> 
            <input  type="text"  placeholder="send message" value={message}  onChange={(e)=>setMessage(e.target.value)} disabled={groupStatus || leavesTheGroup || chatLocked}/> 
            <button type="submit" disabled={groupStatus}>Send</button>  
        </form> 

        <form onSubmit={handleFileSubmit} className="message-form">
            <input type="file" placeholder="send message" onChange={(e)=>setFile(e.target.files?.[0])} disabled={groupStatus || leavesTheGroup || chatLocked} />
            <button type="submit" disabled={groupStatus}>Send</button>
        </form>

{/* poll button - sirf isi current group ke liye poll banega, kisi doosre group ko share nahi hoga */}
        <button
            type="button"
            className="pollTriggerBtn"
            disabled={groupStatus || leavesTheGroup || chatLocked}
            onClick={() => setShowCreatePoll(true)}
        >
            📊 Create Poll
        </button>


    </div> 
     )}
     <MsgInfo
    open={showMsgInfo}
    onClose={() => setShowMsgInfo(false)}
    messageId={selectedMsgId}
/>
            </div>

            {showModal && (
                <AddGroupMembersModal
                    users={users}
                    selectedIds={selectedIds}
                    setSelectedIds={setSelectedIds}
                    senderId={senderId}
                    onClose={() => setShowModal(false)}
                />
            )}

            {showForwardModal && (
                <ForwardModal
                    onClose={() => setShowForwardModal(false)}
                    senderId={senderId}
                    users={users}
                    groups={allGroupsList}
                    selectedMessageIds={selectedMsgIds}
                    onForwarded={cancelSelection}
                />
            )}

            {showCreatePoll && (
                <CreatePollModal
                    onClose={() => setShowCreatePoll(false)}
                    onCreate={handleCreatePoll}
                />
            )}













            {incomingCall && (
                <div className="incoming-call-overlay">
                    <div className="incoming-call-box">
                        <p>Incoming {incomingCall.messageType} call</p>
                        <div className="incoming-call-actions">
                            <button onClick={acceptGroupCall}>Accept</button>
                            <button onClick={rejectGroupCall}>Reject</button>
                        </div>
                    </div>
                </div>
            )}

            {calling && !activeCall && (
                <div className="calling-overlay">
                    <p>Calling...</p>
                    <button onClick={hangUpGroupCall}>Cancel</button>
                </div>
                    )}


                    
        {activeCall && (
            <GroupCall
                token={activeCall.liveKitData}
                callType={activeCall.messageType}
                onClose={hangUpGroupCall}
                callId={activeCall.msgId}
                groupId={activeCall.groupId}
                senderId={senderId}
                getMemberName={getMemberName}
            />
        )}
        
            {callError && (
                <div className="call-error-banner" onClick={() => setCallError("")}>
                    {callError}
                </div>
            )}

        </div>
    );
}