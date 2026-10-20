import { useState,useEffect } from "react";
import { socket } from "../utils/socket";
import { chatService } from "../services/chat.service";
import { showApiError } from "../utils/showApiError";
import { userPresence } from "../services/user.presence.service";
import { notificationSound } from "../notification/notification.sound";


export interface MessageItem{
    _id:string,
    senderId:string,
    receiverId:string,
    message:string,
    messageType:string,
    mimetype:string,
    filename:string,
    sizeInKb:number,
    sizeInMb:number,
    IsSend:boolean,
    isDelivered:boolean,
    isSeen:boolean,
    isEdited:boolean,
    createdAt:Date,
    updatedAt:Date,
    isPinned:boolean,
    docsId?:string,
    reaction:{
        userId:string,
        emoji:string,
    }[],
}
export interface Message{
    _id:string,
    senderId:string,
    receiverId:string,
    message:string,
     messageType:string,
    mimetype:string,
    filename:string,
    sizeInKb:number,
    sizeInMb:number,
    IsSend:boolean,
    isDelivered:boolean,
    isSeen:boolean,
    isEdited:boolean,
    createdAt:Date,
    updatedAt:Date,
    notificationSound?:string | null,
    isPinned:boolean,
    docsId?:string,
    reaction:{
        userId:string,
        emoji:string,
    }[],
}
interface error{
    msg:string,
}

interface handleData{
    userId:string,
    Date:string,
    createdAt:string,
    updatedAt:string,
}

interface User {
    _id: string;
    name: string;
    email: string;
}

interface CurrentUser {
    loginUserId: string;
    email: string;
}


