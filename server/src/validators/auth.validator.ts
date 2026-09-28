import z from 'zod';

export const signupschema = z.object({
  name: z
    .string()
    .nonempty('name field cannot be empty')
    .min(3, 'name must be at least 3 characters')
    .max(50, 'name should not be greater than 50 characters'),
    
    userName:
    z.string().
    nonempty("userName is required").
    min(3,'userName must be atleast 3 characters').
    max(100,'userName cannot be more than 100 characters'),

  email: z
    .string()
    .email('invalid email format')
    .trim()
    .nonempty('email field cannot be empty')
    .toLowerCase(),

  password: z.string()
    .min(3, 'pssword must be atleast 3 characters')
    .max(32, 'password cannot be more than 32 characters')
    .regex(/[A-Z]/,'password must contain atleast one uppercase letter')
    .regex(/[a-z]/,'password must contain atleast one lowercase letter')
    .regex(/[0-9]/,'password must contain atleast one number'),
});






export const signinschema = z.object({
  email: z.string().email('Invalid email format').trim().toLowerCase(),

  password: z.string().min(1, 'pssword must be atleast 1 characters'),
});

export type SignupInput = z.infer<typeof signupschema>;
export type SigninInput = z.infer<typeof signinschema>;
