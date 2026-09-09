const express = require("express");

const router = express.Router();

const db = require("../db/database");


// ============================================================
// LOGIN / VERIFY EMAIL
//
// POST
// /api/login/verify-email
// ============================================================

router.post("/verify-email", async (req, res) => {

    try {

        const email = req.body.email?.trim().toLowerCase();


        // ----------------------------------------------------
        // VALIDATION
        // ----------------------------------------------------

        if (!email) {

            return res.status(400).json({

                success: false,

                message:
                    "Please enter your email"

            });

        }


        // ----------------------------------------------------
        // ADMIN LOGIN
        // ----------------------------------------------------

        if (
            process.env.ADMIN_EMAIL &&
            email === process.env.ADMIN_EMAIL.trim().toLowerCase()
        ) {

            return res.json({

                success: true,

                message:
                    "Admin login successful",

                role:
                    "admin",

                email:
                    process.env.ADMIN_EMAIL

            });

        }


        // ----------------------------------------------------
        // USER LOGIN
        // ----------------------------------------------------

        const [users] = await db.execute(

            `SELECT
                id,
                username,
                mobile,
                email,
                address,
                is_verified,
                role
             FROM users
             WHERE email = ?
             LIMIT 1`,

            [email]

        );


        // ----------------------------------------------------
        // EMAIL NOT FOUND
        // ----------------------------------------------------

        if (users.length === 0) {

            return res.status(404).json({

                success: false,

                message:
                    "Email is not registered"

            });

        }


        const user = users[0];


        // ----------------------------------------------------
        // EMAIL NOT VERIFIED
        // ----------------------------------------------------

        if (user.is_verified != 1) {

            return res.status(403).json({

                success: false,

                message:
                    "Email is not verified. Please complete registration first."

            });

        }


        // ----------------------------------------------------
        // LOGIN SUCCESS
        // ----------------------------------------------------

        return res.json({

            success: true,

            message:
                "Login successful",

            userId:
                user.id,

            username:
                user.username,

            mobile:
                user.mobile,

            email:
                user.email,

            address:
                user.address,

            role:
                "user"

        });

    }


    catch (error) {

        console.error(
            "LOGIN ERROR:",
            error
        );


        return res.status(500).json({

            success: false,

            message:
                "Login failed"

        });

    }

});


module.exports = router;