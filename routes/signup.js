const express = require("express");
const nodemailer = require("nodemailer");
const crypto = require("crypto");
const rateLimit = require("express-rate-limit");

const router = express.Router();
const db = require("../db/database");

// ============================================================
// EMAIL CONFIGURATION
// ============================================================

const EMAIL_HOST = process.env.EMAIL_HOST;
const EMAIL_PORT = Number(process.env.EMAIL_PORT || 587);
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;

const transporter = nodemailer.createTransport({
    host: EMAIL_HOST,
    port: EMAIL_PORT,
    secure: EMAIL_PORT === 465,
    auth: {
        user: EMAIL_USER,
        pass: EMAIL_PASS
    },
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000
});

// ============================================================
// RATE LIMITERS
// ============================================================

const sendOTPLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
        success: false,
        message: "Too many OTP requests. Please try again later."
    }
});

const verifyOTPLimiter = rateLimit({
    windowMs: 15 * 15 * 1000,
    limit: 10,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
        success: false,
        message: "Too many verification attempts. Please try again later."
    }
});

const resendOTPLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 3,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: {
        success: false,
        message: "Too many resend requests. Please try again later."
    }
});

// ============================================================
// GENERATE SECURE OTP
// ============================================================

function generateOTP() {
    return crypto.randomInt(100000, 1000000).toString();
}

// ============================================================
// VALIDATION FUNCTIONS
// ============================================================

function normalizeEmail(email) {
    return typeof email === "string"
        ? email.trim().toLowerCase()
        : "";
}

function isValidGmail(email) {
    return /^[a-zA-Z0-9._%+-]+@gmail\.com$/i.test(email);
}

function isValidUsername(username) {
    return /^[a-zA-Z0-9_]{3,30}$/.test(username);
}

function isValidMobile(mobile) {
    return /^\+?[0-9]{10,15}$/.test(mobile);
}

function isValidOTP(otp) {
    return /^[0-9]{6}$/.test(otp);
}

// ============================================================
// SEND OTP EMAIL
// ============================================================

async function sendOTPEmail(email, username, otp) {

    if (!EMAIL_USER || !EMAIL_PASS || !EMAIL_HOST) {
        throw new Error("Email configuration is incomplete.");
    }

    await transporter.sendMail({
        from: `"VILLA Verification" <${EMAIL_USER}>`,
        to: email,
        subject: "VILLA - Email Verification OTP",

        text: `
Hello ${username},

Your VILLA account verification OTP is:

${otp}

This OTP will expire in 5 minutes.

If you did not request this verification, please ignore this email.

Thank you,
VILLA Team
        `,

        html: `
<div style="font-family:Arial,sans-serif;max-width:500px;margin:auto;padding:25px;border:1px solid #ddd;border-radius:10px;">
    <h2 style="color:#222;">VILLA Email Verification</h2>

    <p>Hello ${username},</p>

    <p>Your account verification OTP is:</p>

    <h1 style="letter-spacing:8px;color:#2563eb;">${otp}</h1>

    <p>This OTP will expire in <strong>5 minutes</strong>.</p>

    <p>If you did not request this verification, please ignore this email.</p>

    <hr>

    <p style="color:#888;font-size:12px;">VILLA Team</p>
</div>
        `
    });
}

// ============================================================
// CLEAR OTP AFTER EMAIL FAILURE
// ============================================================

async function clearOTP(email) {

    await db.execute(
        `UPDATE users
         SET otp = NULL,
             otp_expires_at = NULL
         WHERE email = ?
         AND is_verified = 0`,
        [email]
    );

}

// ============================================================
// SEND OTP
//
// POST /api/signup/send-otp
//
// Request:
// {
//     "username": "testuser",
//     "mobile": "9876543210",
//     "email": "test@gmail.com",
//     "address": "Chennai"
// }
// ============================================================

