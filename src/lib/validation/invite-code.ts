import * as z from "zod";

export const CreateInviteCodeSchema = z.object({
  label: z.string().trim().max(60).optional(),
  maxUses: z.coerce
    .number()
    .int()
    .min(1, { error: "Must allow at least 1 use." })
    .max(1000, { error: "Keep it under 1000 uses." })
    .optional(),
});

export type CreateInviteCodeInput = z.infer<typeof CreateInviteCodeSchema>;
