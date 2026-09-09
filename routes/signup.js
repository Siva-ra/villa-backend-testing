/*const express = require("express");
const nodemailer = require("nodemailer");

const router = express.Router();
const db = require("../db/database");

const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: Number(process.env.EMAIL_PORT),
    secure: false,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

function isValidGmail(email) {
    return /^[a-zA-Z0-9._%+-]+@gmail\.com$/i.test(email);
}


// ============================================================
// SEND OTP
// ============================================================

router.post("/send-otp", async (req, res) => {
    try {
        const username = req.body.username?.trim();
        const mobile = req.body.mobile?.trim();
        const email = req.body.email?.trim().toLowerCase();
        const address = req.body.address?.trim();

        // Required fields
        if (!username || !mobile || !email || !address) {
            return res.status(400).json({
                success: false,
                message: "Username, mobile, email and address are required"
            });
        }

        // Gmail validation
        if (!isValidGmail(email)) {
            return res.status(400).json({
                success: false,
                message: "Please enter a valid Gmail address"
            });
        }

        // Admin email cannot register
        if (
            process.env.ADMIN_EMAIL &&
            email === process.env.ADMIN_EMAIL.toLowerCase()
        ) {
            return res.status(400).json({
                success: false,
                message: "This email is reserved for administrator"
            });
        }


        // ====================================================
        // CHECK USERNAME
        // ====================================================

        const [usernameRows] = await db.execute(
            "SELECT id FROM users WHERE username = ? LIMIT 1",
            [username]
        );

        if (usernameRows.length > 0) {
            return res.status(409).json({
                success: false,
                message: "Username already exists."
            });
        }


        // ====================================================
        // CHECK EMAIL
        // ====================================================

        const [emailRows] = await db.execute(
            "SELECT id, is_verified FROM users WHERE email = ? LIMIT 1",
            [email]
        );

        // Already verified
        if (emailRows.length > 0 && emailRows[0].is_verified === 1) {
            return res.status(409).json({
                success: false,
                message: "Gmail already exists."
            });
        }


        // ====================================================
        // GENERATE OTP
        // ====================================================

        const otp = generateOTP();

        // OTP valid for 5 minutes
        const expiry = new Date(Date.now() + 5 * 60 * 1000);


        // ====================================================
        // SAVE USER
        // ====================================================

        if (emailRows.length > 0) {

            // Existing but NOT verified account
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

            // New account
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


        // ====================================================
        // SEND EMAIL
        // ====================================================

        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: email,
            subject: "Unity Project - Email Verification OTP",
            text: `Hello ${username},

Your verification OTP is:

${otp}

This OTP will expire in 5 minutes.

Thank you.`
        });


        res.json({
            success: true,
            message: "OTP sent successfully to your Gmail"
        });

    } catch (error) {

        console.error("SEND OTP ERROR:", error);

        res.status(500).json({
            success: false,
            message: "Failed to send OTP"
        });
    }
});


// ============================================================
// VERIFY OTP
// ============================================================

router.post("/verify-otp", async (req, res) => {
    try {

        const email = req.body.email?.trim().toLowerCase();
        const otp = req.body.otp?.trim();

        if (!email || !otp) {
            return res.status(400).json({
                success: false,
                message: "Email and OTP are required"
            });
        }


        const [users] = await db.execute(
            `SELECT id, otp, otp_expires_at, is_verified
             FROM users
             WHERE email = ?
             LIMIT 1`,
            [email]
        );


        if (users.length === 0) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }


        const user = users[0];


        // Already verified
        if (user.is_verified === 1) {
            return res.status(400).json({
                success: false,
                message: "Email is already verified"
            });
        }


        // Wrong OTP
        if (user.otp !== otp) {
            return res.status(400).json({
                success: false,
                message: "Invalid OTP"
            });
        }


        // OTP expired
        if (
            !user.otp_expires_at ||
            new Date(user.otp_expires_at) < new Date()
        ) {
            return res.status(400).json({
                success: false,
                message: "OTP has expired. Please request a new OTP."
            });
        }


        // Verify account
        await db.execute(
            `UPDATE users
             SET is_verified = 1,
                 otp = NULL,
                 otp_expires_at = NULL
             WHERE email = ?`,
            [email]
        );


        res.json({
            success: true,
            message: "Email verified successfully",
            role: "user"
        });

    } catch (error) {

        console.error("VERIFY OTP ERROR:", error);

        res.status(500).json({
            success: false,
            message: "OTP verification failed"
        });
    }
});


// ============================================================
// RESEND OTP
// ============================================================

router.post("/resend-otp", async (req, res) => {
    try {

        const email = req.body.email?.trim().toLowerCase();

        if (!email) {
            return res.status(400).json({
                success: false,
                message: "Email is required"
            });
        }


        const [users] = await db.execute(
            `SELECT username, is_verified
             FROM users
             WHERE email = ?
             LIMIT 1`,
            [email]
        );


        if (users.length === 0) {
            return res.status(404).json({
                success: false,
                message: "User not found"
            });
        }


        const user = users[0];


        if (user.is_verified === 1) {
            return res.status(400).json({
                success: false,
                message: "Email is already verified"
            });
        }


        const otp = generateOTP();

        const expiry = new Date(Date.now() + 5 * 60 * 1000);


        await db.execute(
            `UPDATE users
             SET otp = ?,
                 otp_expires_at = ?
             WHERE email = ?`,
            [otp, expiry, email]
        );


        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: email,
            subject: "Unity Project - New OTP",
            text: `Hello ${user.username},

Your new verification OTP is:

${otp}

This OTP will expire in 5 minutes.

Thank you.`
        });


        res.json({
            success: true,
            message: "New OTP sent successfully"
        });

    } catch (error) {

        console.error("RESEND OTP ERROR:", error);

        res.status(500).json({
            success: false,
            message: "Failed to resend OTP"
        });
    }
});


module.exports = router;*/


