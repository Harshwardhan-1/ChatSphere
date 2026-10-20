import dotenv from 'dotenv';
dotenv.config({path:`.env.${process.env.NODE_ENV || 'development'}.local`});

export const{
    MONGO_URI,
    FRONTEND_URL,
    JWT_SECRET,
    SALT_ROUND,
    NODE_ENV,
    PORT,
    JWT_EXPIRES_IN,
    LIVEKIT_URL,
    LIVEKIT_API_KEY,
    LIVEKIT_API_SECRET,
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GROQ_API_KEY,
    JWT_REFRESH_SECRET
}=process.env     