import { Socket,Server } from "socket.io";
import { allPinnedMessage, check_favourites, clear_chat, mark_as_favourites, pin_message, unpinned_message } from "../controllers/profile.controller";
import { updateLastMessage } from "../controllers/last.message.controller";
import { get_last_message } from "../controllers/last.message.controller";
import { alldocs,allLinks,disappearingMessage,media } from "../controllers/profile.controller";
import { currentDisapperingVal } from "../controllers/profile.controller";
import { PersonalChat } from "../controllers/chat.controller";
import { changeNotificationSetting, prev_mark_notification } from "../controllers/notification.controller";
import { unmarked_as_favourites } from "../controllers/profile.controller";
import { all_favourites } from "../controllers/profile.controller";


export const profileSocket=(socket:Socket,users:{[key:string]:string},io:Server)=>{
try{
    //clear chat
    socket.on("clear_chat",async(data:{senderId:string,receiverId:string})=>{
        await clear_chat({senderId:data.senderId,receiverId:data.receiverId});
        socket.emit("chat_cleared",({senderId:data.senderId,receiverId:data.receiverId}));
        //here update last message
        await updateLastMessage({senderId:data.senderId,receiverId:data.receiverId});
        //getLastMessage
        const allLastMessage=await get_last_message({userId:data.senderId});
         socket.emit("all_last_message",allLastMessage);
    });

    const timer=(duration:string,message:string)=>{
        if(duration==="off"){
              return  message="turned off disappearing messages";
            }else if(duration==="24hrs"){
               return message=`turned on disappear messages New message will disappear from this chat ${duration}  after they are sent`;
            }else{
            return message=`turned on disappear messages New message will disappear from this chat ${duration}  after they are sent`;    
            }
    }

    //disappering message
    socket.on("disappear_message",async(data:{senderId:string,receiverId:string,duration:string})=>{
        try{
         const disappearMsg=await disappearingMessage({senderId:data.senderId,receiverId:data.receiverId,duration:data.duration});
         if(disappearMsg){
            let message="";
           message=timer(data.duration,message);
            const savedMessage=await PersonalChat({senderId:data.senderId,receiverId:data.receiverId,msg:message,messageType:"system"});
            if(savedMessage){
                const receiverSocketId=users[data.receiverId];
                if(receiverSocketId){
                    io.to(receiverSocketId).emit("disappear_message",{senderId:data.senderId,receiverId:data.receiverId,msg:`They ${savedMessage.message}`,messageType:"system",createdAt:savedMessage.createdAt,updatedAt:savedMessage.updatedAt});
                }
                socket.emit("disappear_message",{senderId:data.senderId,receiverId:data.receiverId,msg:`You ${savedMessage.message}`,messageType:"system",createdAt:savedMessage.createdAt,updatedAt:savedMessage.updatedAt});
            }
        }
        }catch(err){
         const error=err instanceof Error ?err.message:"Unknown Error"
         socket.emit("error_msg",error);
        }
    });


    socket.on("current_disappearing_val",async(data:{senderId:string,receiverId:string})=>{
        try{
      const duration=await currentDisapperingVal({senderId:data.senderId,receiverId:data.receiverId});
      socket.emit("disappearing_val",(duration));
        }catch(err){
            const error=err instanceof Error ?err.message:"Unknown Error"
           socket.emit("error_msg",error);
        }
    });



    //notification
    socket.on("prev_mark_notification",async(data:{senderId:string,receiverId:string})=>{
        try{
          const prev_duration=await prev_mark_notification({senderId:data.senderId,receiverId:data.receiverId});
          const isSenderOnline=users[data.senderId];
          if(isSenderOnline){
            const duration=prev_duration;
            socket.emit("already_mark_notification",(duration));
          }
        }catch(err){
            const error=err instanceof Error ?err.message:"Unknown Error"
             socket.emit("error_msg",error);
        }
    });


    socket.on("change_notification",async(data:{senderId:string,receiverId:string,duration:string})=>{
        try{
           await changeNotificationSetting({senderId:data.senderId,receiverId:data.receiverId,duration:data.duration});
           const duration=data.duration;
           socket.emit("notification_change",(duration));
        }catch(err){
            const error=err instanceof Error ?err.message:"Unknown Error";
            socket.emit("error_msg",error);
        }
    });
    socket.on("all_media",async(data:{senderId:string,receiverId:string})=>{
        try{
         const allMedia=await media({senderId:data.senderId,receiverId:data.receiverId});
         if(allMedia){
            socket.emit("found_allMedia",(allMedia));
         }
        }catch(err){
            const error=err instanceof Error?err.message:"Unknown Error";
            socket.emit("error_msg",error);
        }
    });

    socket.on("all_docs",async(data:{senderId:string,receiverId:string})=>{
        try{
          const allDocs=await alldocs({senderId:data.senderId,receiverId:data.receiverId});
          socket.emit("get_all_docs",(allDocs));
        }catch(err){
             const error=err instanceof Error?err.message:"Unknown Error";
             socket.emit("error_msg",error);
        }
    });

    socket.on("get_all_links",async(data:{senderId:string,receiverId:string})=>{
        try{
            const links=await allLinks({senderId:data.senderId,receiverId:data.receiverId});
            const senderId=users[data.senderId];
            if(senderId){
                socket.emit("all_links",links);
            }
        }catch(err){
            const error=err instanceof Error?err.message:"Unknown Error";
            socket.emit("error_msg",error);
        }
    });

    socket.on("check_favourites",async(data:{senderId:string,receiverId:string})=>{
        try{
         const favourites=await check_favourites({senderId:data.senderId,receiverId:data.receiverId});
         socket.emit("checked_as_favourites",(favourites));
        }catch(err){
            const error=err instanceof Error?err.message:"Unknown Error";
            socket.emit("error_msg",error);
        }
    });


    socket.on("mark_as_favourites",async(data:{senderId:string,receiverId:string})=>{
        try{
            await mark_as_favourites({senderId:data.senderId,receiverId:data.receiverId});
            socket.emit("toggle_favourites",("Remove From Favourites"));
        }catch(err){
            const error=err instanceof Error?err.message:"Unknown Error";
            socket.emit("error_msg",error);
        }
    });

    socket.on("unmark_as_favourites",async(data:{senderId:string,receiverId:string})=>{
        try{
            await unmarked_as_favourites({senderId:data.senderId,receiverId:data.receiverId});
            socket.emit("toggle_favourites",("Add To Favourites"));
        }catch(err){
            const error=err instanceof Error?err.message:"Unknown Error";
            socket.emit("error_msg",error);
        }
    });
    
    socket.on("get_all_favourites",async(data:{userId:string})=>{
    try{
        const ids=await all_favourites({senderId:data.userId});
        socket.emit("all_favourites",ids);
    }catch(err){
        const error=err instanceof Error?err.message:"Unknown Error";
        socket.emit("error_msg",error);
    }
});

    //pin message
    socket.on("pin_message",async(data:{_id:string,senderId:string,receiverId:string})=>{
        try{
          const result=await pin_message({_id:data._id,senderId:data.senderId,receiverId:data.receiverId});
          
        const chatListPayload = {
            senderId: result.systemMessage.senderId,
            receiverId: result.systemMessage.receiverId,
            lastmessage: result.systemMessage.message,
            messageType: result.systemMessage.messageType,
            createdAt: result.systemMessage.createdAt,
            updatedAt: result.systemMessage.updatedAt,
        };

          socket.emit("update_pin_message",result.updateMessage);
           socket.emit("receive_message", result.systemMessage);
           socket.emit("chat_list_update",chatListPayload);
           
           const receiverSocketId=users[data.receiverId];
           if(receiverSocketId){
            io.to(receiverSocketId).emit("update_pin_message",result.updateMessage);
            io.to(receiverSocketId).emit("receive_message",result.systemMessage);
            io.to(receiverSocketId).emit("chat_list_update",chatListPayload);
           }
        const message=await allPinnedMessage({senderId:data.senderId,receiverId:data.receiverId});
       socket.emit("all_pinned",(message));
       if(receiverSocketId){
        io.to(receiverSocketId).emit("all_pinned",(message));
       }
        }catch(err){
            const error=err instanceof Error?err.message:"Unknown Error";
            socket.emit("error_msg",error);
        }
    });





    socket.on("unpinned_message",async(data:{_id:string,senderId:string,receiverId:string})=>{
        try{
          const savedMessage=await unpinned_message({_id:data._id,senderId:data.senderId,receiverId:data.receiverId});
          socket.emit("update_pin_message",(savedMessage));
          //this is for direct update for pin
        const message=await allPinnedMessage({senderId:data.senderId,receiverId:data.receiverId});
        socket.emit("all_pinned",(message));        
       const receiverSocketId=users[data.receiverId]; 
       if(receiverSocketId){
        io.to(receiverSocketId).emit("update_pin_message",(savedMessage));
        io.to(receiverSocketId).emit("all_pinned",(message));
       }
        }catch(err){
            const error=err instanceof Error?err.message:"Unknown Error";
            socket.emit("error_msg",error);
        }
    });

    


    socket.on("allPinnedMessage",async(data:{senderId:string,receiverId:string})=>{
       const message=await allPinnedMessage({senderId:data.senderId,receiverId:data.receiverId});
       socket.emit("all_pinned",(message));
    });
}catch(err){
    const error=err instanceof Error ?err.message:"Unknown Error"
     socket.emit("error_msg",error);
}
}