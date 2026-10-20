import {Request,Response,NextFunction} from 'express';
import { User } from '../models/user.model';
import bcrypt from 'bcrypt';
import { JWT_SECRET,JWT_EXPIRES_IN,GOOGLE_CLIENT_ID} from '../configs/env.config';
import { authRequest } from '../types/auth.Requests.types';
import { OAuth2Client,TokenPayload } from 'google-auth-library';
import jwt from 'jsonwebtoken';


const JWT_REFRESH_SECRET=process.env.JWT_REFRESH_SECRET || JWT_SECRET;
const googleClient=new OAuth2Client(GOOGLE_CLIENT_ID);

const generateToken=(id:string,email:string)=>{
    const accessToken=jwt.sign(
        {id,email},
         JWT_SECRET as string,
        {expiresIn:'15m'} //it is short lived
    );
    const refreshToken=jwt.sign(
        {id,email},
        JWT_REFRESH_SECRET as string,
        {expiresIn:'7d'}  //it is long lived
    );
    return {accessToken,refreshToken};
}

export const register=async(req:Request,res:Response,next:NextFunction):Promise<void>=>{
    try{
        const {name,userName,email,password}=req.body;
        if(!name ||  !userName || !email || !password){
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
            return;
        }
        const {accessToken,refreshToken}=generateToken(user._id.toString(),email);
        res.cookie("refreshToken",refreshToken,{
            //helps that browser don't read cookie
            httpOnly:true,
            //if(true)send cookie to https else stop it works on localhost
            secure:process.env.NODE_ENV=== 'production',
            //diffrent websites can access if none like frontend on vecel and backend on render
            sameSite:process.env.NODE_ENV=== "production"? 'none':'lax',
            maxAge:7*24*60*60*1000
        });
        res.status(201).json({
            success:true,
            message:"successfully register",
            accessToken,
        })
    }catch(err){
        console.log(err);
        next(err);
    }
}

export const login=async(req:Request,res:Response,next:NextFunction):Promise<void>=>{
    try{
        const {email,password}=req.body;
        if(!email || !password){
            res.status(400).json({
                success:false,
                message:"provide proper details",
            });
            return;
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
        let {accessToken,refreshToken}=generateToken(user._id.toString(),email);
        res.cookie("refreshToken",refreshToken,{
            httpOnly:true,
            secure:process.env.NODE_ENV=== 'production',
            sameSite:process.env.NODE_ENV=== "production"? 'none':'lax',
            maxAge:7*24*60*60*1000,
        });
        res.status(200).json({
            success:true,
            message:"successfully verified",
            accessToken,
        });
    }catch(err){
        next(err);
    }
}


export const logout=async(req:authRequest,res:Response,next:NextFunction)=>{
    try{
        res.clearCookie("refreshToken",{
            httpOnly:true,
            secure:process.env.NODE_ENV=== 'production',
            sameSite:process.env.NODE_ENV=== 'production'?'none':'lax',
        });
        return res.status(200).json({
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
        const {refreshToken,accessToken}=generateToken(user._id.toString(),email);
        res.cookie("refreshToken",refreshToken,{
            httpOnly:true,
            secure:process.env.NODE_ENV=== 'production',
            sameSite:process.env.NODE_ENV=== "production"? 'none':'lax',
            maxAge:7*24*60*60*1000,
        });
        return res.status(200).json({
            success:true,
            message:"successfully verified",
            accessToken,
        });
    }catch(err){
        next(err);
    }
}

export const me=async(req:authRequest,res:Response,next:NextFunction)=>{
    try{
        return res.status(200).json({
            success:true,
            message:"successfully verified",
            user:req.user,
        });
    }catch(err){
        next(err);
    }
}

export const refreshTokenHandler=async(req:authRequest,res:Response,next:NextFunction)=>{
    try{
        const token=req.cookies?.refreshToken;
        if(!token){
            return res.status(401).json({
                success:false,
                message:"Refresh Token is missing",
            });
        }
        jwt.verify(token,JWT_REFRESH_SECRET as string,async(err:any,decoded:any)=>{
            if(err){
                return res.status(403).json({
                    success:false,
                    message:"Invalid refresh token",
                });
            }
            const user=await User.findOne({email:decoded.email});
            if(!user){
                return res.status(403).json({
                    success:false,
                    message:"user not exist",
                });
            }
            const accessToken=jwt.sign({id:user._id.toString(),email:user.email},JWT_SECRET as string, {expiresIn:"15m"});
            return res.status(200).json({
                success:true,
                accessToken,
            })
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