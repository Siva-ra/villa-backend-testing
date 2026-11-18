const express = require("express");
const router = express.Router();
const db = require("../db/database");

// ============================================================
// LOGIN / VERIFY EMAIL OR USERNAME
//
// POST /api/login/verify-email
// ============================================================

router.post("/verify-email", async (req, res) => {
    try {

        // ----------------------------------------------------
        // GET LOGIN DETAILS
        // ----------------------------------------------------

        const loginType =
            typeof req.body.loginType === "string"
                ? req.body.loginType.trim().toLowerCase()
                : "";

        const loginValue =
            typeof req.body.loginValue === "string"
                ? req.body.loginValue.trim()
                : "";

        // ----------------------------------------------------
        // VALIDATION
        // ----------------------------------------------------

        if (!loginType || !loginValue) {
            return res.status(400).json({
                success: false,
                message: "Please enter your email or username."
            });
        }

        if (!["email", "username"].includes(loginType)) {
            return res.status(400).json({
                success: false,
                message: "Invalid login type."
            });
        }

        // ----------------------------------------------------
        // ADMIN LOGIN
        // ----------------------------------------------------

        if (
            loginType === "email" &&
            process.env.ADMIN_EMAIL &&
            loginValue.toLowerCase() ===
            process.env.ADMIN_EMAIL.trim().toLowerCase()
        ) {
            return res.status(200).json({
                success: true,
                message: "Admin login successful.",
                userId: 0,
                username: process.env.ADMIN_USERNAME || "Administrator",
                mobile: "",
                email: process.env.ADMIN_EMAIL.trim().toLowerCase(),
                address: "",
                role: "admin"
            });
        }

        // ----------------------------------------------------
        // FIND USER
        // ----------------------------------------------------

        let query;
        let queryValue;

        if (loginType === "email") {

            query = `
                SELECT
                    id,
                    username,
                    mobile,
                    email,
                    address,
                    created_at,
                    is_verified,
                    role
                FROM users
                WHERE email = ?
                LIMIT 1
            `;

            queryValue = loginValue.toLowerCase();

        } else {

            query = `
                SELECT
                    id,
                    username,
                    mobile,
                    email,
                    address,
                    created_at,
                    is_verified,
                    role
                FROM users
                WHERE LOWER(username) = LOWER(?)
                LIMIT 1
            `;

            queryValue = loginValue;
        }

        const [users] = await db.execute(query, [queryValue]);

        // ----------------------------------------------------
        // USER NOT FOUND
        // ----------------------------------------------------

        if (users.length === 0) {
            return res.status(404).json({
                success: false,
                message: "Account not found. Please register first."
            });
        }

        const user = users[0];

        // ----------------------------------------------------
        // EMAIL VERIFICATION CHECK
        // ----------------------------------------------------

        if (
            Number(user.is_verified) !== 1
        ) {
            return res.status(403).json({
                success: false,
                message: "Email is not verified. Please complete registration first."
            });
        }

        // ----------------------------------------------------
        // SAVE SUCCESSFUL LOGIN HISTORY
        // ----------------------------------------------------

        await db.execute(
            `
                INSERT INTO user_login_logs
                (
                    user_id,
                    username,
                    email,
                    created_at,
                    login_time
                )
                VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
            `,
            [
                user.id,
                user.username,
                user.email,
                user.created_at
            ]
        );

        // ----------------------------------------------------
        // LOGIN SUCCESS
        // ----------------------------------------------------

        return res.status(200).json({
            success: true,
            message: "Login successful.",

            userId: user.id,
            username: user.username,
            mobile: user.mobile,
            email: user.email,
            address: user.address,
            role: user.role || "user"
        });

    } catch (error) {

        console.error("LOGIN ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Internal server error. Login failed."
        });
    }
});

// ============================================================
// EXPORT ROUTER
// ============================================================

module.exports = router;