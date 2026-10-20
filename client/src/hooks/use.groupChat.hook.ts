import {useState, useEffect } from "react";
import { showApiError } from "../utils/showApiError";
import {socket} from '../utils/socket';
import { useRef } from "react";
import { notificationSound } from "../notification/notification.sound";
import axiosInstance from "../services/axiosInstance";

export interface ChatUser {
    _id: string;
    name: string;
    avatar?: string;
    status?: string;
}

export  function groupChatHook(senderId:string){
    const [users,setUsers]=useState<ChatUser[]>([]);
    const [allGroupsList,setAllGroupsList]=useState<any[]>([]);
    const [messages,setMessages]=useState<any[]>([]);
    const [groupId,setGroupIdState]=useState("");


       const groupIdRef = useRef("");
    const setGroupId = (id: string) => {
        groupIdRef.current = id;
        setGroupIdState(id);
    };



    const handleAllGroups=(data:any)=>{
        setAllGroupsList(data);
    }

    const handleAllPreviousMessage=(data:any)=>{
        setMessages(data);
}


    const handleReceiveMessage=(message:any)=>{
    const isInCurrentGroup=message.groupId.toString()===groupIdRef.current.toString();;
    if(isInCurrentGroup){
     setMessages(prev => [...prev, message]);
    }
    const msgSenderId = message.senderId?._id ? message.senderId._id.toString() : message.senderId?.toString();
    if(msgSenderId !== senderId && message?.notificationSound !== "8hrs" && message?.notificationSound!=="1week" && message?.notificationSound!=="always"){
        notificationSound();
    }
}


     const handleMsgDelivered=(updatedMessages:any)=>{
           setMessages(prev=>prev.map(msg=>{
        const updated=updatedMessages.find((m:any)=>m._id.toString()===msg._id.toString());
        return updated
            ? {...msg,isDelivered:updated.isDelivered,deliveredTo:updated.deliveredTo}
            : msg;
    }));
    }


    const handleGroupSeen=async(updatedMessages:any)=>{
         setMessages(prev=>prev.map(msg=>{
        const updated=updatedMessages.find((m:any)=>m._id.toString()===msg._id.toString());
        return updated?{...msg,isSeen:updated.isSeen}:msg;
    }));
    }


    const handleUpdateDeliveredTo = (updatedMsg: any) => {
    setMessages(prev => prev.map(msg =>
        msg._id.toString() === updatedMsg._id.toString()
            ?{...msg, isDelivered: updatedMsg.isDelivered,deliveredTo:updatedMsg.deliveredTo }
            :msg
    ));
};

const handleUpdateSeenBy = (updatedMsg: any) => {
    setMessages(prev => prev.map(msg =>
        msg._id.toString()===updatedMsg._id.toString()?{...msg, isSeen: updatedMsg.isSeen, seenBy: updatedMsg.seenBy }
        :msg
    ));
};


const handleDelete=(data:any[])=>{
    setMessages(data);
}


const handleDeleteMe=(data:{msgId:string,groupId:string})=>{
    if(data.groupId !== groupIdRef.current)return;
    setMessages(prev =>
        prev.filter(msg => msg._id.toString() !== data.msgId.toString())
    );
};

const handleGroupEditMessage=(message:any)=>{
    setMessages(prev=>prev.map(
        (msg)=>msg._id.toString()===message._id.toString()?{...msg,...message}:msg)
)};


//here we need to create new message and just like whats app to show parent reply
const handleParentReply=(message:any)=>{
    const isInCurrentGroup=message.groupId.toString()===groupIdRef.current.toString();;
        if(isInCurrentGroup){
         setMessages(prev => [...prev, message]);
        }
}


const handleEmojiOperation = (msg: any) => {
    setMessages((prev: any[]) =>
        prev.map((m) => (m._id === msg._id ? { ...m, reaction: msg.reaction } : m))
    );
};


 const clearChat=()=>{
    setMessages([]);
 }
   

    useEffect(()=>{
        try{
            const fetch=async()=>{
                const res=await axiosInstance.get("/chat/alluser");
                if(res.data.success){
                const allUsers = res.data.data.allUser;
                const otherUsers = allUsers.filter(
                (user: ChatUser) => user._id !== senderId
    );
    setUsers(otherUsers);
               }
            }
            fetch();
        }catch(err){
            showApiError(err);
        }


    //all groups in which user is joined
    socket.emit("user_joined_group",(senderId));
    socket.on("all_groups",handleAllGroups);
    socket.on("all_previous_message",handleAllPreviousMessage);
    socket.on("receive_group_message",handleReceiveMessage);
    socket.on("group_message_delivered",handleMsgDelivered);
    socket.on("group_message_seen",handleGroupSeen);
    socket.on("update_deliveredTo", handleUpdateDeliveredTo);
    socket.on("update_seenBy", handleUpdateSeenBy);
    socket.on("delete_message_db",handleDelete);
    socket.on("delete_by_me",handleDeleteMe);
    socket.on("group_message_edited",handleGroupEditMessage);
    socket.on("reply_on_parent_message",handleParentReply);
    socket.on("emoji_operation",handleEmojiOperation);
    socket.on("clear_all_chat",clearChat);
    


    return()=>{
        socket.off("all_groups",handleAllGroups);
        socket.off("all_previous_message",handleAllPreviousMessage);
        socket.off("receive_group_message",handleReceiveMessage);
        socket.off("group_message_delivered",handleMsgDelivered);
        socket.off("group_message_seen",handleGroupSeen);
        socket.off("update_deliveredTo", handleUpdateDeliveredTo);
        socket.off("update_seenBy", handleUpdateSeenBy);
        socket.off("delete_message_db",handleDelete);
        socket.off("delete_by_me",handleDeleteMe);
        socket.off("group_message_edited",handleGroupEditMessage);
        socket.off("reply_on_parent_message",handleParentReply);
        socket.off("emoji_operation",handleEmojiOperation);
        socket.off("clear_all_chat",clearChat);
    }
    },[]);
    
    
    const createGroup=(data:{groupName:string,senderId:string,peoplesId:string[]})=>{
        socket.emit("create_group",(data));
    }
    const sendMessage=(data:{_id:string,senderId:string,message:string,messageType:string})=>{
        if(!data.senderId)return;
        socket.emit("send_group_message",(data));
    }

    const handleDeleteFromEveryone=(data:{_id:string,msgId:string,senderId:string})=>{
        socket.emit("delete_grp_msg_everyone",(data));
    }


    const handelDeleteFromMy=(data:{_id:string,msgId:string,senderId:string})=>{
        socket.emit("delete_from_my_device",(data));
    }


    const handleEditMessage=(data:{_id:string,msgId:string,message:string,senderId:string})=>{
        socket.emit("edit_group_msg",(data));
    }

    const messageInfo=(data:{_id:string,msgId:string,senderId:string})=>{
        socket.emit("msg_info",data);
    }


    const groupEmoji=(data:{_id:string,msgId:string,senderId:string,emoji:string})=>{
        socket.emit("group_emoji",(data));
    }


    const groupFile=(data:{_id:string,senderId:string,message:string,messageType:string,
        fileUrl:string,mimetype:string,sizeInKb:number,sizeInMb:number,
        filename:string,orignalname:string
    })=>{
        socket.emit("send_group_message",(data));
    }



    const clearGroupChatUser=(data:{_id:string,senderId:string})=>{
        socket.emit("clear_user_group_chat",(data));
    }


    const checkIsCreator=async(data:{_id:string,senderId:string})=>{
        socket.emit("isCreator",(data));
    }


    const deleteGroup=async(data:{_id:string,senderId:string})=>{
        socket.emit("delete_group",data);
    }


    const exitGroup=async(data:{_id:string,senderId:string})=>{
        socket.emit("exit_and_delete",(data));
    }

    
    const exitThisGroup=async(data:{_id:string,senderId:string})=>{
        socket.emit("exit_this_group",(data));
    }
    
    


    return {
    users,
    createGroup,
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
};
}