import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";

// Get user's current streak stats
export const getStreak = query({
    args: {},
    handler: async (ctx) => {
        const userId = (await ctx.auth.getUserIdentity())?.subject;
        if (!userId) return null;

        const streak = await ctx.db
            .query("streaks")
            .withIndex("by_user", (q) => q.eq("userId", userId))
            .first();

        return streak;
    },
});

// Calculate and update user's streak
// This is an internal mutation called by triggers in todos.ts
export const updateStreak = internalMutation({
    args: {
        userId: v.string(),
        date: v.string(), // YYYY-MM-DD
    },
    handler: async (ctx, args) => {
        const { userId } = args;

        // Get all completed todos for this user
        // We use the 'by_user' index and filter in memory or use 'by_user_completed_archived' if available
        // schema.ts has .index("by_user_completed_archived", ["userId", "completed", "archived"])

        // We need all dates where at least one todo is completed
        const completedTodos = await ctx.db
            .query("todos")
            .withIndex("by_user", (q) => q.eq("userId", userId))
            .filter(q => q.eq(q.field("completed"), true))
            .collect();

        // Extract unique dates of completed todos
        const validDates = completedTodos
            .filter(t => !!t.date && !t.folderId && !t.backlog && !t.pinned)
            .map(t => t.date!);

        const uniqueDates = Array.from(new Set(validDates)).sort();

        if (uniqueDates.length === 0) {
            // No completed todos, reset streak if exists
            const existingStreak = await ctx.db
                .query("streaks")
                .withIndex("by_user", (q) => q.eq("userId", userId))
                .first();

            if (existingStreak) {
                await ctx.db.patch(existingStreak._id, {
                    currentStreak: 0,
                    totalTodosCompleted: 0,
                    weeklyProgress: {},
                });
            }
            return;
        }

        // Calculate streaks
        let currentStreak = 0;
        let longestStreak = 0;

        // Helper to check consecutive dates
        const isConsecutive = (date1: string, date2: string) => {
            const d1 = new Date(date1);
            const d2 = new Date(date2);
            const diffTime = Math.abs(d2.getTime() - d1.getTime());
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            return diffDays === 1;
        };

        // Calculate streaks from sorted unique dates
        let tempStreak = 1;
        for (let i = 0; i < uniqueDates.length - 1; i++) {
            if (isConsecutive(uniqueDates[i], uniqueDates[i + 1])) {
                tempStreak++;
            } else {
                longestStreak = Math.max(longestStreak, tempStreak);
                tempStreak = 1;
            }
        }
        longestStreak = Math.max(longestStreak, tempStreak);

        // Calculate current streak
        // If the last completed date is "today" or "yesterday", the streak is active
        const today = new Date().toISOString().split('T')[0];
        const lastCompletedDate = uniqueDates[uniqueDates.length - 1];

        // Check if the streak is still active (last completion was today or yesterday)
        const d1 = new Date(today);
        const d2 = new Date(lastCompletedDate);
        const diffTime = Math.abs(d1.getTime() - d2.getTime());
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays <= 1) {
            // Active streak, calculate backwards from last date
            currentStreak = 1;
            for (let i = uniqueDates.length - 1; i > 0; i--) {
                if (isConsecutive(uniqueDates[i - 1], uniqueDates[i])) {
                    currentStreak++;
                } else {
                    break;
                }
            }
        } else {
            currentStreak = 0;
        }

        // Calculate weekly progress (last 7 days)
        const weeklyProgress: Record<string, boolean> = {};
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 6);

        for (let i = 0; i < 7; i++) {
            const d = new Date(oneWeekAgo);
            d.setDate(d.getDate() + i);
            const dateStr = d.toISOString().split('T')[0];
            weeklyProgress[dateStr] = uniqueDates.includes(dateStr);
        }

        // Update or insert streak record
        const existingStreak = await ctx.db
            .query("streaks")
            .withIndex("by_user", (q) => q.eq("userId", userId))
            .first();

        const streakData = {
            userId,
            currentStreak,
            longestStreak: Math.max(longestStreak, existingStreak?.longestStreak || 0),
            lastCompletedDate,
            weeklyProgress,
            totalTodosCompleted: completedTodos.length,
        };

        if (existingStreak) {
            await ctx.db.patch(existingStreak._id, streakData);
        } else {
            await ctx.db.insert("streaks", {
                ...streakData,
                hasUnseenBadges: false,
            });
        }
    },
});