export function ChatTalk(data: User, data2: CurrentUser) {
    const [allmessages,setAllMessages]=useState<MessageItem[]>([]);
    const [status,setStatus]=useState("offline");
    const [presence,setPresence]=useState<string>("");
    const senderId = data2.loginUserId;
    const receiverId = data._id;
    const locadata = data;

    const handleError=(err:error)=>{
        showApiError(err);
    }
    
    const handleStatus=(data:{userId:string,status:string})=>{
        if(data.userId=== locadata?._id){
            setStatus(data.status);
        }
    }


    const handlePresence=(data:handleData)=>{
        if(!data.updatedAt)return;
        setPresence(userPresence(data.updatedAt));
    }

    const handleDeleteEveryone=async(data:{messageId:string,senderId:string,receiverId:string})=>{
        setAllMessages(prev=>prev.filter(msg=>msg._id!==data.messageId));
    }

    const handleDelete=async(data:{messageId:string,senderId:string,receiverId:string})=>{
          setAllMessages(prev=>prev.filter(msg=>msg._id !== data.messageId));

    }

    const handleEdit=(data:{messageId:string,senderId:string,receiverId:string,msg:string})=>{
        setAllMessages(prev=>prev.map(msg=>msg._id === data.messageId? { ...msg, message: data.msg,isEdited:true }:msg)
    );}


    const handleIsSend=(data:{messageId:string,senderId:string,receiverId:string,isSend:boolean})=>{
        setAllMessages(prev=>prev.map(msg=>msg._id===data.messageId?{...msg,IsSend:data.isSend}:msg));
    }

    const handleIsDelivered=(data:{messageId:string,senderId:string,receiverId:string,isDelivered:boolean})=>{
        setAllMessages(prev=>prev.map(msg=>msg._id===data.messageId?{...msg,isDelivered:data.isDelivered}:msg));
    }


    const handleIsSeen=(data:{messageId:string,senderId:string,receiverId:string,isSeen:boolean})=>{
        setAllMessages(prev=>prev.map(msg=>msg._id===data.messageId?{...msg,isSeen:data.isSeen}:msg));
    }


    const handleIsMarkSeen=(data:{messageId:string[],isSeen:boolean})=>{
      setAllMessages(prev=>prev.map(msg=>data.messageId.includes(msg._id)?{...msg,isSeen:data.isSeen}:msg));
    }

    
    const handleIsDeliveredMark=(data:{messageIds:string[],isDeliverd:boolean})=>{
        setAllMessages(prev=>prev.map(msg=>data.messageIds.includes(msg._id)?{...msg, isDelivered: data.isDeliverd}:msg));
    }


    const handleDisappearMsg=(data:{senderId:string,receiverId:string,msg:string,messageType:string
        createdAt:Date,updatedAt:Date,
    })=>{
        const isCurrentChat =(data.senderId === senderId && data.receiverId === receiverId) ||
        (data.senderId === receiverId && data.receiverId === senderId);
        if(isCurrentChat){
        const newMessage: any = { 
            _id: Date.now().toString(),
             senderId: data.senderId, 
             receiverId: data.receiverId,
             message: data.msg, messageType: 
             data.messageType,
            createdAt: new Date(data.createdAt),
            updatedAt: new Date(data.updatedAt),
      }
      setAllMessages(prev => [...prev, newMessage]);
   }
}

const handleUpdatePinMessage=(message:Message)=>{
    const isCurrentChat =(message.senderId === senderId && message.receiverId === receiverId) ||
        (message.senderId === receiverId && message.receiverId === senderId);
        if(isCurrentChat){
            setAllMessages(prev=>prev.map(msg=>msg._id===message._id?message:msg));
        }
}


  const handleEmojiUpdate=async(message:Message)=>{
         const isCurrentChat =(message.senderId === senderId && message.receiverId === receiverId) ||
        (message.senderId === receiverId && message.receiverId === senderId);
        if(isCurrentChat){
            setAllMessages(prev=>prev.map(msg=>msg._id===message._id?message:msg));
        }
    }

    // NAYA — docs create hone par jo message chat me aata hai, usko yaha handle karte hain
    const handleReceiveDocs=(message:MessageItem)=>{
        const isCurrentChat=(message.senderId===senderId && message.receiverId===receiverId)||
            (message.senderId===receiverId && message.receiverId===senderId);
        if(isCurrentChat){
            setAllMessages(prev=>[...prev,message]);
        }
    }
    

 
    useEffect(()=>{
        //calling old message
        const loadMessage=async()=>{
            if(!senderId || !receiverId)return;
            const data=await chatService.prevMsg(senderId,receiverId);
            if(data){
                setAllMessages(data);
            }
        };
        loadMessage();
        //end of fetch of old message
        socket.on("receive_message", (message: Message) => {
          const isCurrentChat =(message.senderId === senderId && message.receiverId === receiverId) ||
        (message.senderId === receiverId && message.receiverId === senderId);
        if(isCurrentChat) {
            setAllMessages(prev => [...prev, message]);
        }
         if(message.senderId!==data2.loginUserId  && message?.notificationSound=== "off"){
                notificationSound();
        }
});
        socket.on('error_msg',handleError);
        socket.on("trigger_status",handleStatus);
        socket.emit("user_last_visit",(locadata?._id));
        socket.on("user_presence",handlePresence);
        socket.on("deleted_everyone",handleDeleteEveryone);
        socket.on("delete",handleDelete);
        socket.on("message_edited",handleEdit);
        socket.on("isSend",handleIsSend);
        socket.on("isDelivered",handleIsDelivered);
        socket.on("real_time_isSeen",handleIsSeen);
        socket.on("isSeenStatus",handleIsMarkSeen);
        socket.on("isDelivered_mark",handleIsDeliveredMark);
        socket.on("disappear_message",handleDisappearMsg);
        socket.on("update_pin_message",handleUpdatePinMessage);
        socket.on("emoji_updated",handleEmojiUpdate);
        // NAYA — docs backend inhi 3 alag events se bhejta hai
        socket.on("receive_docs_message",handleReceiveDocs);
        socket.on("real_time_docs_isSeen",handleIsSeen);
        socket.on("isSendDocs",handleIsSend);
        socket.on("chat_cleared",(data:{senderId:string,receiverId:string})=>{
            loadMessage();
        });
        return()=>{
         socket.off("receive_message");
         socket.off("trigger_status",handleStatus);
         socket.off("user_presence",handlePresence);
         socket.off("user_last_visit");
         socket.off("error_msg",handleError);
         socket.off("deleted_everyone",handleDeleteEveryone);
         socket.off("delete",handleDelete);
         socket.off("message_edited",handleEdit);
         socket.off("isSend",handleIsSend);
         socket.off("isDelivered",handleIsDelivered);
         socket.off("real_time_isSeen",handleIsSeen);
         socket.off("isSeenStatus",handleIsMarkSeen);
         socket.off("isDelivered_mark",handleIsDeliveredMark);
         socket.off("chat_cleared");
         socket.off("disappear_message",handleDisappearMsg);
         socket.off("update_pin_message",handleUpdatePinMessage);
        socket.off("emoji_updated",handleEmojiUpdate);
        // NAYA
        socket.off("receive_docs_message",handleReceiveDocs);
        socket.off("real_time_docs_isSeen",handleIsSeen);
        socket.off("isSendDocs",handleIsSend);

        };
    },[locadata?._id,senderId,receiverId]);



    const userMessage=(data:{senderId:string,receiverId:string,msg:string,messageType:string})=>{
        if(!data.senderId || !data.receiverId){
            alert("login again");
            return;
        }
        socket.emit("send_message",data);
    };

    const userfileData=(data:{senderId:string,receiverId:string,msg:string,messageType:string,mimetype:string,filename:string,sizeInKb:number,sizeInMb:number,originalname:string})=>{
        if(!data.senderId || !data.receiverId){
            alert('login again');
            return;
        }
        socket.emit("send_message",data);
    };


    const userpresence=(receiverId:string)=>{
        socket.emit("check_status",receiverId);
    }
    const activeChats=(data:{senderId:string,receiverId:string})=>{
        socket.emit("active_user",{senderId:data.senderId,receiverId:data.receiverId});
    }
    const notActiveChats=(data:{senderId:string,receiverId:string})=>{
        socket.emit("not_active_user",{senderId:data.senderId,receiverId:data.receiverId});
    }
    const user_open_chat=(data:{senderId:string,receiverId:string})=>{
        socket.emit("user_open_chat",data);
    }

 
    return {userMessage,allmessages,userpresence,status,presence,activeChats,notActiveChats,user_open_chat,userfileData};
}