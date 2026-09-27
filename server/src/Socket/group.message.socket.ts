    import {Socket,Server} from 'socket.io';
    import { addGroupMembers, addGroupMembersPermission, checkGroupExist, createGroup,currentGroups,deleteGroup,exitAndDeleteGroup,groups, isGroupMember, LeaveGroup, manageAdmin, removeMembers, removeMembersPermission } from '../controllers/group.management.controller';
    import { 
        allMedia,
        allDocs,
        clearChat,
        createMessage,
        deleteFromMe,
        deleteMessageFromEveryone,
        delieveredTo, 
        editGroupMessage, 
        emitMessageInGroup, 
        emoji, 
        messageInfo, 
        replyToParent, 
        seenByy, 
        showAllMessage,
        allLinks,
        muteNotificattion,
        changedMuteNotificationSetting,
        canChange,
        getDuationgMessage,
        changeGroupDisappearingMessageSetting,
        allPendingMessage,
        clearSomePendingMessage
    } from '../controllers/group.message.controller';
    import { checkChatLocked, getData, updateGroupSettings } from '../controllers/group.admin.controller';
import { groupCreator } from '../controllers/group.admin.controller';
import { AllMembers, changeName, groupImage, profilePermission } from '../controllers/group.info.controller';
import { forward_messages } from '../controllers/messagesForward.controller';
import { allGroupsUserJoined } from '../controllers/group.lastMessage.controller';


    export const groupChat=async(socket:Socket,users:{[key:string]:string},io:Server,activeChats:Record<string,string>,activeGroupChats:Record<string,string>)=>{
        try{
            //in this we return all the groups in which user is joined
            socket.on("user_joined_group",async(senderId:string)=>{
                try{
                    const allGroups=await groups({senderId});
                    socket.emit("all_groups",(allGroups));
                }catch(err){
                    const error=err instanceof Error?err.message:"Unknown Error";
                    socket.emit("err_msg",error);
                }
            });
            socket.on("create_group",async(data)=>{
            const group=await createGroup(data,socket,io,users);
            //here we will loop and emit update chat list 
            });





            //message part
            socket.on("previousMessage",async(data)=>{
            const allMessage=await showAllMessage(data);
            socket.emit("all_previous_message",(allMessage));
            });



            

            ///very important 
            socket.on("send_group_message",async(data)=>{
                try{
                const msgData=await createMessage(data);
                await emitMessageInGroup({_id:data._id,senderId:data.senderId},msgData,users,activeGroupChats,socket,io);
                }catch(err){
                    console.log(err);
                    const error=err instanceof Error?err.message:"Unknown Error";
                    socket.emit("error_msg",error);
                }
            });


            socket.on("add_to_delivered",async(data:{senderId:string})=>{
                await delieveredTo({senderId:data.senderId},users,socket,io,activeGroupChats);
            });

            socket.on("user_open_group_chat",async(data:{_id:string,senderId:string})=>{
                const message=await seenByy({_id:data._id,senderId:data.senderId},socket,io,users);
            });





            socket.on("delete_grp_msg_everyone",async(data:{_id:string,msgId:string,senderId:string})=>{
                try{
                await deleteMessageFromEveryone(data,socket,io,users,activeGroupChats);
                }catch(err){
                    console.log(err);
                    const error=err instanceof Error?err.message:"Unknown Error";
                    socket.emit("error_msg",error);
                }
            });







            socket.on("delete_from_my_device",async(data)=>{
                try{
                    await deleteFromMe(data);
                    const allMsg=await showAllMessage({_id:data._id,senderId:data.senderId});
                    socket.emit("delete_by_me",{msgId:data.msgId,groupId:data._id});
                }catch(err){
                    console.log(err);
                    const error=err instanceof Error?err.message:"Unknown Error";
                    socket.emit("error_msg",error);
                }
            });



            
            socket.on("edit_group_msg",async(data)=>{
                try{
                    await editGroupMessage(data,socket,io,users,activeGroupChats);
                }catch(err){
                    const error=err instanceof Error?err.message:"Unknown Error";
                    socket.emit("error_msg",error);
                }
            });

            
            socket.on("msg_info",async(data)=>{
                const msg=await messageInfo(data);
                socket.emit("msg_info_data",(msg));
            });


            socket.on("group_emoji",async(data)=>{
            const msg=await emoji(data,socket,io,users,activeGroupChats);
            });



            socket.on("clear_user_group_chat",async(data)=>{
                try{
                await clearChat(data);
                socket.emit("clear_all_chat");
                }catch(err){
                    const error=err instanceof Error?err.message:"Unknown Error";
                    socket.emit("error_message",error);
                }
            });



            


            //all media,links,docs
            socket.on("all_group_media",async(data:{_id:string})=>{
                try{
                const media=await allMedia(data._id);
                socket.emit("found_all_group_media",media);
                }catch(err){
                    const error=err instanceof Error?err.message:"Unknown Error";
                    socket.emit("error_msg",error);
                }
            });

            

            socket.on("all_group_docs",async(data:{_id:string,senderId:string})=>{
                try{
                const docs=await allDocs(data._id);
                socket.emit("get_all_group_docs",(docs));
                }catch(err){
                    const error=err instanceof Error?err.message:"Unknown Error";
                    socket.emit("error_msg",(error));
                }
            });



            socket.on("get_all_group_links",async(data:{_id:string,senderId:string})=>{
                try{
                    const links=await allLinks(data._id);
                    socket.emit("got_all_group_links",(links));
                }catch(err){
                    const error=err instanceof Error?err.message:"Unknown Error";
                    socket.emit("error_msg",(error));
                }
            });


            



            //mute notification
            socket.on("prev_mark_group_notification",async(data:{_id:string,senderId:string})=>{
                try{
                const duration=await muteNotificattion(data);
                socket.emit("set_prev_mark_group_notification",(duration));
                }catch(err){
                    const error=err instanceof Error?err.message:"Unknown Error";
                    socket.emit("error_msg",error);
                }
            });

            socket.on("change_group_notification",async(data)=>{
                try{
                const duration=await changedMuteNotificationSetting(data);
                socket.emit("group_duration_updated",(duration));
                }catch(err){
                    const error=err instanceof Error?err.message:"Unknown Error";
                    socket.emit("error_msg",error);
                }
            });





            //disappearing message
            socket.on("check_can_change",async(data)=>{
                try{
                    await canChange(data,socket,io,users);
                }catch(err){
                    const error=err instanceof Error?err.message:"Unknown Error";
                    socket.emit("error_msg",error);
                }
            });


            socket.on("current_group_disappearing_val",async(data)=>{
                try{
                   const duration=await getDuationgMessage(data);
                   socket.emit("group_disappearing_val",(duration));
                }catch(err){
                  const error=err instanceof Error?err.message:"Unknown Error";
                  socket.emit("error_msg",error);
                }
            });



            socket.on("set_group_disappearing_value",async(data)=>{
              const duration=await changeGroupDisappearingMessageSetting(data,socket,io,users,activeGroupChats);
              socket.emit("put_group_disappearing_value",(duration));
            });
            //disappearing message value end






            //admins work

            socket.on("isCreator",async(data)=>{
                const creator=await groupCreator(data);
                socket.emit("setCreator",(creator));
            });






            //delete group
            socket.on("delete_group",async(data)=>{
                await deleteGroup(data,socket,io,users,activeGroupChats);
            });



            socket.on("check_group_exist",async(data)=>{
                const existance=await checkGroupExist(data);
                socket.emit("group_status",(existance));
            });


            socket.on("exit_and_delete",async(data)=>{
                try{
                    await exitAndDeleteGroup(data);
                    //now chat list update
                    const allGroups=await groups({senderId:data.senderId});
                    socket.emit("all_groups",(allGroups));
                }catch(err){
                    const error=err instanceof Error?err.message:"Unknown Error";
                    socket.emit("error_msg",(error));
                }
            });




            //group profile part
             socket.on("can_change_group_name",async(data:{_id:string,senderId:string,name:string})=>{
                try{
               const group=await changeName(data,socket,io,users,activeGroupChats);
                //this is for chat list updayte name
                for(let i=0;i<group.peoplesId.length;i++){
                    const id=group.peoplesId[i].toString();
                    const receiverSocketId=users[id];
                    if(id===data.senderId)continue;
                    if(receiverSocketId){
                        const receiverChatlist=await groups({senderId:id});
                        io.to(receiverSocketId).emit("all_groups",(receiverChatlist));
                    }
                }
                const senderChatlist=await groups({senderId:data.senderId});
                socket.emit("all_groups",(senderChatlist));
                }catch(err){
                    const error=err instanceof Error?err.message:"Unknown Error";
                    socket.emit("error_msg",(error));
                }
            });




             //can change group image
                socket.on("can_change_group_image",async(data:{_id:string,senderId:string,message:string,mimetype:string})=>{
                    try{
                    const group=await groupImage(data,socket,io,users,activeGroupChats);
                    const chatlist=await groups({senderId:data.senderId});
                    for(let i=0;i<group.peoplesId.length;i++){
                        const id=group.peoplesId[i].toString();
                        if(id==data.senderId.toString())continue;
                        const receiverId=users[id];
                        if(receiverId){
                            const receiverChatlist=await groups({senderId:id});
                            io.to(receiverId).emit("all_groups",(receiverChatlist));
                        }
                    }
                    const senderChatlist=await groups({senderId:data.senderId});
                    socket.emit("all_groups",(senderChatlist));
                    }catch(err){
                        const error=err instanceof Error?err.message:"Unknown Error";
                        socket.emit("error_msg",(error));
                    }
                });



             socket.on("all_members",async(data:{_id:string})=>{
                try{
                  const members=await AllMembers({_id:data._id});
                  socket.emit("all_group_members",(members));
                }catch(err){
                    const error=err instanceof Error?err.message:"Unknown Error";
                    socket.emit("error_msg",(error));
                }
             });


             socket.on("profile_permission",async(data)=>{
                try{
                   const result=await profilePermission(data);
                   socket.emit("result",(result));
                }catch(err){
                    throw err;
                }
             });




             socket.on("exit_this_group",async(data:{_id:string,senderId:string})=>{
                try{
                    await LeaveGroup(data,socket,io,users);
                    const chatList=await groups({senderId:data.senderId});
                    socket.emit("all_groups",(chatList));
                }catch(err){
                    const error=err instanceof Error?err.message:"Unknown Error";
                    socket.emit("error_msg",(error));
                }
             });




             socket.on("check_is_a_member",async(data)=>{
                try{
                  const user=await isGroupMember(data);
                  socket.emit("is_present_in_group",user);
                }catch(err){
                    const error=err instanceof Error?err.message:"Unknown Error";
                    socket.emit("error_msg",error);
                }
             });












             //add group members

             socket.on("add_group_members",async(data)=>{
                try{
                    await addGroupMembersPermission(data,socket);
                }catch(err){
                    throw err;
                }
             });


             socket.on("add_new_group_members",async(data)=>{
                try{
                    await addGroupMembers(data,socket,io,users);
                     const members=await AllMembers({_id:data._id});
                    socket.emit("all_group_members",(members));
                    
                }catch(err){
                    const error=err instanceof Error?err.message:"Unknown Error";
                    socket.emit("error_msg",(error));
                }
             });






             //remove group members
             socket.on("group_members_remove_permission",async(data)=>{
                try{
                    await removeMembersPermission(data,socket);
                }catch(err){
                    const error=err instanceof Error?err.message:"Unknown Error";
                    socket.emit("error_msg",(error));
                }
             });


             socket.on("removing_group_members",async(data)=>{
                await removeMembers(data,socket,io,users);
             });






        
             //make and remove admin


             socket.on("manage_group_admins",async(data)=>{
                try{
                    await manageAdmin(data,socket,io,users);
                }catch(err){
                    const error=err instanceof Error?err.message:"Unknown Error";
                    socket.emit("error_msg",(error));
                }
             });







             //group settings
             socket.on("get_group_settings",async(data)=>{
                try{
                    await getData(data,socket);
                }catch(err){
                    const error=err instanceof Error?err.message:"Unknown Error";
                    socket.emit("error_msg",(error));
                }
             });




             socket.on("update_group_settings",async(data)=>{
                try{
                    await updateGroupSettings(data,socket,io,users);
                }catch(err){
                    const error=err instanceof Error?err.message:"Unknown Error";
                    socket.emit("error_msg",(error));
                }
             });




             socket.on("is_chat_locked",async(data)=>{
                try{
                    await checkChatLocked(data,socket);
                }catch(err){
                    const error=err instanceof Error?err.message:"Unkonwon Error";
                    socket.emit("error_msg",(error));
                }
             });





             


             //forward messages 


             socket.on("forward_messages",async(data)=>{
                try{
                    console.log(data);
                    await forward_messages(data,socket,io,users,activeChats,activeGroupChats);
                }catch(err){
                    const error=err instanceof Error?err.message:"Unknown Error";
                    socket.emit("error_msg",(error));
                }
             });

             socket.on("all_groups_of_receiver",async(senderId:string)=>{
                try{
                    
                }catch(err){
                    throw err;
                }
             });


             socket.on("current_groups",async(data:{senderId:string})=>{
                try{
                  const members=await currentGroups({senderId:data.senderId});
                    socket.emit("current_groups_members",(members));
                }catch(err){
                    const error=err instanceof Error?err.message:"Unknown Error";
                    socket.emit("error_msg",error);
                }
             });


             
             socket.on("get_group_last_message_stored",async(senderId:string)=>{
                try{
                    await allGroupsUserJoined(senderId,socket);
                }catch(err){
                    const error=err instanceof Error?err.message:"Unknown Error";
                    socket.emit("error_msg",(error));
                }
             });





             socket.on("all_pending_messages",async(senderId:string)=>{
                try{
                    await allPendingMessage(senderId,socket);
                }catch(err){
                    throw err;
                }
             });


             socket.on("clear_all_pending_messages",async(data:{_id:string,senderId:string})=>{
                try{
                    await clearSomePendingMessage({_id:data._id,senderId:data.senderId},socket,io);
                }catch(err){
                    throw err;
                }
             });
        }catch(err){
            const error=err instanceof Error?err.message:"Unknown Error";
            socket.emit("error_msg",error);
        }
    } 