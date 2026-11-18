const express = require("express");
const jwt = require("jsonwebtoken");

const router = express.Router();
const db = require("../db/database");

// ============================================================
// ADMIN AUTHENTICATION MIDDLEWARE
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

        const token = authHeader.split(" ")[1];

        if (!process.env.JWT_SECRET) {
            console.error("JWT_SECRET is not configured.");

            return res.status(500).json({
                success: false,
                message: "Server authentication configuration error."
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);

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
            message: "Invalid or expired authentication token."
        });

    }

}

// ============================================================
// GET LATEST 10 USER LOGIN RECORDS
//
// GET /api/audit-logs/recent
//
// Authorization:
// Bearer <admin-token>
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

            message: "Recent login logs retrieved successfully.",

            totalRecords: formattedLogs.length,

            logs: formattedLogs

        });

    } catch (error) {

        console.error("AUDIT LOG ERROR:", error);

        return res.status(500).json({

            success: false,

            message: "Unable to retrieve audit logs."

        });

    }

});

// ============================================================
// EXPORT ROUTER
// ============================================================

module.exports = router;