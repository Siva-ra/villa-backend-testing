const express = require("express");
const nodemailer = require("nodemailer");
const crypto = require("crypto");
const rateLimit = require("express-rate-limit");

const router = express.Router();
const db = require("../db/database");

// ============================================================
// CONFIGURATION
// ============================================================

const OTP_EXPIRY_MINUTES = 5;

const EMAIL_HOST = process.env.EMAIL_HOST;
const EMAIL_PORT = Number(process.env.EMAIL_PORT || 587);
const EMAIL_USER = process.env.EMAIL_USER;
const EMAIL_PASS = process.env.EMAIL_PASS;

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || "")
    .trim()
    .toLowerCase();

// ============================================================
// EMAIL TRANSPORTER
// ============================================================

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

    standardHeaders: true,

    legacyHeaders: false,

    message: {
        success: false,
        message: "Too many OTP requests. Please try again later."
    }

});

const verifyOTPLimiter = rateLimit({

    windowMs: 15 * 60 * 1000,

    limit: 10,

    standardHeaders: true,

    legacyHeaders: false,

    message: {
        success: false,
        message: "Too many verification attempts. Please try again later."
    }

});

const resendOTPLimiter = rateLimit({

    windowMs: 15 * 60 * 1000,

    limit: 3,

    standardHeaders: true,

    legacyHeaders: false,

    message: {
        success: false,
        message: "Too many resend requests. Please try again later."
    }

});

// ============================================================
// GENERATE OTP
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
    const cleanedMobile = mobile.replace(/[\s-]/g, "");
    return /^\+?[0-9]{10,15}$/.test(cleanedMobile);
}

function isValidOTP(otp) {

    return /^[0-9]{6}$/.test(otp);

}

function escapeHTML(value) {

    return String(value).replace(/[&<>"']/g, character => {

        const entities = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        };

        return entities[character];

    });

}

// ============================================================
// SEND OTP EMAIL
// ============================================================

async function sendOTPEmail(email, username, otp) {

    if (!EMAIL_HOST || !EMAIL_USER || !EMAIL_PASS) {

        throw new Error("Email configuration is incomplete.");

    }

    const safeUsername = escapeHTML(username);

    await transporter.sendMail({

        from: `"VILLA Verification" <${EMAIL_USER}>`,

        to: email,

        subject: "VILLA - Email Verification OTP",

        text: `
Hello ${username},

Welcome to VILLA!

Your email verification OTP is:

${otp}

This OTP expires in ${OTP_EXPIRY_MINUTES} minutes.

If you did not request this verification, please ignore this email.

Thank you,
VILLA Team
        `,

        html: `
<div style="
    font-family:Arial,sans-serif;
    max-width:500px;
    margin:auto;
    padding:30px;
    border:1px solid #ddd;
    border-radius:12px;
">

    <h2 style="color:#222;">
        VILLA Email Verification
    </h2>

    <p>Hello ${safeUsername},</p>

    <p>Welcome to VILLA!</p>

    <p>Your email verification OTP is:</p>

    <div style="
        background:#f4f4f4;
        padding:20px;
        text-align:center;
        border-radius:8px;
    ">

        <h1 style="
            color:#2563eb;
            letter-spacing:8px;
            margin:0;
        ">
            ${otp}
        </h1>

    </div>

    <p>
        This OTP expires in
        <strong>${OTP_EXPIRY_MINUTES} minutes.</strong>
    </p>

    <p>
        If you did not request this verification,
        please ignore this email.
    </p>

    <hr>

    <p style="color:#888;font-size:12px;">
        VILLA Team
    </p>

</div>
        `

    });

}

// ============================================================
// CLEAR OTP
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
//   "username": "testuser",
//   "mobile": "9876543210",
//   "email": "test@gmail.com",
//   "address": "Chennai"
// }
// ============================================================