router.post("/send-otp", sendOTPLimiter, async (req, res) => {

    let email = "";

    try {

        // ----------------------------------------------------
        // GET INPUT
        // ----------------------------------------------------

        const username =
            typeof req.body.username === "string"
                ? req.body.username.trim()
                : "";

        const mobile =
            typeof req.body.mobile === "string"
                ? req.body.mobile.trim()
                : "";

        email = normalizeEmail(req.body.email);

        const address =
            typeof req.body.address === "string"
                ? req.body.address.trim()
                : "";

        // ----------------------------------------------------
        // REQUIRED FIELD VALIDATION
        // ----------------------------------------------------

        if (!username || !mobile || !email || !address) {

            return res.status(400).json({
                success: false,
                message: "Username, mobile, email and address are required."
            });

        }

        // ----------------------------------------------------
        // USERNAME VALIDATION
        // ----------------------------------------------------

        if (!isValidUsername(username)) {

            return res.status(400).json({
                success: false,
                message: "Username must contain 3-30 letters, numbers or underscores."
            });

        }

        // ----------------------------------------------------
        // MOBILE VALIDATION
        // ----------------------------------------------------

        if (!isValidMobile(mobile)) {

            return res.status(400).json({
                success: false,
                message: "Please enter a valid mobile number."
            });

        }

        // ----------------------------------------------------
        // ADDRESS VALIDATION
        // ----------------------------------------------------

        if (address.length < 3 || address.length > 1000) {

            return res.status(400).json({
                success: false,
                message: "Please enter a valid address."
            });

        }

        // ----------------------------------------------------
        // GMAIL VALIDATION
        // ----------------------------------------------------

        if (!isValidGmail(email)) {

            return res.status(400).json({
                success: false,
                message: "Please enter a valid Gmail address."
            });

        }

        // ----------------------------------------------------
        // ADMIN EMAIL CHECK
        // ----------------------------------------------------

        if (
            process.env.ADMIN_EMAIL &&
            email === normalizeEmail(process.env.ADMIN_EMAIL)
        ) {

            return res.status(400).json({
                success: false,
                message: "This email is reserved for administrator."
            });

        }

        // ----------------------------------------------------
        // CHECK EXISTING EMAIL
        // ----------------------------------------------------

        const [emailRows] = await db.execute(
            `SELECT id, username, is_verified
             FROM users
             WHERE email = ?
             LIMIT 1`,
            [email]
        );

        if (
            emailRows.length > 0 &&
            Number(emailRows[0].is_verified) === 1
        ) {

            return res.status(409).json({
                success: false,
                message: "Gmail already exists."
            });

        }

        // ----------------------------------------------------
        // CHECK DUPLICATE USERNAME
        // ----------------------------------------------------

        const [usernameRows] = await db.execute(
            `SELECT id
             FROM users
             WHERE LOWER(username) = LOWER(?)
             AND email <> ?
             LIMIT 1`,
            [username, email]
        );

        if (usernameRows.length > 0) {

            return res.status(409).json({
                success: false,
                message: "Username already exists."
            });

        }

        // ----------------------------------------------------
        // GENERATE OTP
        // ----------------------------------------------------

        const otp = generateOTP();

        const expiry = new Date(
            Date.now() + 5 * 60 * 1000
        );

        // ----------------------------------------------------
        // SAVE USER
        // ----------------------------------------------------

        if (emailRows.length > 0) {

            await db.execute(
                `UPDATE users
                 SET username = ?,
                     mobile = ?,
                     address = ?,
                     otp = ?,
                     otp_expires_at = ?,
                     is_verified = 0,
                     role = 'user'
                 WHERE email = ?`,
                [
                    username,
                    mobile,
                    address,
                    otp,
                    expiry,
                    email
                ]
            );

        } else {

            await db.execute(
                `INSERT INTO users
                (
                    username,
                    mobile,
                    email,
                    address,
                    otp,
                    otp_expires_at,
                    is_verified,
                    role
                )
                VALUES (?, ?, ?, ?, ?, ?, 0, 'user')`,
                [
                    username,
                    mobile,
                    email,
                    address,
                    otp,
                    expiry
                ]
            );

        }

        // ----------------------------------------------------
        // SEND EMAIL
        // ----------------------------------------------------

        try {

            await sendOTPEmail(email, username, otp);

        } catch (emailError) {

            console.error("OTP EMAIL ERROR:", emailError.message);
            console.error("SMTP ERROR CODE:", emailError.code || "N/A");

            await clearOTP(email);

            return res.status(500).json({
                success: false,
                message: "Unable to send verification email. Please try again."
            });

        }

        // ----------------------------------------------------
        // SUCCESS
        // ----------------------------------------------------

        return res.status(200).json({
            success: true,
            message: "OTP sent successfully to your Gmail."
        });

    } catch (error) {

        console.error("SEND OTP ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to send OTP. Please try again."
        });

    }

});

// ============================================================
// VERIFY OTP
//
// POST /api/signup/verify-otp
//
// Request:
// {
//     "email": "test@gmail.com",
//     "otp": "123456"
// }
// ============================================================

