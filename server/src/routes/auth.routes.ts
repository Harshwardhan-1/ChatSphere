import {Router} from 'express';
export const authRouter=Router();
import { signupschema,signinschema } from '../validators/auth.validator';
import { validate } from '../middleware/validation.middleware';
import { signup,signin,logout,googleLogin,me } from '../controllers/auth.controller';
import { isUserLoggedIn } from '../middleware/auth.middleware';
import { registerRateLimiter,loginRateLimiter } from '../middleware/ratelimit.middleware';


authRouter.post("/register",registerRateLimiter,validate(signupschema),signup);
authRouter.post("/login",loginRateLimiter,validate(signinschema),signin);
authRouter.post("/google",googleLogin);
authRouter.post("/logout",isUserLoggedIn,logout);
authRouter.get("/me",isUserLoggedIn,me);