router.post("/send-otp", sendOTPLimiter, async (req, res) => {

    let email = "";

    try {

        // ----------------------------------------------------
        // GET REQUEST DATA
        // ----------------------------------------------------

        const username =
            typeof req.body?.username === "string"
                ? req.body.username.trim()
                : "";

        const mobile =
            typeof req.body?.mobile === "string"
                ? req.body.mobile.trim()
                : "";

        email = normalizeEmail(req.body?.email);

        const address =
            typeof req.body?.address === "string"
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
        // EMAIL VALIDATION
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

        if (ADMIN_EMAIL && email === ADMIN_EMAIL) {

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

        // ----------------------------------------------------
        // SAVE OTP EXPIRY
        // ----------------------------------------------------

        const expiry = new Date(
            Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000
        );

        // ----------------------------------------------------
        // UPDATE OR CREATE USER
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
                 WHERE email = ?
                 AND is_verified = 0`,

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

            console.error(
                "OTP EMAIL ERROR:",
                emailError.message
            );

            console.error(
                "SMTP ERROR CODE:",
                emailError.code || "N/A"
            );

            await clearOTP(email);

            return res.status(500).json({

                success: false,

                message: "Unable to send verification email. Please try again."

            });

        }

        // ----------------------------------------------------
        // SUCCESS RESPONSE
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
//   "email": "test@gmail.com",
//   "otp": "123456"
// }
// ============================================================

router.post("/verify-otp", verifyOTPLimiter, async (req, res) => {

    try {

        // ----------------------------------------------------
        // GET REQUEST DATA
        // ----------------------------------------------------

        const email = normalizeEmail(req.body?.email);

        const otp =
            typeof req.body?.otp === "string"
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

            `SELECT id, username, email, is_verified
             FROM users
             WHERE email = ?
             LIMIT 1`,

            [email]

        );

        if (users.length === 0) {

            return res.status(404).json({

                success: false,

                message: "User not found. Please register first."

            });

        }

        const user = users[0];

        // ----------------------------------------------------
        // CHECK VERIFICATION STATUS
        // ----------------------------------------------------

        if (Number(user.is_verified) === 1) {

            return res.status(400).json({

                success: false,

                message: "Email is already verified."

            });

        }

        // ----------------------------------------------------
        // VERIFY OTP AT DATABASE LEVEL
        // ----------------------------------------------------

        // NOW() checks expiry using the database server clock.
        // This avoids comparing different application/database
        // timezone settings.

        const [result] = await db.execute(

            `UPDATE users
             SET is_verified = 1,
                 otp = NULL,
                 otp_expires_at = NULL
             WHERE email = ?
             AND otp = ?
             AND is_verified = 0
             AND otp_expires_at IS NOT NULL
             AND otp_expires_at > NOW()`,

            [email, otp]

        );

        // ----------------------------------------------------
        // VERIFICATION RESULT
        // ----------------------------------------------------

        if (result.affectedRows !== 1) {

            const [checkRows] = await db.execute(

                `SELECT otp, otp_expires_at
                 FROM users
                 WHERE email = ?
                 LIMIT 1`,

                [email]

            );

            if (checkRows.length === 0) {

                return res.status(404).json({

                    success: false,

                    message: "User not found."

                });

            }

            const currentUser = checkRows[0];

            if (!currentUser.otp) {

                return res.status(400).json({

                    success: false,

                    message: "OTP not found. Please request a new OTP."

                });

            }

            if (
                !currentUser.otp_expires_at ||
                new Date(currentUser.otp_expires_at).getTime() <= Date.now()
            ) {

                await clearOTP(email);

                return res.status(400).json({

                    success: false,

                    message: "OTP has expired. Please request a new OTP."

                });

            }

            return res.status(400).json({

                success: false,

                message: "Invalid OTP."

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
//   "email": "test@gmail.com"
// }
// ============================================================

router.post("/resend-otp", resendOTPLimiter, async (req, res) => {

    const email = normalizeEmail(req.body?.email);

    try {

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

            `SELECT id, username, is_verified
             FROM users
             WHERE email = ?
             LIMIT 1`,

            [email]

        );

        if (users.length === 0) {

            return res.status(404).json({

                success: false,

                message: "User not found. Please register first."

            });

        }

        const user = users[0];

        // ----------------------------------------------------
        // CHECK VERIFICATION STATUS
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
            Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000
        );

        // ----------------------------------------------------
        // UPDATE OTP
        // ----------------------------------------------------

        const [updateResult] = await db.execute(

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

        if (updateResult.affectedRows !== 1) {

            return res.status(409).json({

                success: false,

                message: "Unable to update OTP. Please try again."

            });

        }

        // ----------------------------------------------------
        // SEND NEW OTP EMAIL
        // ----------------------------------------------------

        try {

            await sendOTPEmail(email, user.username, otp);

        } catch (emailError) {

            console.error(
                "RESEND EMAIL ERROR:",
                emailError.message
            );

            console.error(
                "SMTP ERROR CODE:",
                emailError.code || "N/A"
            );

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