router.post("/verify-otp", verifyOTPLimiter, async (req, res) => {

    try {

        const email = normalizeEmail(req.body.email);

        const otp =
            typeof req.body.otp === "string"
                ? req.body.otp.trim()
                : "";

        // ----------------------------------------------------
        // VALIDATION
        // ----------------------------------------------------

        if (!email || !otp) {

            return res.status(400).json({
                success: false,
                message: "Email and OTP are required."
            });

        }

        if (!isValidGmail(email) || !isValidOTP(otp)) {

            return res.status(400).json({
                success: false,
                message: "Invalid email or OTP format."
            });

        }

        // ----------------------------------------------------
        // FIND USER
        // ----------------------------------------------------

        const [users] = await db.execute(
            `SELECT
                id,
                username,
                email,
                otp,
                otp_expires_at,
                is_verified
             FROM users
             WHERE email = ?
             LIMIT 1`,
            [email]
        );

        // ----------------------------------------------------
        // USER NOT FOUND
        // ----------------------------------------------------

        if (users.length === 0) {

            return res.status(404).json({
                success: false,
                message: "User not found. Please register first."
            });

        }

        const user = users[0];

        // ----------------------------------------------------
        // ALREADY VERIFIED
        // ----------------------------------------------------

        if (Number(user.is_verified) === 1) {

            return res.status(400).json({
                success: false,
                message: "Email is already verified."
            });

        }

        // ----------------------------------------------------
        // OTP NOT AVAILABLE
        // ----------------------------------------------------

        if (!user.otp || !user.otp_expires_at) {

            return res.status(400).json({
                success: false,
                message: "OTP not found. Please request a new OTP."
            });

        }

        // ----------------------------------------------------
        // OTP EXPIRY CHECK
        // ----------------------------------------------------

        const expiryTime = new Date(user.otp_expires_at).getTime();

        if (
            Number.isNaN(expiryTime) ||
            expiryTime < Date.now()
        ) {

            await clearOTP(email);

            return res.status(400).json({
                success: false,
                message: "OTP has expired. Please request a new OTP."
            });

        }

        // ----------------------------------------------------
        // OTP MATCH CHECK
        // ----------------------------------------------------

        if (String(user.otp) !== otp) {

            return res.status(400).json({
                success: false,
                message: "Invalid OTP."
            });

        }

        // ----------------------------------------------------
        // VERIFY USER
        // ----------------------------------------------------

        const [result] = await db.execute(
            `UPDATE users
             SET is_verified = 1,
                 otp = NULL,
                 otp_expires_at = NULL
             WHERE email = ?
             AND is_verified = 0
             AND otp = ?`,
            [email, otp]
        );

        if (result.affectedRows !== 1) {

            return res.status(409).json({
                success: false,
                message: "OTP verification could not be completed. Please try again."
            });

        }

        // ----------------------------------------------------
        // SUCCESS
        // ----------------------------------------------------

        return res.status(200).json({
            success: true,
            message: "Email verified successfully.",
            role: "user"
        });

    } catch (error) {

        console.error("VERIFY OTP ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "OTP verification failed."
        });

    }

});

// ============================================================
// RESEND OTP
//
// POST /api/signup/resend-otp
//
// Request:
// {
//     "email": "test@gmail.com"
// }
// ============================================================

router.post("/resend-otp", resendOTPLimiter, async (req, res) => {

    let email = "";

    try {

        email = normalizeEmail(req.body.email);

        // ----------------------------------------------------
        // VALIDATION
        // ----------------------------------------------------

        if (!email) {

            return res.status(400).json({
                success: false,
                message: "Email is required."
            });

        }

        if (!isValidGmail(email)) {

            return res.status(400).json({
                success: false,
                message: "Please enter a valid Gmail address."
            });

        }

        // ----------------------------------------------------
        // FIND USER
        // ----------------------------------------------------

        const [users] = await db.execute(
            `SELECT
                id,
                username,
                is_verified
             FROM users
             WHERE email = ?
             LIMIT 1`,
            [email]
        );

        // ----------------------------------------------------
        // USER NOT FOUND
        // ----------------------------------------------------

        if (users.length === 0) {

            return res.status(404).json({
                success: false,
                message: "User not found. Please register first."
            });

        }

        const user = users[0];

        // ----------------------------------------------------
        // ALREADY VERIFIED
        // ----------------------------------------------------

        if (Number(user.is_verified) === 1) {

            return res.status(400).json({
                success: false,
                message: "Email is already verified."
            });

        }

        // ----------------------------------------------------
        // GENERATE NEW OTP
        // ----------------------------------------------------

        const otp = generateOTP();

        const expiry = new Date(
            Date.now() + 5 * 60 * 1000
        );

        // ----------------------------------------------------
        // UPDATE OTP
        // ----------------------------------------------------

        await db.execute(
            `UPDATE users
             SET otp = ?,
                 otp_expires_at = ?
             WHERE email = ?
             AND is_verified = 0`,
            [
                otp,
                expiry,
                email
            ]
        );

        // ----------------------------------------------------
        // SEND EMAIL
        // ----------------------------------------------------

        try {

            await sendOTPEmail(email, user.username, otp);

        } catch (emailError) {

            console.error("RESEND EMAIL ERROR:", emailError.message);
            console.error("SMTP ERROR CODE:", emailError.code || "N/A");

            await clearOTP(email);

            return res.status(500).json({
                success: false,
                message: "Unable to resend OTP. Please try again."
            });

        }

        // ----------------------------------------------------
        // SUCCESS
        // ----------------------------------------------------

        return res.status(200).json({
            success: true,
            message: "New OTP sent successfully."
        });

    } catch (error) {

        console.error("RESEND OTP ERROR:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to resend OTP."
        });

    }

});

// ============================================================
// EXPORT ROUTER
// ============================================================

module.exports = router;