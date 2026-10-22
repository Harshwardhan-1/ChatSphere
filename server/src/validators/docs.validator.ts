import z from 'zod';


export const validateDocs=z.object({
    creatorId:z.string(),
    docsName:z.string()
    .min(3,'docs name must be atleast 3 characters')
    .max(100,'docs name must not be greater than 100 characters'),
    editPermission:z.array(z.string(),'supports array format'),
    viewPermission:z.array(z.string(),'supports array format')
})