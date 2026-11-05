import mongoose from 'mongoose';
import { Socket,Server } from 'socket.io';
import { aiChat } from '../models/ai.chat.model';
import { aiChatList } from '../models/ai.chat.model';
import { generateChatTitle } from '../prompts/generate.title.prompt';
import { chatWithAI } from '../prompts/chat.prompt';
import { messageInfo } from './group.message.controller';




export const createChatListMessage=async(data:{senderId:string,message:string},socket:Socket)=>{
    try{
       let msg=(await generateChatTitle(data.message))?.trim();
       if(!msg || /^new chat$/i.test(msg)){
           const text=data.message.trim();
           msg=text.length>40 ? text.slice(0,40)+"…" : text;
       }
       const create=await aiChatList.create({
        userId:data.senderId,
        message:msg,
       });
       if(!create){
        throw new Error("failed to create msg");
       }
       socket.emit("prompt_chat_list_msg",(create));
    }catch(err){
        throw err;
    }
}


export const create=async(data:{senderId:string,chatId:string,message:string},socket:Socket)=>{
    try{
        if(data.message.trim().length===0){
            throw new Error("message field cannot be empty");
        }
        const chatItem=await aiChatList.findOneAndUpdate(
            {_id:data.chatId,userId:data.senderId},
            {$set:{updatedAt:new Date()}},
            {returnDocument:"after"},
        );
        let createMsg=await aiChat.create({
            senderId:data.senderId,
            chatId:data.chatId,
            message:data.message,
            role:"user",
        });
        if(!createMsg){
            throw new Error("failed to create Msg");
        }
        socket.emit("msg_created",(createMsg));

        socket.emit("chat_list_moved_up",(chatItem));

        const aiMessage=await chatWithAI(data.message);
        createMsg=await aiChat.create({
            senderId:data.senderId,
            chatId:data.chatId,
            message:aiMessage,
            role:"ai",
        });
        if(!createMsg){
            throw new Error("failed to create ai Message");
        }
        socket.emit("msg_created",(createMsg));
    }catch(err){
        throw err;
    }
}












export const deleteMsg=async(data:{senderId:string,msgId:string},socket:Socket)=>{
    try{
        const msg=await aiChat.findById(data.msgId);
        if(!msg){
            throw new Error("msg not found");
        }
        if(msg.senderId.toString()!==data.senderId.toString()){
            throw new Error("msg not found");
        }
        await msg.deleteOne();
        socket.emit("prompt_msg_deleted",(data));
    }catch(err){
        throw err;
    }
}







//here we will delete on chat list that user clicks to delete
//if user on same chat we move user to one above chat
export const deleteChatListItem=async(data:{senderId:string,chatlistId:string},socket:Socket)=>{
    try{
        const cl=await aiChatList.findById(data.chatlistId);
        if(!cl){
            throw new Error("chat list not found");
        }
        if(cl.userId.toString()!==data.senderId.toString()){
            throw new Error("don't have access to delete this chat list");
        }
        await cl.deleteOne();
        socket.emit("chat_list_item_deleted",(data));
        await aiChat.deleteMany({chatId:data.chatlistId});
    }catch(err){
        throw err;
    }
}










export const renameChatListItem=async(data:{senderId:string,chatListId:string,name:string},socket:Socket)=>{
    try{
        const cl=await aiChatList.findById(data.chatListId);
        if(!cl){
            throw new Error("cl not found");
        }
        if(cl.userId.toString()!==data.senderId.toString()){
            throw new Error("don't have access to rename the chatlist item");
        }
        cl.message=data.name;
        await cl.save();
        socket.emit("chat_list_item_renamed",(data));
    }catch(err){
        throw err;
    }
}










export const reaction=async(data:{senderId:string,msgId:string,emoji:string},socket:Socket)=>{
    try{
        const msg=await aiChat.findById(data.msgId);
        if(!msg){
            throw new Error("msg not found");
        }
        if(msg.emoji=== ""){
            msg.emoji=data.emoji;
        }else if(msg.emoji===data.emoji){
            msg.emoji="";
        }else{
            msg.emoji=data.emoji;
        }
        await msg.save();
        socket.emit("ai_chat_reaction",(msg));
    }catch(err){
        throw err;
    }
}










export const allMsg=async(data:{senderId:string,chatId:string},socket:Socket)=>{
    try{
        const allMsg=await aiChat.find({chatId:data.chatId}).sort({createdAt:1});
        socket.emit("all_chat_message",(allMsg));
    }catch(err){
        throw err;
    }
}




export const allChatList=async(data:{senderId:string},socket:Socket)=>{
    try{
        const allList=await aiChatList.find({userId:data.senderId}).sort({updatedAt:-1});
        socket.emit("all_chat_list_title",(allList));
    }catch(err){
        throw err;
    }
}