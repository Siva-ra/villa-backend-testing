const express = require("express");

const router = express.Router();

const db = require("../db/database");


// ============================================================
// SAVE / UPDATE LIFT CONFIGURATION
//
// POST
// /api/configuration/save
// ============================================================

router.post("/save", async (req, res) => {

    try {

        const {
            userId,
            dimension,
            doorType,
            carFinish,
            floorFinish,
            ceilingType,
            ceilingFinish,
            operatingBoard,
            handRailType,
            handRailFinish,
            hallIndicator,
            hallLantern,
            hallButtonControl,
            totalPrice
        } = req.body;


        // ====================================================
        // VALIDATION
        // ====================================================

        if (!userId) {

            return res.status(400).json({

                success: false,

                message: "User ID is required"

            });

        }


        // ====================================================
        // GET USER
        // ====================================================

        const [users] = await db.execute(

            `SELECT
                id,
                username,
                email
             FROM users
             WHERE id = ?
             LIMIT 1`,

            [userId]

        );


        if (users.length === 0) {

            return res.status(404).json({

                success: false,

                message: "User not found"

            });

        }


        const user = users[0];


        // ====================================================
        // INSERT OR UPDATE
        // ====================================================

        const [existing] = await db.execute(

            `SELECT id
             FROM lift_configurations
             WHERE user_id = ?
             LIMIT 1`,

            [userId]

        );


        if (existing.length > 0) {

            // =================================================
            // UPDATE EXISTING CONFIGURATION
            // =================================================

            await db.execute(

                `UPDATE lift_configurations

                 SET
                    username = ?,
                    email = ?,
                    dimension = ?,
                    door_type = ?,
                    car_finish = ?,
                    floor_finish = ?,
                    ceiling_type = ?,
                    ceiling_finish = ?,
                    operating_board = ?,
                    hand_rail_type = ?,
                    hand_rail_finish = ?,
                    hall_indicator = ?,
                    hall_lantern = ?,
                    hall_button_control = ?,
                    total_price = ?

                 WHERE user_id = ?`,

                [
                    user.username,
                    user.email,
                    dimension,
                    doorType,
                    carFinish,
                    floorFinish,
                    ceilingType,
                    ceilingFinish,
                    operatingBoard,
                    handRailType,
                    handRailFinish,
                    hallIndicator,
                    hallLantern,
                    hallButtonControl,
                    totalPrice || 0,
                    userId
                ]

            );

        } else {

            // =================================================
            // CREATE NEW CONFIGURATION
            // =================================================

            await db.execute(

                `INSERT INTO lift_configurations

                (
                    user_id,
                    username,
                    email,
                    dimension,
                    door_type,
                    car_finish,
                    floor_finish,
                    ceiling_type,
                    ceiling_finish,
                    operating_board,
                    hand_rail_type,
                    hand_rail_finish,
                    hall_indicator,
                    hall_lantern,
                    hall_button_control,
                    total_price
                )

                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,

                [
                    userId,
                    user.username,
                    user.email,
                    dimension,
                    doorType,
                    carFinish,
                    floorFinish,
                    ceilingType,
                    ceilingFinish,
                    operatingBoard,
                    handRailType,
                    handRailFinish,
                    hallIndicator,
                    hallLantern,
                    hallButtonControl,
                    totalPrice || 0
                ]

            );

        }


        // ====================================================
        // SUCCESS
        // ====================================================

        res.json({

            success: true,

            message: "Lift configuration saved successfully",

            userId: user.id,

            username: user.username,

            email: user.email

        });


    } catch (error) {

        console.error(
            "SAVE CONFIGURATION ERROR:",
            error
        );

        res.status(500).json({

            success: false,

            message: "Failed to save lift configuration"

        });

    }

});


// ============================================================
// GET USER CONFIGURATION
//
// GET
// /api/configuration/:userId
// ============================================================

router.get("/:userId", async (req, res) => {

    try {

        const userId = req.params.userId;


        const [rows] = await db.execute(

            `SELECT
                id,
                user_id,
                username,
                email,
                dimension,
                door_type,
                car_finish,
                floor_finish,
                ceiling_type,
                ceiling_finish,
                operating_board,
                hand_rail_type,
                hand_rail_finish,
                hall_indicator,
                hall_lantern,
                hall_button_control,
                total_price,
                updated_at

             FROM lift_configurations

             WHERE user_id = ?

             LIMIT 1`,

            [userId]

        );


        if (rows.length === 0) {

            return res.status(404).json({

                success: false,

                message: "No lift configuration found"

            });

        }


        res.json({

            success: true,

            configuration: rows[0]

        });


    } catch (error) {

        console.error(
            "GET CONFIGURATION ERROR:",
            error
        );

        res.status(500).json({

            success: false,

            message: "Failed to get configuration"

        });

    }

});


module.exports = router;