const express = require("express");
const nodemailer = require("nodemailer");

const router = express.Router();
const db = require("../db/database");


// ============================================================
// EMAIL CONFIGURATION
// ============================================================

const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST,
    port: Number(process.env.EMAIL_PORT),
    secure: false,

    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});


// ============================================================
// GENERATE OTP
// ============================================================

function generateOTP() {

    return Math.floor(
        100000 + Math.random() * 900000
    ).toString();

}


// ============================================================
// GMAIL VALIDATION
// ============================================================

function isValidGmail(email) {

    return /^[a-zA-Z0-9._%+-]+@gmail\.com$/i.test(email);

}


// ============================================================
// SEND OTP
// POST /api/signup/send-otp
// ============================================================

router.post("/send-otp", async (req, res) => {

    try {

        const username = req.body.username?.trim();
        const mobile = req.body.mobile?.trim();
        const email = req.body.email?.trim().toLowerCase();
        const address = req.body.address?.trim();


        // ----------------------------------------------------
        // REQUIRED FIELDS
        // ----------------------------------------------------

        if (!username || !mobile || !email || !address) {

            return res.status(400).json({

                success: false,

                message:
                    "Username, mobile, email and address are required"

            });

        }


        // ----------------------------------------------------
        // GMAIL VALIDATION
        // ----------------------------------------------------

        if (!isValidGmail(email)) {

            return res.status(400).json({

                success: false,

                message:
                    "Please enter a valid Gmail address"

            });

        }


        // ----------------------------------------------------
        // ADMIN EMAIL CHECK
        // ----------------------------------------------------

        if (
            process.env.ADMIN_EMAIL &&
            email === process.env.ADMIN_EMAIL.trim().toLowerCase()
        ) {

            return res.status(400).json({

                success: false,

                message:
                    "This email is reserved for administrator"

            });

        }


        // ----------------------------------------------------
        // CHECK USERNAME
        // ----------------------------------------------------

        const [usernameRows] = await db.execute(

            `SELECT id
             FROM users
             WHERE username = ?
             LIMIT 1`,

            [username]

        );


        if (usernameRows.length > 0) {

            return res.status(409).json({

                success: false,

                message:
                    "Username already exists."

            });

        }


        // ----------------------------------------------------
        // CHECK GMAIL
        // ----------------------------------------------------

        const [emailRows] = await db.execute(

            `SELECT id, is_verified
             FROM users
             WHERE email = ?
             LIMIT 1`,

            [email]

        );


        // ----------------------------------------------------
        // GMAIL ALREADY VERIFIED
        // ----------------------------------------------------

        if (
            emailRows.length > 0 &&
            emailRows[0].is_verified == 1
        ) {

            return res.status(409).json({

                success: false,

                message:
                    "Gmail already exists."

            });

        }


        // ----------------------------------------------------
        // GENERATE OTP
        // ----------------------------------------------------

        const otp = generateOTP();

        const expiry =
            new Date(
                Date.now() + 5 * 60 * 1000
            );


        // ----------------------------------------------------
        // SAVE USER
        // ----------------------------------------------------

        if (emailRows.length > 0) {

            // Existing but unverified user

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

        }

        else {

            // New user

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
                VALUES
                (
                    ?, ?, ?, ?, ?, ?, 0, 'user'
                )`,

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
        // SEND OTP EMAIL
        // ----------------------------------------------------

        await transporter.sendMail({

            from: process.env.EMAIL_USER,

            to: email,

            subject:
                "Unity Project - Email Verification OTP",

            text:
`Hello ${username},

Your verification OTP is:

${otp}

This OTP will expire in 5 minutes.

If you did not request this verification, please ignore this email.

Thank you.`

        });


        // ----------------------------------------------------
        // SUCCESS
        // ----------------------------------------------------

        return res.json({

            success: true,

            message:
                "OTP sent successfully to your Gmail"

        });

    }


    catch (error) {

        console.error(
            "SEND OTP ERROR:",
            error
        );

        return res.status(500).json({

            success: false,

            message:
                "Failed to send OTP"

        });

    }

});


// ============================================================
// VERIFY OTP
// POST /api/signup/verify-otp
// ============================================================

router.post("/verify-otp", async (req, res) => {

    try {

        const email =
            req.body.email?.trim().toLowerCase();

        const otp =
            req.body.otp?.trim();


        // ----------------------------------------------------
        // VALIDATION
        // ----------------------------------------------------

        if (!email || !otp) {

            return res.status(400).json({

                success: false,

                message:
                    "Email and OTP are required"

            });

        }


        // ----------------------------------------------------
        // FIND USER
        // ----------------------------------------------------

        const [users] = await db.execute(

            `SELECT
                id,
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

                message:
                    "User not found"

            });

        }


        const user = users[0];


        // ----------------------------------------------------
        // ALREADY VERIFIED
        // ----------------------------------------------------

        if (user.is_verified == 1) {

            return res.status(400).json({

                success: false,

                message:
                    "Email is already verified"

            });

        }


        // ----------------------------------------------------
        // CHECK OTP
        // ----------------------------------------------------

        if (user.otp !== otp) {

            return res.status(400).json({

                success: false,

                message:
                    "Invalid OTP"

            });

        }


        // ----------------------------------------------------
        // CHECK OTP EXPIRY
        // ----------------------------------------------------

        if (
            !user.otp_expires_at ||
            new Date(user.otp_expires_at) < new Date()
        ) {

            return res.status(400).json({

                success: false,

                message:
                    "OTP has expired. Please request a new OTP."

            });

        }


        // ----------------------------------------------------
        // VERIFY USER
        // ----------------------------------------------------

        await db.execute(

            `UPDATE users
             SET
                is_verified = 1,
                otp = NULL,
                otp_expires_at = NULL
             WHERE email = ?`,

            [email]

        );


        // ----------------------------------------------------
        // SUCCESS
        // ----------------------------------------------------

        return res.json({

            success: true,

            message:
                "Email verified successfully",

            role:
                "user"

        });

    }


    catch (error) {

        console.error(
            "VERIFY OTP ERROR:",
            error
        );

        return res.status(500).json({

            success: false,

            message:
                "OTP verification failed"

        });

    }

});


