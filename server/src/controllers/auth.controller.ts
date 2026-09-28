import {Request,Response,NextFunction} from 'express';
import { User } from '../models/user.model';
import bcrypt from 'bcrypt';
import { JWT_SECRET,JWT_EXPIRES_IN,GOOGLE_CLIENT_ID } from '../configs/env.config';
import jwt,{Secret,SignOptions} from 'jsonwebtoken';
import { authRequest } from '../types/auth.Requests.types';
import { OAuth2Client,TokenPayload } from 'google-auth-library';

//it tells the type of it
const secret:Secret=JWT_SECRET!;
const options:SignOptions={
    //we use square because to identify the type we use [] squares bracket
    expiresIn:JWT_EXPIRES_IN! as SignOptions['expiresIn']
}

const googleClient=new OAuth2Client(GOOGLE_CLIENT_ID);

const generateToken=(userId:string,email:string)=>{
    return jwt.sign(
        {id:userId,email:email},
        secret,
        options,
    )
}

export const signup=async(req:Request,res:Response,next:NextFunction):Promise<void>=>{
    try{
        const {name,userName,email,password}=req.body;
        if(!name || !email || !password){
            res.status(400).json({
                success:false,
                message:"All Fields are Required",
            });
            return;
        }
        const existingUser=await User.findOne({email:email.toLowerCase()});
        if(existingUser){
            res.status(409).json({
                success:false,
                message:"user already exist",
            });
            return;
        }
        const hashPassword=await bcrypt.hash(password,10);
        const user=await User.create({
            name,
            userName,
            email,
            password:hashPassword,
        });
        if(!user){
            res.status(400).json({
                success:false,
                message:"Error creating User",
            });
        }
        const token=generateToken(user._id.toString(),email);
        res.cookie("token",token,{
            httpOnly:true,
            secure:true,
            sameSite:'lax',
        });
        res.status(201).json({
            success:true,
            message:"successfully register",
            token,
        })
    }catch(err){
        console.log(err);
        next(err);
    }
}







export const signin=async(req:Request,res:Response,next:NextFunction):Promise<void>=>{
    try{
        const {email,password}=req.body;
        if(!email || !password){
            res.status(400).json({
                success:false,
                message:"All Fields are Required",
            });
        }
        const user=await User.findOne({email:email.toLowerCase()});
        if(!user){
            res.status(400).json({
                success:false,
                message:"please do a signup first",
            });
            return;
        }
        if(!user.password){
             res.status(400).json({
                success:false,
                message:"This account uses Google login. Please use Continue with Google" 
            });
            return;
        }
        const compare=await bcrypt.compare(password,user.password);
        if(!compare){
            res.status(400).json({
                success:false,
                message:"incorrect password",
            });
            return;
        }
        let token=generateToken(user._id.toString(),email);
        res.cookie("token",token,{
            httpOnly:true,
            secure:true,
            sameSite:"lax",
        });
        res.status(200).json({
            success:true,
            message:"successfully verified",
            token,
        });
    }catch(err){
        next(err);
    }
}








export const logout=async(req:Request,res:Response,next:NextFunction):Promise<void>=>{
try{
    const token=req.cookies?.token;
    res.clearCookie("token",{
        httpOnly:true,
        secure:true,
        sameSite:"none",
        partitioned:true,
    });
    res.status(200).json({
        success:true,
        message:"successfully logout",
    });
}catch(err){
    next(err);
}
}










export const googleLogin=async(req:authRequest,res:Response,next:NextFunction)=>{
    try{
        //credential value is assigned to credentials 
        const {credential:credentials}=req.body;
        if(!credentials){
            return res.status(400).json({
                success:false,
                message:"Google Credentials is missing",
            });
        }
        let payload:TokenPayload | undefined;
        try{
            const ticket=await googleClient.verifyIdToken({
                idToken:credentials,
                audience:GOOGLE_CLIENT_ID,
            });
            payload=ticket.getPayload();
        }catch(err){
            return res.status(401).json({
                success:false,
                message:"Invalid Google Token",
            });
        }
        if(!payload || !payload.email || !payload.email_verified){
            return res.status(401).json({
                success:false,
                message:"email is not verified",
            });
        }
        //here we check if it is in database or not if not we register him
        const email=payload.email.toLowerCase();
        const name=payload.name || email.split("@")[0];
        const avatar=payload.picture || "";
        const googleId=payload.sub;
        let user=await User.findOne({email:email});

        if(!user){
               user=await User.create({
                name,
                email,
                googleId,
                avatar,
            });
        }else if(!user.googleId){
            user.googleId=googleId;
            if(user.avatar===""){
                user.avatar=avatar;
            }
            await user.save();
        }
        const token=jwt.sign({id:user?._id.toString(),email:email},JWT_SECRET as string,options);
        res.cookie("token",token,{
            httpOnly:true,
            sameSite:"lax",
            secure:true,
            maxAge:7*24*60*60*1000,
        });
        return res.status(200).json({
            success:true,
            message:"successfully verified",
            token,
        });
    }catch(err){
        next(err);
    }
}














export const allUsers=async(req:authRequest,res:Response,next:NextFunction)=>{
    try{
        const user=req?.user;
        const id=user?._id;
        const email=user?.email;
        const allUser=await User.find().select("_id name email");
        if(allUser.length===0){
            res.status(400).json({
                success:false,
                message:"new users will join soon",
            });
            return;
        }
       return res.status(200).json({
            success:true,
            message:"all users",
            data:{
                allUser,
            },
            userData:{
                loginUserId:id,
                email:email,
            },
        });
    }catch(err){
        next(err);
    }
}














export const me=async(req:authRequest,res:Response,next:NextFunction)=>{
    try{
        const token=req.cookies?.token;
        if(!token){
            return res.status(401).json({
               success:false,
               message:"token not found",
            });
        }
        return res.status(200).json({
            success:true,
            message:"successfully verified",
        });
    }catch(err){
        next(err);
    }
}