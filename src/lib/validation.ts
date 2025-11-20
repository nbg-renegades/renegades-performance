import { z } from 'zod';

// Performance entry validation
export const performanceEntrySchema = z.object({
  player_id: z.string().uuid({ message: "Invalid player ID" }),
  metric_type: z.enum([
    'vertical_jump',
    'jump_gather', 
    '30yd_dash',
    '3_cone_drill',
    'shuttle_5_10_5',
    'pushups_1min'
  ], { message: "Invalid metric type" }),
  value: z.number()
    .positive({ message: "Value must be positive" })
    .max(1000, { message: "Value must be less than 1000" })
    .finite({ message: "Value must be a valid number" }),
  entry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: "Invalid date format" }),
});

// User profile validation
export const userProfileSchema = z.object({
  username: z.string()
    .trim()
    .min(1, { message: "Username is required" })
    .max(255, { message: "Username must be less than 255 characters" }),
  first_name: z.string()
    .trim()
    .min(1, { message: "First name is required" })
    .max(100, { message: "First name must be less than 100 characters" }),
  last_name: z.string()
    .trim()
    .min(1, { message: "Last name is required" })
    .max(100, { message: "Last name must be less than 100 characters" }),
  password: z.string()
    .min(6, { message: "Password must be at least 6 characters" })
    .max(128, { message: "Password must be less than 128 characters" })
    .optional(),
});

// Auth validation
export const signInSchema = z.object({
  username: z.string()
    .trim()
    .min(1, { message: "Username is required" })
    .max(255, { message: "Username must be less than 255 characters" }),
  password: z.string()
    .min(1, { message: "Password is required" })
    .max(128, { message: "Password must be less than 128 characters" }),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string()
    .min(1, { message: "Current password is required" }),
  newPassword: z.string()
    .min(6, { message: "New password must be at least 6 characters" })
    .max(128, { message: "New password must be less than 128 characters" }),
  confirmPassword: z.string()
    .min(1, { message: "Please confirm your password" }),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});
