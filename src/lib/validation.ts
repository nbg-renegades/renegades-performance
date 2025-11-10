import { z } from 'zod';

// Performance entry validation
export const performanceEntrySchema = z.object({
  player_id: z.string().uuid({ message: "Invalid player ID" }),
  metric_type: z.enum([
    'vertical_jump',
    'broad_jump', 
    '40yd_dash',
    '3cone_drill',
    'shuffle_run',
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
  email: z.string()
    .trim()
    .email({ message: "Invalid email address" })
    .max(255, { message: "Email must be less than 255 characters" }),
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
export const signUpSchema = z.object({
  email: z.string()
    .trim()
    .email({ message: "Invalid email address" })
    .max(255, { message: "Email must be less than 255 characters" }),
  password: z.string()
    .min(6, { message: "Password must be at least 6 characters" })
    .max(128, { message: "Password must be less than 128 characters" }),
  first_name: z.string()
    .trim()
    .min(1, { message: "First name is required" })
    .max(100, { message: "First name must be less than 100 characters" }),
  last_name: z.string()
    .trim()
    .min(1, { message: "Last name is required" })
    .max(100, { message: "Last name must be less than 100 characters" }),
});

export const signInSchema = z.object({
  email: z.string()
    .trim()
    .email({ message: "Invalid email address" })
    .max(255, { message: "Email must be less than 255 characters" }),
  password: z.string()
    .min(1, { message: "Password is required" })
    .max(128, { message: "Password must be less than 128 characters" }),
});
