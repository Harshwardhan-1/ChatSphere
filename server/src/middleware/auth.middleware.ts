import {Request,Response,NextFunction} from 'express';
import { userpayload } from "../types/auth.Requests.types";
import { authRequest } from "../types/auth.Requests.types";
import { JWT_SECRET } from '../configs/env.config';
import jwt from 'jsonwebtoken';
import { User } from '../models/user.model';

const extractToken=(req:authRequest):string | null=>{
     const authHeader=req.headers?.authorization;
     if(authHeader && authHeader.startsWith("Bearer ")){
        //authHeader.substring(7) means remoce first seven of it
        return authHeader.substring(7);
     }
     return null;
}


export const isUserLoggedIn=async(req:authRequest,res:Response,next:NextFunction)=>{
    try{
        const token=extractToken(req);
        if(!token){
            return res.status(401).json({
                success:false,
                message:"token not found",
            });
        }
        //after verificaton it the data that we set in token is easily identifiable by decodeddata
        const decodedData=jwt.verify(token,JWT_SECRET as string)as userpayload;
        const user=await User.findOne({email:decodedData.email}).select("-password");
        if(!user){
            return res.status(404).json({
                success:false,
                message:"please do a sign up first",
            });
        }
        req.user=user;
        next();
    }catch(err){
        next(err);
    }
}






export const isAdminLoggedIn=async(req:authRequest,res:Response,next:NextFunction)=>{
    try{
        const token=extractToken(req);
        if(!token){
            return res.status(401).json({
                success:false,
                message:"token not found",
            });
        }
        const decodedData=jwt.verify(token,JWT_SECRET as string) as userpayload;
        const user=await User.findOne({email:decodedData.email}).select("-password");
        if(!user || user.role!== 'ADMIN'){
            return res.status(403).json({
                success:false,
                message:"Access Denied",
            });
        }
        req.user=user;
        next();
    }catch(err){
        next(err);
    }
}