// ============================================================
// RESEND OTP
// POST /api/signup/resend-otp
// ============================================================

router.post("/resend-otp", async (req, res) => {

    try {

        const email =
            req.body.email?.trim().toLowerCase();


        // ----------------------------------------------------
        // VALIDATION
        // ----------------------------------------------------

        if (!email) {

            return res.status(400).json({

                success: false,

                message:
                    "Email is required"

            });

        }


        // ----------------------------------------------------
        // FIND USER
        // ----------------------------------------------------

        const [users] = await db.execute(

            `SELECT
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

                message:
                    "User not found"

            });

        }


        const user = users[0];


        // ----------------------------------------------------
        // ALREADY VERIFIED
        // ----------------------------------------------------

        if (user.is_verified == 1) {

            return res.status(400).json({

                success: false,

                message:
                    "Email is already verified"

            });

        }


        // ----------------------------------------------------
        // GENERATE NEW OTP
        // ----------------------------------------------------

        const otp = generateOTP();

        const expiry =
            new Date(
                Date.now() + 5 * 60 * 1000
            );


        // ----------------------------------------------------
        // UPDATE OTP
        // ----------------------------------------------------

        await db.execute(

            `UPDATE users
             SET
                otp = ?,
                otp_expires_at = ?
             WHERE email = ?`,

            [
                otp,
                expiry,
                email
            ]

        );


        // ----------------------------------------------------
        // SEND NEW OTP
        // ----------------------------------------------------

        await transporter.sendMail({

            from: process.env.EMAIL_USER,

            to: email,

            subject:
                "Unity Project - New OTP",

            text:
`Hello ${user.username},

Your new verification OTP is:

${otp}

This OTP will expire in 5 minutes.

Thank you.`

        });


        // ----------------------------------------------------
        // SUCCESS
        // ----------------------------------------------------

        return res.json({

            success: true,

            message:
                "New OTP sent successfully"

        });

    }


    catch (error) {

        console.error(
            "RESEND OTP ERROR:",
            error
        );

        return res.status(500).json({

            success: false,

            message:
                "Failed to resend OTP"

        });

    }

});


module.exports = router;