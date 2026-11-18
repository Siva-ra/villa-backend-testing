const express = require("express");
const jwt = require("jsonwebtoken");

const router = express.Router();
const db = require("../db/database");

// ============================================================
// ADMIN AUTHENTICATION
// ============================================================

function verifyAdmin(req, res, next) {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            return res.status(401).json({
                success: false,
                message: "Authentication token required."
            });
        }

        if (!process.env.JWT_SECRET) {
            return res.status(500).json({
                success: false,
                message: "JWT configuration missing."
            });
        }

        const token = authHeader.split(" ")[1];

        const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET
        );

        if (
            !decoded ||
            !decoded.role ||
            decoded.role.toLowerCase() !== "admin"
        ) {
            return res.status(403).json({
                success: false,
                message: "Admin access required."
            });
        }

        req.admin = decoded;

        next();

    } catch (error) {
        return res.status(401).json({
            success: false,
            message: "Invalid or expired token."
        });
    }
}


// ============================================================
// API 1: RECENT LOGIN LOGS - LATEST 10
// GET /api/audit-logs/recent
// ============================================================

router.get("/recent", verifyAdmin, async (req, res) => {
    try {
        const [logs] = await db.execute(`
            SELECT
                id,
                username,
                email,
                created_at,
                login_time
            FROM user_login_logs
            ORDER BY login_time DESC, id DESC
            LIMIT 10
        `);

        const formattedLogs = logs.map(log => ({
            id: log.id,
            username: log.username,
            email: log.email,
            createdDate: log.created_at,
            loginTime: log.login_time
        }));

        return res.status(200).json({
            success: true,
            totalRecords: formattedLogs.length,
            logs: formattedLogs
        });

    } catch (error) {
        console.error("RECENT LOG ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to retrieve recent logs."
        });
    }
});


// ============================================================
// API 2: GET ALL REGISTERED USERS
// GET /api/audit-logs/users
// ============================================================

router.get("/users", verifyAdmin, async (req, res) => {
    try {
        const [users] = await db.execute(`
            SELECT
                id,
                username,
                mobile,
                email,
                created_at
            FROM users
            WHERE is_verified = 1
            ORDER BY created_at DESC, id DESC
        `);

        const formattedUsers = users.map(user => ({
            id: user.id,
            username: user.username,
            mobile: user.mobile,
            email: user.email,
            createdDate: user.created_at
        }));

        return res.status(200).json({
            success: true,
            totalUsers: formattedUsers.length,
            users: formattedUsers
        });

    } catch (error) {
        console.error("USER LIST ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Unable to retrieve users."
        });
    }
});


// ============================================================
// API 3: SELECTED USER COMPLETE LOGIN HISTORY
// GET /api/audit-logs/users/:userId/history
// ============================================================

router.get(
    "/users/:userId/history",
    verifyAdmin,
    async (req, res) => {

        try {
            const userId = Number(req.params.userId);

            if (!Number.isInteger(userId) || userId <= 0) {
                return res.status(400).json({
                    success: false,
                    message: "Invalid user ID."
                });
            }

            // ------------------------------------------------
            // GET USER DETAILS
            // ------------------------------------------------

            const [users] = await db.execute(`
                SELECT
                    id,
                    username,
                    email
                FROM users
                WHERE id = ?
                AND is_verified = 1
                LIMIT 1
            `, [userId]);

            if (users.length === 0) {
                return res.status(404).json({
                    success: false,
                    message: "User not found."
                });
            }

            const user = users[0];

            // ------------------------------------------------
            // GET EVERY LOGIN EVENT
            // ------------------------------------------------

            const [history] = await db.execute(`
                SELECT
                    id,
                    DATE_FORMAT(login_time, '%d/%m/%Y') AS loginDate,
                    DATE_FORMAT(login_time, '%h:%i %p') AS loginTime
                FROM user_login_logs
                WHERE user_id = ?
                ORDER BY login_time DESC, id DESC
            `, [userId]);

            // ------------------------------------------------
            // GET DATE-WISE LOGIN COUNT
            // ------------------------------------------------

            const [dailyCounts] = await db.execute(`
                SELECT
                    DATE_FORMAT(login_time, '%d/%m/%Y') AS loginDate,
                    COUNT(*) AS loginCount
                FROM user_login_logs
                WHERE user_id = ?
                GROUP BY DATE(login_time)
                ORDER BY DATE(login_time) DESC
            `, [userId]);

            // ------------------------------------------------
            // RESPONSE
            // ------------------------------------------------

            return res.status(200).json({
                success: true,

                user: {
                    id: user.id,
                    username: user.username,
                    email: user.email
                },

                totalLogins: history.length,

                loginHistory: history,

                dailyCounts: dailyCounts.map(item => ({
                    loginDate: item.loginDate,
                    loginCount: Number(item.loginCount)
                }))
            });

        } catch (error) {
            console.error("USER HISTORY ERROR:", error);

            return res.status(500).json({
                success: false,
                message: "Unable to retrieve user login history."
            });
        }
    }
);


// ============================================================
// EXPORT
// ============================================================

module.exports = router;