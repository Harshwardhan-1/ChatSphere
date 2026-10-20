import {Router} from 'express';
export const authRouter=Router();
import { signupschema,signinschema } from '../validators/auth.validator';
import { validate } from '../middleware/validation.middleware';
import { register,login,logout,googleLogin,me,refreshTokenHandler } from '../controllers/auth.controller';
import { isUserLoggedIn } from '../middleware/auth.middleware';
import { registerRateLimiter,loginRateLimiter } from '../middleware/rateLimit.middleware';


authRouter.post("/register",registerRateLimiter,validate(signupschema),register);
authRouter.post("/login",loginRateLimiter,validate(signinschema),login);
authRouter.post("/google",googleLogin);
authRouter.post("/logout",isUserLoggedIn,logout);
authRouter.get("/me",isUserLoggedIn,me);
authRouter.post("/refresh-token",refreshTokenHandler);