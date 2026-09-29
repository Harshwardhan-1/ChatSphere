//npm install express-rate-limit

import rateLimit from 'express-rate-limit';


export const registerRateLimiter=rateLimit({
    windowMs:60*3000,
    limit:20,
    //we can show this to user in real time on frontend how many request are left if we want
    standardHeaders:"draft-8",
    legacyHeaders:false,
    handler:(req,res)=>{
        const retryAfter=Math.ceil(((req as any).rateLimit.resetTime.getTime()-Date.now())/1000);
        return res.status(429).json({
            success:false,
            message:`Too many request.Try again after ${retryAfter} minute`,
        });
    },
});






export const loginRateLimiter=rateLimit({
    windowMs:60*1000,
    limit:5,
    //info
    standardHeaders:"draft-8",
    //this is old format stop 
    legacyHeaders:false,
    handler:(req,res)=>{
        const retryAfter=Math.ceil(((req as any).rateLimit.resetTime.getTime()-Date.now())/1000);
        return res.status(429).json({
            success:false,
            message:`Too many login attempts. Try again after ${retryAfter} seconds`,
        });
    },
});